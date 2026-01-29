# ML Service - Face Recognition API

Production-ready ML service for face recognition and enrollment.

## Features

- 🚀 FastAPI-based REST API
- 🎯 GPU-accelerated face detection (InsightFace)
- 🔍 Vector similarity search (Milvus)
- 📦 Containerized deployment
- 🔒 Face quality checks (occlusion detection)

## API Endpoints

### Health Check
```bash
GET /health
```

### Face Recognition
```bash
POST /recognize
Content-Type: multipart/form-data
Body: file (image)
```

### Face Enrollment
```bash
POST /enroll
Content-Type: multipart/form-data
Body: 
  - name (string)
  - files (multiple images, min 3)
```

### Collection Stats
```bash
GET /collection/stats
```

### Delete Person
```bash
DELETE /person/{person_id}
```

## Local Development

### Prerequisites
- Python 3.10+
- CUDA 11.8+ (for GPU support)
- Milvus running (see `../infra/milvus/`)

### Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Run service
python main.py
```

Service will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## Docker Deployment

### Build Image
```bash
docker build -t ml-service:latest .
```

### Run Container
```bash
docker run -p 8000:8000 \
  --gpus all \
  -e MILVUS_HOST=host.docker.internal \
  ml-service:latest
```

## Production Deployment

Use the root `docker-compose.prod.yml`:

```bash
cd ..
docker-compose -f docker-compose.prod.yml up -d
```

This starts:
- Milvus (vector database)
- ML Service (this service)
- Backend (API gateway)

## Architecture

```
ml_service/
├── main.py                 # FastAPI entrypoint
├── inference/              # Face detection & processing
│   └── face_processor.py
├── embeddings/             # Embedding management
│   └── embedding_manager.py
├── milvus_client/          # Vector DB client
│   └── client.py
├── requirements.txt        # Python dependencies
└── Dockerfile             # Container definition
```

## Configuration

Edit `.env` or set environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MILVUS_HOST` | localhost | Milvus server host |
| `MILVUS_PORT` | 19530 | Milvus server port |
| `ML_SERVICE_PORT` | 8000 | Service port |
| `CUDA_VISIBLE_DEVICES` | 0 | GPU device ID |

## Testing

### Test Recognition
```bash
curl -X POST http://localhost:8000/recognize \
  -F "file=@test_image.jpg"
```

### Test Enrollment
```bash
curl -X POST http://localhost:8000/enroll \
  -F "name=John Doe" \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@image3.jpg"
```

## Monitoring

- Health: `http://localhost:8000/health`
- API Docs: `http://localhost:8000/docs`
- Metrics: Check logs at `/app/logs/`

## Troubleshooting

### GPU not detected
```bash
# Check CUDA availability
python -c "import torch; print(torch.cuda.is_available())"
```

### Milvus connection failed
```bash
# Verify Milvus is running
docker ps | grep milvus
curl http://localhost:9091/healthz
```

### Model download issues
InsightFace models are downloaded on first run to `~/.insightface/`.

## License

Proprietary - Internal Use Only
