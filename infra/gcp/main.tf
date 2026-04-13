terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "mockstack-tfstate"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Variables ────────────────────────────────────────────────────────────────

variable "project_id" { type = string }
variable "region" { type = string; default = "us-central1" }
variable "env" { type = string; default = "prod" }
variable "db_user" { type = string; default = "mockstack" }
variable "db_password" { type = string; sensitive = true }
variable "jwt_secret" { type = string; sensitive = true }
variable "image_tag" { type = string; default = "latest" }

locals {
  artifact_registry = "${var.region}-docker.pkg.dev/${var.project_id}/mockstack"
  db_instance_name  = "mockstack-${var.env}"
  redis_name        = "mockstack-${var.env}"
}

# ── Artifact Registry ────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "mockstack"
  format        = "DOCKER"
}

# ── Cloud SQL (PostgreSQL 16) ─────────────────────────────────────────────────

resource "google_sql_database_instance" "postgres" {
  name             = local.db_instance_name
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = "db-g1-small"
    availability_type = var.env == "prod" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 20

    backup_configuration {
      enabled            = true
      start_time         = "03:00"
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }
  deletion_protection = var.env == "prod"
}

resource "google_sql_database" "db" {
  name     = "mockstack"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ── Memorystore (Redis 7) ─────────────────────────────────────────────────────

resource "google_redis_instance" "cache" {
  name           = local.redis_name
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
  redis_version  = "REDIS_7_0"

  authorized_network = google_compute_network.vpc.id
}

# ── VPC ───────────────────────────────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  name                    = "mockstack-${var.env}-vpc"
  auto_create_subnetworks = true
}

# ── Secret Manager ───────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "mockstack-jwt-secret-${var.env}"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "mockstack-db-password-${var.env}"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

# ── Service Account ───────────────────────────────────────────────────────────

resource "google_service_account" "app_sa" {
  account_id   = "mockstack-app-${var.env}"
  display_name = "Mockstack App Service Account (${var.env})"
}

resource "google_project_iam_member" "sa_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "sa_secret" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# ── Cloud Run: chat-service ───────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "chat_service" {
  name     = "chat-service-${var.env}"
  location = var.region

  template {
    service_account = google_service_account.app_sa.email
    scaling { max_instance_count = 10; min_instance_count = 1 }

    containers {
      image = "${local.artifact_registry}/chat-service:${var.image_tag}"
      ports { container_port = 8000 }

      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }

      env {
        name  = "ENV"
        value = var.env
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = "mockstack-db-url-${var.env}"
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      liveness_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 10
        period_seconds        = 30
      }
      startup_probe {
        http_get { path = "/health" }
        failure_threshold = 15
        period_seconds    = 5
      }
    }

    vpc_access {
      network_interfaces { network = google_compute_network.vpc.name }
      egress = "PRIVATE_RANGES_ONLY"
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "chat_public" {
  location = google_cloud_run_v2_service.chat_service.location
  name     = google_cloud_run_v2_service.chat_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Cloud Run: ai-service ─────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "ai_service" {
  name     = "ai-service-${var.env}"
  location = var.region

  template {
    service_account = google_service_account.app_sa.email
    scaling { max_instance_count = 5; min_instance_count = 1 }

    containers {
      image = "${local.artifact_registry}/ai-service:${var.image_tag}"
      ports { container_port = 50051 }

      resources {
        limits = { cpu = "1", memory = "256Mi" }
      }
    }

    vpc_access {
      network_interfaces { network = google_compute_network.vpc.name }
      egress = "PRIVATE_RANGES_ONLY"
    }
  }
}

# ── Cloud Run Job: workers ────────────────────────────────────────────────────

resource "google_cloud_run_v2_job" "workers" {
  name     = "workers-${var.env}"
  location = var.region

  template {
    template {
      service_account = google_service_account.app_sa.email
      max_retries     = 3

      containers {
        image = "${local.artifact_registry}/workers:${var.image_tag}"
        resources { limits = { cpu = "500m", memory = "256Mi" } }
      }

      vpc_access {
        network_interfaces { network = google_compute_network.vpc.name }
        egress = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "chat_service_url" { value = google_cloud_run_v2_service.chat_service.uri }
output "db_instance_connection_name" { value = google_sql_database_instance.postgres.connection_name }
output "redis_host" { value = google_redis_instance.cache.host }
