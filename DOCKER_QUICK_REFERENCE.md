# Docker Quick Reference Guide

## ⚡ Quick Commands

### Start Development Environment
```bash
docker-compose up -d
```

### Check Status
```bash
docker-compose ps
```

### View Logs
```bash
docker-compose logs -f
```

### Stop Everything
```bash
docker-compose down
```

### Rebuild Services
```bash
docker-compose up -d --build
```

---

## 🔍 Service Endpoints

| Service | Port | Endpoint | Purpose |
|---------|------|----------|---------|
| Backend | 3000 | http://localhost:3000 | Express API + Socket.IO |
| ML Service | 8000 | http://localhost:8000 | Face Recognition API |
| Redis | 6379 | localhost:6379 | Job Queue (Internal) |
| Milvus | 19530 | localhost:19530 | Vector DB (Internal) |
| Milvus HTTP | 9091 | http://localhost:9091 | Health Check |

---

## 📋 Service Dependencies

```
Backend (3000)
├─ Milvus (19530) ✓ Must be healthy
├─ Redis (6379) ✓ Must be healthy
└─ ML Service (8000) ✓ Must be running

Worker
├─ Redis (6379) ✓ Must be healthy
└─ ML Service (8000) ✓ Must be running

ML Service (8000)
└─ Milvus (19530) ✓ Must be healthy

Redis (6379)
└─ No dependencies

Milvus (19530)
└─ No dependencies
```

---

## 🛠️ Troubleshooting

### Milvus not healthy
```bash
# Check Milvus logs
docker-compose logs milvus

# Wait 60 seconds, check health
curl http://localhost:9091/healthz

# Restart if needed
docker-compose restart milvus
```

### Redis not connecting
```bash
# Test connection
redis-cli -h localhost ping

# Check logs
docker-compose logs redis

# Restart if needed
docker-compose restart redis
```

### Backend failing to start
```bash
# Check logs
docker-compose logs backend

# Verify .env.backend exists and is valid
cat .env.backend

# Restart
docker-compose restart backend
```

### ML Service GPU issues
```bash
# Check if GPU available
docker run --rm --gpus all nvidia/cuda:12.1.0-base nvidia-smi

# If no GPU, update .env.ml_service:
# FORCE_GPU=False

# Rebuild and restart
docker-compose up -d --build ml_service
```

### Worker not processing jobs
```bash
# Check logs
docker-compose logs worker

# Verify Redis is running
docker-compose ps redis

# Check queue status
redis-cli -h localhost LLEN bull:face-recognition:*

# Restart
docker-compose restart worker
```

---

## 📊 Health Checks

### Test Milvus
```bash
curl -X GET http://localhost:9091/healthz
# Expected: 200 OK
```

### Test Redis
```bash
redis-cli -h localhost PING
# Expected: PONG
```

### Test Backend
```bash
curl -X GET http://localhost:3000/
# Expected: JSON response
```

### Test ML Service
```bash
curl -X GET http://localhost:8000/health
# Expected: Health status JSON
```

---

## 🔄 Restart Strategies

### Restart Single Service
```bash
docker-compose restart service-name
```

### Restart With Rebuild
```bash
docker-compose up -d --build service-name
```

### Full Reset (Remove & Recreate)
```bash
docker-compose down
docker-compose up -d
```

### Clean Everything (Including Volumes)
```bash
docker-compose down -v
docker-compose up -d
```

---

## 📝 Log Levels

### Set Log Level in .env files:
- `LOG_LEVEL=debug` (Most detailed)
- `LOG_LEVEL=info` (Standard)
- `LOG_LEVEL=error` (Only errors)

---

## 🚀 Development Tips

### Hot Reload
- Backend: Auto-restart with nodemon (volumes mounted)
- ML Service: Restart required (copy volume mounted)

### Access Container Shell
```bash
docker-compose exec backend sh
docker-compose exec ml_service bash
```

### Database Setup
```bash
# Once PostgreSQL is added to docker-compose.yml:
docker-compose exec backend npm run db:migrate
```

### Test Face Recognition
```bash
curl -X POST http://localhost:8000/recognize \
  -F "file=@path/to/image.jpg"
```

---

## ⚙️ Configuration Files

| File | Purpose | Required |
|------|---------|----------|
| `.env.backend` | Backend variables | ✅ Yes |
| `.env.ml_service` | ML Service variables | ✅ Yes |
| `.env.backend.example` | Backend template | ℹ️ Reference |
| `.env.ml_service.example` | ML Service template | ℹ️ Reference |
| `docker-compose.yml` | Service definitions | ✅ Yes |

---

## 📚 Full Documentation

See:
- `DOCKER_SETUP.md` - Comprehensive setup guide
- `DOCKER_SUMMARY.md` - Issue resolution details

---

## 🎯 Startup Checklist

- [ ] `.env.backend` exists and configured
- [ ] `.env.ml_service` exists and configured
- [ ] Docker and Docker Compose installed
- [ ] NVIDIA Docker Runtime installed (if using GPU)
- [ ] Run `docker-compose up -d`
- [ ] Wait 60 seconds for Milvus startup
- [ ] Run `docker-compose ps` (all Up)
- [ ] Test endpoints with curl
- [ ] Check logs for errors
- [ ] Ready for development!

---

## 🔑 Key Environment Variables

### Backend (.env.backend)
- `REDIS_HOST=redis` (Docker)
- `REDIS_HOST=localhost` (Local)
- `ML_SERVICE_URL=http://ml_service:8000` (Docker)
- `ML_SERVICE_URL=http://localhost:8000` (Local)

### ML Service (.env.ml_service)
- `MILVUS_HOST=milvus` (Docker)
- `MILVUS_HOST=localhost` (Local)
- `FORCE_GPU=True` (GPU available)
- `FORCE_GPU=False` (CPU only)

---

Generated: February 3, 2026
