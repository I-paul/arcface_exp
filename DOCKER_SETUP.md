# Docker Development Configuration - Setup & Fixes

## Overview
This document details the development Docker setup, conflicts found, and fixes applied to ensure Redis and Milvus are properly configured and working.

---

## Issues Found & Fixed

### 1. **Missing Redis Service** ✅
**Issue:** The original `docker-compose.yml` was missing the Redis service entirely, but the backend code uses BullMQ (Redis queue) for face recognition jobs.

**Files Affected:**
- `Backend/src/queues/face.queue.js` - Uses Redis for job queue
- `Backend/src/workers/face.worker.js` - Uses Redis to process jobs

**Fix:** Added complete Redis service definition with:
- Proper health checks
- Persistent storage (appendonly)
- Network connectivity
- Port mapping (6379)

---

### 2. **Incorrect env_file Paths** ✅
**Issue:** `docker-compose.yml` referenced `backend/.env` and `ml_service/.env` which don't exist.

**Fix:** Changed to root-level `.env.backend` and `.env.ml_service` files that are now created.

---

### 3. **Duplicate CMD in ml_service Dockerfile** ✅
**Issue:** The Dockerfile had two CMD instructions, only the last one executes.

```dockerfile
# BEFORE (incorrect)
CMD ["python3", "main.py"]
CMD ["python3", "main.py"]  # This overwrites the first one
```

**Fix:** Removed duplicate CMD, optimized Dockerfile with:
- Added system dependencies (libsm6, libxext6, libxrender-dev) required by OpenCV
- Proper dependency cleanup to reduce image size
- Single, clear CMD instruction

---

### 4. **Missing Networks & Service Dependencies** ✅
**Issue:** Services weren't properly networked or had missing dependency configurations.

**Fixes Applied:**
- Added `app-network` bridge network for all services
- Configured proper health checks for startup ordering:
  - Milvus: waits 60s before accepting connections
  - Redis: quick health check (10s start period)
- Used `condition: service_healthy` for services that need to be ready
- Added `node_modules` volume for backend to prevent issues

---

### 5. **Missing Worker Service** ✅
**Issue:** No worker service defined for processing Redis queue jobs.

**Fix:** Added dedicated worker service that:
- Uses same image as backend
- Runs `node src/workers/face.worker.js` command
- Depends on Redis and ML Service
- Has access to same environment variables

---

### 6. **Hardcoded Redis/Milvus Hosts** ✅
**Issue:** Code had hardcoded `redis` and `localhost` hosts, not flexible for different environments.

**Files Fixed:**
- `Backend/src/queues/face.queue.js` - Now uses `REDIS_HOST` env var
- `Backend/src/workers/face.worker.js` - Now uses `REDIS_HOST` env var

**Pattern:**
```javascript
// BEFORE
host: 'redis'

// AFTER
host: process.env.REDIS_HOST || 'localhost'
```

---

### 7. **Optimized Backend Dockerfile** ✅
**Issue:** Used full Node image (node:18) instead of lightweight alpine version.

**Fix:** Changed to `node:18-alpine` for smaller image size and faster builds.

---

### 8. **Missing GPU Configuration in Backend Dockerfile** ✅
**Issue:** Backend Dockerfile didn't reserve GPU, but worker calls ML service which needs GPU.

**Fix:** Added GPU reservation to ml_service with proper NVIDIA Docker configuration.

---

## Environment Variables Configuration

### Backend (.env.backend)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `development` | Node environment |
| `PORT` | `3000` | Backend server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `DB_NAME` | `arcface_db` | Database name |
| `REDIS_HOST` | `redis` | Redis service name (Docker) |
| `REDIS_PORT` | `6379` | Redis port |
| `ML_SERVICE_URL` | `http://ml_service:8000` | ML Service endpoint |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend CORS origin |
| `LOG_LEVEL` | `debug` | Logging level |

### ML Service (.env.ml_service)

| Variable | Value | Purpose |
|----------|-------|---------|
| `PYTHONUNBUFFERED` | `1` | Real-time Python output |
| `MILVUS_HOST` | `milvus` | Milvus service name (Docker) |
| `MILVUS_PORT` | `19530` | Milvus port |
| `FORCE_GPU` | `True` | Enable GPU support |
| `GPU_MEMORY_FRACTION` | `0.8` | GPU memory allocation (80%) |
| `FACE_DETECTION_THRESHOLD` | `0.5` | Face detection confidence |
| `FACE_RECOGNITION_THRESHOLD` | `0.6` | Face recognition match threshold |
| `LOG_LEVEL` | `INFO` | Logging level |
| `SERVICE_HOST` | `0.0.0.0` | Service bind address |
| `SERVICE_PORT` | `8000` | Service port |

---

## Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                    │
│               (app-network bridge)                  │
└─────────────────────────────────────────────────────┘
                         │
        ┌────────────┬───┴───┬──────────┬──────────┐
        │            │       │          │          │
    ┌─────────┐  ┌──────┐  ┌───────┐  ┌────────┐ ┌──────┐
    │ Backend │  │Redis │  │Milvus │  │ Worker │ │  ML  │
    │(Express)│  │Queue │  │ DB    │  │Process │ │Service│
    │ 3000    │  │ 6379 │  │19530  │  │(Queue) │ │ 8000 │
    └────┬────┘  └──────┘  └───────┘  └────────┘ └──────┘
         │          ↑          ↑
         └──────────┼──────────┘
              Depends On
```

### Service Dependencies

1. **Backend** depends on:
   - Redis (job queue)
   - ML Service (face recognition)
   - Milvus (vector database)

2. **Worker** depends on:
   - Redis (reads/processes jobs)
   - ML Service (calls recognition API)

3. **ML Service** depends on:
   - Milvus (stores face embeddings)

---

## Health Checks

### Milvus
- **Endpoint:** `http://localhost:9091/healthz`
- **Check Interval:** 30 seconds
- **Start Period:** 60 seconds (allows startup time)
- **Timeout:** 10 seconds
- **Retries:** 5 attempts

### Redis
- **Command:** `redis-cli ping`
- **Check Interval:** 30 seconds
- **Start Period:** 10 seconds
- **Timeout:** 10 seconds
- **Retries:** 5 attempts

### Backend / Worker
- No health check (auto-restarts on failure)

### ML Service
- No built-in health check (depends on Milvus readiness)

---

## Running the Development Environment

### Prerequisites
- Docker & Docker Compose installed
- NVIDIA Docker Runtime (for GPU support)
- `.env.backend` and `.env.ml_service` files created

### Start All Services
```bash
docker-compose up -d
```

### Check Service Status
```bash
docker-compose ps
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ml_service
docker-compose logs -f backend
docker-compose logs -f redis
docker-compose logs -f milvus
```

### Test Services

#### Milvus Health
```bash
curl -X GET http://localhost:9091/healthz
```

#### Redis Connection
```bash
redis-cli -h localhost ping
```

#### ML Service Health
```bash
curl -X GET http://localhost:8000/health
```

#### Backend API
```bash
curl -X GET http://localhost:3000/
```

### Stop All Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

---

## Troubleshooting

### Milvus Connection Issues
- Check if Milvus is healthy: `docker-compose ps`
- Wait at least 60 seconds after startup
- Check logs: `docker-compose logs milvus`
- Verify network: Services must be on same network

### Redis Connection Issues
- Verify Redis is running: `docker-compose ps`
- Test connection: `redis-cli -h localhost ping`
- Check logs: `docker-compose logs redis`

### GPU Not Available
- Verify NVIDIA Docker: `docker run --rm --gpus all nvidia/cuda:12.1.0-base nvidia-smi`
- Check .env.ml_service: `FORCE_GPU=False` for CPU mode
- Update ML Service startup: `FORCE_GPU=False`

### Worker Not Processing Jobs
- Check Redis connection: `docker-compose logs worker`
- Verify Redis is running: `docker-compose ps`
- Check queue status: `redis-cli -h localhost LLEN bull:face-recognition:*`

### Port Conflicts
- Change port in docker-compose.yml: `"<host-port>:<container-port>"`
- Update .env files with new ports
- Restart services: `docker-compose restart`

---

## File Structure

```
arcface_exp/
├── docker-compose.yml           # Development Docker Compose
├── docker-compose.prod.yml.bak  # Production reference (backup)
├── .env.backend                 # Backend environment variables
├── .env.ml_service              # ML Service environment variables
├── .env.backend.example         # Backend template
├── .env.ml_service.example      # ML Service template
├── Backend/
│   ├── Dockerfile               # ✅ Fixed - Uses alpine Node
│   ├── package.json
│   └── src/
│       ├── queues/face.queue.js         # ✅ Fixed - Uses env vars
│       ├── workers/face.worker.js       # ✅ Fixed - Uses env vars
│       ├── index.js
│       └── ... (other files)
├── ml_service/
│   ├── Dockerfile               # ✅ Fixed - Removed duplicate CMD
│   ├── main.py
│   ├── requirements.txt
│   └── ... (other files)
└── ... (other directories)
```

---

## Next Steps

1. ✅ Update `.env.backend` with your PostgreSQL credentials
2. ✅ Update `.env.ml_service` if GPU not available (set `FORCE_GPU=False`)
3. ✅ Run `docker-compose up -d` to start all services
4. ✅ Monitor logs to ensure all services start correctly
5. ✅ Test endpoints to verify functionality

---

## Version Information

| Component | Version | Notes |
|-----------|---------|-------|
| Milvus | v2.3.4 | Vector database for face embeddings |
| Redis | 7 | Job queue backend |
| Node | 18-alpine | Backend API server |
| Python | 3.10+ | ML Service (via CUDA image) |
| CUDA | 12.1.0 | GPU support for face recognition |

---

## References

- [Milvus Documentation](https://milvus.io/docs)
- [Redis Documentation](https://redis.io/docs/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
