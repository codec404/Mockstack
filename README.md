# Mockstack — AI Mock Interview Platform

Production-grade, full-stack mock interview platform. Practice DSA, CS Fundamentals, LLD, and HLD with structured AI-generated feedback.

## Architecture

```
Frontend (Angular)  →  chat-service (FastAPI/Python)  →  ai-service (gRPC/Python)
                                ↓
                         PostgreSQL 16
                                ↓
                          workers (Python)
                         Redis (queue/cache)
```

## Services

| Service | Port | Description |
|---|---|---|
| frontend | 4200 (dev) / 80 (prod) | Angular SPA |
| chat-service | 8000 | REST API: auth, interviews, scheduling, analytics |
| ai-service | 50051 | gRPC: question generation, answer evaluation, report |
| workers | — | Background: reminders, analytics materialization |
| postgres | 5432 | Primary datastore |
| redis | 6379 | Queue broker, rate limit state, session tokens |

## Quick Start (Local Docker)

```bash
# 1. Copy env files
cp chat-service/.env.example chat-service/.env
cp workers/.env.example workers/.env

# 2. Build and start all services
docker compose -f docker-compose.full.yml up --build -d

# 3. Open frontend
open http://localhost:4200

# 4. API docs (dev mode only)
open http://localhost:8000/docs
```

## Running Tests

```bash
# chat-service
cd chat-service && pip install -r requirements.txt && pytest

# ai-service
cd ai-service && pip install -r requirements.txt pytest pytest-asyncio && pytest

# workers
cd workers && pip install -r requirements.txt && pytest
```

## Database Migrations (Alembic)

```bash
cd chat-service

# Apply migrations
alembic upgrade head

# Generate a new migration after model changes
alembic revision --autogenerate -m "your migration name"

# Rollback one step
alembic downgrade -1
```

## API Contracts

See [`docs/contracts.md`](docs/contracts.md) for full REST API and gRPC contracts.

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for GCP Cloud Run / Cloud SQL / Memorystore deployment guide.

Terraform infrastructure: [`infra/gcp/`](infra/gcp/)

## Production Checklist

- [ ] Set strong `JWT_SECRET`, `DB_PASSWORD` via GCP Secret Manager
- [ ] Restrict `CORS_ORIGINS` to your domain
- [ ] Run `alembic upgrade head` before deploying new service revision
- [ ] Set `ENV=production` to disable `/docs` and `/redoc`
- [ ] Enable Cloud SQL private IP + VPC connector
- [ ] Configure Cloud Armor WAF rules on the load balancer
