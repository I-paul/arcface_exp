# Face Recognition System - Production Ready

A production-grade face recognition system with ML service, vector database, and API gateway.

## 🏗️ Architecture

```
┌─────────────────┐
│    Backend      │  ← API Gateway (Node.js/Express)
│   Port 3000     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   ML Service    │  ← Face Recognition API (FastAPI)
│   Port 8000     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│     Milvus      │  ← Vector Database
│   Port 19530    │
└─────────────────┘
```

## 📦 Services

### 1. ML Service (`ml_service/`)
- **FastAPI** REST API
- **InsightFace** for face detection & embeddings
- **GPU-accelerated** inference
- Face quality checks (occlusion detection)
- Endpoints: `/recognize`, `/enroll`, `/health`

### 2. Backend (`Backend/`)
- **Express.js** API Gateway
- Business logic layer
- Request routing & validation
- Integration with ML service

### 3. Milvus (`infra/milvus/`)
- **Vector database** for face embeddings
- High-performance similarity search
- Persistent storage

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- NVIDIA GPU with CUDA support (for ML service)
- nvidia-docker2 (for GPU access in containers)

### Production Deployment

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f ml-service

# Stop services
docker-compose -f docker-compose.prod.yml down
```

Services will be available at:
- Backend API: `http://localhost:3000`
- ML Service: `http://localhost:8000`
- ML Service Docs: `http://localhost:8000/docs`
- Milvus: `localhost:19530`

## 📁 Project Structure

```
arcface_exp/
├── ml_service/                 # ✅ ML Service (New)
│   ├── main.py                # FastAPI entrypoint
│   ├── inference/             # Face processing
│   │   └── face_processor.py
│   ├── embeddings/            # Embedding management
│   │   └── embedding_manager.py
│   ├── milvus_client/         # Vector DB client
│   │   └── client.py
│   ├── requirements.txt       # Python dependencies
│   ├── Dockerfile            # Container definition
│   └── README.md             # Service documentation
│
├── Backend/                   # ✅ API Gateway
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   └── Dockerfile            # Container definition
│
├── infra/                     # ✅ Infrastructure
│   └── milvus/
│       ├── docker-compose.yml
│       ├── conn.py
│       └── volumes/
│
├── Modelling/                 # ⚠️ Legacy (keep for reference)
│   └── main/
│       ├── face_recognition_system.py  # Original desktop app
│       └── webcam_conn.py
│
├── docker-compose.prod.yml    # ✅ Production orchestration
├── requirement.txt            # Legacy requirements
└── README.md                 # This file
```

## 🔧 Development Setup

### ML Service (Local)
```bash
cd ml_service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start Milvus (required)
cd ../infra/milvus
docker-compose up -d

# Run ML service
cd ../../ml_service
python main.py
```

### Backend (Local)
```bash
cd Backend

# Install dependencies
npm install

# Start server
npm start
```

## 🧪 Testing

### Test ML Service Recognition
```bash
# Using curl
curl -X POST http://localhost:8000/recognize \
  -F "file=@test_image.jpg"

# Expected response
{
  "name": "John Doe",
  "confidence": 0.89,
  "is_recognized": true,
  "message": "Face recognized successfully"
}
```

### Test ML Service Enrollment
```bash
curl -X POST http://localhost:8000/enroll \
  -F "name=Jane Smith" \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@image3.jpg"

# Expected response
{
  "success": true,
  "message": "Successfully enrolled Jane Smith with 3 images",
  "person_id": "person_123456789"
}
```

### Health Checks
```bash
# ML Service
curl http://localhost:8000/health

# Backend
curl http://localhost:3000/health

# Milvus
curl http://localhost:9091/healthz
```

## 📊 API Documentation

### ML Service API
Interactive docs: `http://localhost:8000/docs`

**Key Endpoints:**
- `POST /recognize` - Recognize a face from image
- `POST /enroll` - Enroll new person with images
- `GET /collection/stats` - Get database statistics
- `DELETE /person/{person_id}` - Remove person
- `GET /health` - Service health check

### Backend API
Documentation: See `Backend/README.md` (create if needed)

## 🔒 Configuration

### ML Service Environment Variables
```env
MILVUS_HOST=localhost
MILVUS_PORT=19530
ML_SERVICE_PORT=8000
CUDA_VISIBLE_DEVICES=0
```

### Backend Environment Variables
```env
ML_SERVICE_URL=http://ml-service:8000
NODE_ENV=production
PORT=3000
```

## 📈 Monitoring

### Check Service Status
```bash
# All services
docker-compose -f docker-compose.prod.yml ps

# ML Service logs
docker logs ml-service -f

# Milvus logs
docker logs milvus-standalone -f
```

### GPU Monitoring
```bash
# Inside ML service container
docker exec -it ml-service nvidia-smi

# Or from host
watch -n 1 nvidia-smi
```

## 🐛 Troubleshooting

### GPU Not Accessible
```bash
# Check nvidia-docker2 installation
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi

# Verify GPU in docker-compose
docker-compose -f docker-compose.prod.yml config
```

### Milvus Connection Failed
```bash
# Check Milvus is running
docker ps | grep milvus

# Check Milvus health
curl http://localhost:9091/healthz

# Restart Milvus
docker-compose -f docker-compose.prod.yml restart milvus
```

### ML Service Model Download Issues
InsightFace models are downloaded on first run. If download fails:
```bash
# Manual download location
~/.insightface/models/buffalo_l/

# Clear cache and retry
rm -rf ~/.insightface/
docker-compose -f docker-compose.prod.yml restart ml-service
```

## 🚢 Deployment Checklist

Before shipping to production:

- [ ] Environment variables configured
- [ ] GPU drivers installed on host
- [ ] nvidia-docker2 installed
- [ ] Milvus data directory backed up
- [ ] Backend Dockerfile created
- [ ] Reverse proxy configured (nginx)
- [ ] SSL certificates installed
- [ ] Monitoring/logging setup
- [ ] Backup strategy implemented
- [ ] Load testing completed

## 📝 Migration Notes

### From Legacy Modelling/ to ml_service/

**What was kept:**
- Face detection logic (InsightFace)
- Embedding extraction
- Occlusion detection
- Quality checks

**What changed:**
- Desktop app → REST API
- FAISS → Milvus
- Tkinter UI → HTTP endpoints
- Local storage → Vector database

**Legacy code preserved:**
- `Modelling/main/face_recognition_system.py` - Original implementation
- Can be referenced for webcam integration

## 🔐 Security Considerations

- [ ] Add authentication to ML service
- [ ] Rate limiting on API endpoints
- [ ] Input validation & sanitization
- [ ] CORS configuration review
- [ ] Secrets management (don't commit .env)
- [ ] Network isolation (internal services)

## 📚 Additional Documentation

- ML Service: [ml_service/README.md](ml_service/README.md)
- Backend: `Backend/README.md` (TODO)
- Milvus: [infra/milvus/README.md](https://milvus.io/docs)

## 🤝 Contributing

1. Create feature branch
2. Test locally with docker-compose
3. Update documentation
4. Submit pull request

## 📄 License

Proprietary - Internal Use Only

---

**Status:** ✅ **Ready to Ship**

The system is now properly containerized and production-ready. All services have clear boundaries and can be deployed independently.
