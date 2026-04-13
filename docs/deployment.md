# Deployment Guide

## Prerequisites

- GCP Project with billing enabled
- `gcloud` CLI authenticated
- Terraform >= 1.6
- Docker (for local builds)

## Environments

| Env | Branch | Cloud Run | Cloud SQL Tier |
|---|---|---|---|
| dev | any | — (local Docker) | — |
| staging | develop | Cloud Run | db-g1-small (ZONAL) |
| prod | main | Cloud Run | db-g1-small (REGIONAL) |

## First-Time GCP Setup

```bash
cd infra/gcp

# Copy and fill in your variables
cp terraform.tfvars.example terraform.tfvars

# Create state bucket (once)
gsutil mb gs://mockstack-tfstate

# Init and apply
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## CI/CD (GitHub Actions)

1. Add these GitHub Secrets:
   - `GCP_PROJECT_ID`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SA_EMAIL`
   - `GCP_REGION` (e.g. `us-central1`)

2. Push to `main` → `.github/workflows/deploy.yml` runs automatically.

## Database Migrations

Migrations run automatically in CI before deploying new service revisions.
Manual run:

```bash
cd chat-service
DATABASE_URL=postgresql://mock:mock@<cloud-sql-proxy-host>:5432/mockstack \
  alembic upgrade head
```

## Environment Variables Reference

### chat-service (production)

| Variable | Required | Description |
|---|---|---|
| DATABASE_URL | ✅ | Cloud SQL asyncpg URL |
| REDIS_URL | ✅ | Memorystore URL |
| JWT_SECRET | ✅ | Strong random secret (32+ chars) |
| ENV | ✅ | `production` |
| CORS_ORIGINS | ✅ | Comma-separated allowed origins |
| AI_GRPC_TARGET | ✅ | `ai-service:50051` (internal) |

### workers (production)

| Variable | Required | Description |
|---|---|---|
| DATABASE_URL | ✅ | Cloud SQL asyncpg URL |
| REDIS_URL | ✅ | Memorystore URL |
| MAX_RETRIES | ✅ | Job retry attempts (default: 3) |

## Health Checks

| Endpoint | Expected |
|---|---|
| `GET /health` (chat-service) | `{"status": "ok"}` |
| Redis `PING` | `PONG` |
| Cloud SQL `pg_isready` | exit 0 |

## Scaling

- **chat-service**: Cloud Run autoscales 1–10 instances by CPU/concurrency.
- **ai-service**: Cloud Run autoscales 1–5 instances (CPU-bound).
- **workers**: Cloud Run Job, scheduled or triggered by queue depth.
- **PostgreSQL**: Scale up Cloud SQL tier manually; consider read replicas for analytics queries.

## Rollback

```bash
# Roll back Cloud Run to previous revision
gcloud run services update-traffic chat-service-prod \
  --to-revisions=PREVIOUS_REVISION=100 --region us-central1

# Roll back DB migration
cd chat-service && alembic downgrade -1
```

## Operational Runbooks

### High CPU on chat-service
1. Check `/docs` is disabled (set `ENV=production`)
2. Check rate limit keys in Redis (`KEYS ratelimit:*`)
3. Scale up min-instances or upgrade Cloud Run CPU allocation

### Worker DLQ growing
1. Inspect `queue:dlq:queue:reminders` and `queue:dlq:queue:analytics` in Redis
2. Fix the root cause (DB connectivity, schema mismatch)
3. Re-enqueue from DLQ after fix

### DB connections exhausted
1. Check `db_pool_size` + `db_max_overflow` settings
2. Consider adding PgBouncer as a connection pooler
3. Review slow queries via Cloud SQL Query Insights
