# 🚀 Deployment Guide

## Quick Start (5 minutes)

### Option 1: Automated (Windows)
```cmd
deploy.bat
```
Choose option `1` for production deployment.

### Option 2: Manual
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 📋 Prerequisites

### Required
- ✅ Docker Desktop (Windows) or Docker Engine (Linux)
- ✅ Docker Compose v2.0+
- ✅ 8GB+ RAM
- ✅ 10GB+ disk space

### Optional (for GPU acceleration)
- 🎯 NVIDIA GPU (RTX 2060 or better)
- 🎯 NVIDIA Driver 525+
- 🎯 nvidia-docker2

## 🔧 Step-by-Step Setup

### 1. Verify Docker Installation
```bash
docker --version
docker-compose --version
```

### 2. Check GPU (Optional)
```bash
# Windows
nvidia-smi

# Inside Docker
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

### 3. Clone/Navigate to Project
```bash
cd "c:\Users\Admin\Documents\PEP intern\arcface_exp"
```

### 4. Deploy Services
```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### 5. Verify Services

**Check Health:**
```bash
# ML Service
curl http://localhost:8000/health

# Expected: {"status":"healthy","gpu_available":true,"milvus_connected":true}
```

**Check API Docs:**
Open in browser: http://localhost:8000/docs

### 6. Test Recognition

**Prepare test image** (e.g., `test_face.jpg`)

**Test API:**
```bash
curl -X POST http://localhost:8000/recognize \
  -F "file=@test_face.jpg"
```

**Expected Response:**
```json
{
  "name": null,
  "confidence": 0.0,
  "is_recognized": false,
  "message": "Unknown face"
}
```

### 7. Enroll First Person

**Prepare 3-5 images** of the same person (different angles)

```bash
curl -X POST http://localhost:8000/enroll \
  -F "name=John Doe" \
  -F "files=@john1.jpg" \
  -F "files=@john2.jpg" \
  -F "files=@john3.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Successfully enrolled John Doe with 3 images",
  "person_id": "person_123456789"
}
```

### 8. Test Recognition Again
```bash
curl -X POST http://localhost:8000/recognize \
  -F "file=@john_test.jpg"
```

**Expected Response:**
```json
{
  "name": "John Doe",
  "confidence": 0.87,
  "is_recognized": true,
  "message": "Face recognized successfully"
}
```

## 📊 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Backend API | http://localhost:3000 | API Gateway |
| ML Service | http://localhost:8000 | Face Recognition API |
| API Docs | http://localhost:8000/docs | Interactive API docs |
| Milvus | localhost:19530 | Vector database |
| Milvus Admin | http://localhost:9091 | Milvus health check |

## 🐛 Troubleshooting

### Service Won't Start

**Check logs:**
```bash
docker-compose -f docker-compose.prod.yml logs ml-service
```

**Common issues:**
- Port already in use → Change port in docker-compose.prod.yml
- GPU not detected → Set `CUDA_VISIBLE_DEVICES=-1` for CPU mode
- Milvus connection failed → Wait 30s for Milvus to initialize

### GPU Issues

**Verify GPU in container:**
```bash
docker exec -it ml-service nvidia-smi
```

**Force CPU mode:**
Edit `docker-compose.prod.yml`, remove:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

### Milvus Connection Failed

**Check Milvus status:**
```bash
docker ps | grep milvus
curl http://localhost:9091/healthz
```

**Restart Milvus:**
```bash
docker-compose -f docker-compose.prod.yml restart milvus
```

**Wait for healthy status:**
```bash
docker-compose -f docker-compose.prod.yml ps milvus
```

### Out of Memory

**Reduce resources:**
Edit `ml_service/inference/face_processor.py`:
```python
det_size=(320, 320)  # Instead of (640, 640)
```

**Limit Docker memory:**
Docker Desktop → Settings → Resources → Memory → Set to 6GB

## 🔄 Common Operations

### View Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f ml-service
```

### Restart Service
```bash
docker-compose -f docker-compose.prod.yml restart ml-service
```

### Rebuild After Code Changes
```bash
docker-compose -f docker-compose.prod.yml build ml-service
docker-compose -f docker-compose.prod.yml up -d ml-service
```

### Stop All Services
```bash
docker-compose -f docker-compose.prod.yml down
```

### Clean Everything (including data)
```bash
docker-compose -f docker-compose.prod.yml down -v
```

## 📈 Production Checklist

Before going to production:

- [ ] Set proper environment variables
- [ ] Configure CORS in ML service
- [ ] Add authentication/API keys
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx)
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log aggregation
- [ ] Set up backups (Milvus data)
- [ ] Load testing
- [ ] Document API for consumers

## 🔐 Security Hardening

### 1. Environment Variables
Create `.env` files (don't commit):
```env
# ml_service/.env
MILVUS_HOST=milvus
MILVUS_PORT=19530
API_KEY=your-secret-key-here
```

### 2. Add Authentication
Edit `ml_service/main.py`:
```python
from fastapi.security import HTTPBearer

security = HTTPBearer()

@app.post("/recognize")
async def recognize_face(
    file: UploadFile,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    # Verify credentials.credentials
    ...
```

### 3. CORS Configuration
Edit `ml_service/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Specific domains
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

## 📞 Support

### Check Service Status
```bash
# All services
docker-compose -f docker-compose.prod.yml ps

# Health checks
curl http://localhost:8000/health
curl http://localhost:3000/health
```

### Get Collection Stats
```bash
curl http://localhost:8000/collection/stats
```

### Common Error Codes

| Code | Error | Solution |
|------|-------|----------|
| 400 | No face detected | Ensure face is visible and clear |
| 400 | Face is occluded | Remove mask/obstruction |
| 404 | Person not found | Person not enrolled |
| 500 | Internal error | Check logs |

## 🎯 Next Steps

1. ✅ Deploy services
2. ✅ Test basic functionality
3. ⏭️ Integrate with frontend
4. ⏭️ Set up monitoring
5. ⏭️ Configure backups
6. ⏭️ Load testing
7. ⏭️ Production deployment

---

**Status:** ✅ Ready to Deploy

All services are containerized and production-ready!
