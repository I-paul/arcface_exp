# 🏗️ System Architecture

## Full Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     External Client                          │
│                  (Web/Mobile/Desktop App)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (nginx)                     │
│                         Port 80/443                          │
│                     - SSL/TLS termination                    │
│                     - Load balancing                         │
│                     - Rate limiting                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ↓                               ↓
┌─────────────────────┐         ┌─────────────────────┐
│      Backend        │         │    Frontend         │
│   (API Gateway)     │         │   (Static Files)    │
│                     │         │                     │
│  Port: 3000         │         │  Served by nginx    │
│  Tech: Node.js      │         │  Tech: React/Vue    │
│  Role:              │         └─────────────────────┘
│  - Auth & session   │
│  - Rate limiting    │
│  - Request routing  │
│  - Business logic   │
└──────────┬──────────┘
           │
           │ HTTP
           ↓
┌─────────────────────────────────────────────────────────────┐
│                      ML Service                              │
│                                                              │
│  Port: 8000                                                  │
│  Tech: FastAPI + Python                                      │
│  GPU: CUDA-enabled                                           │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              main.py (FastAPI App)                  │    │
│  │  - /recognize      - /enroll                        │    │
│  │  - /health         - /collection/stats              │    │
│  └───┬─────────────┬──────────────┬────────────────────┘    │
│      │             │              │                          │
│      ↓             ↓              ↓                          │
│  ┌────────┐  ┌──────────┐  ┌───────────────┐              │
│  │Inference│  │Embeddings│  │Milvus Client  │              │
│  │Module   │  │ Manager  │  │               │              │
│  └────────┘  └──────────┘  └───────┬───────┘              │
│                                     │                        │
└─────────────────────────────────────┼────────────────────────┘
                                      │
                                      │ gRPC/TCP
                                      ↓
┌─────────────────────────────────────────────────────────────┐
│                    Milvus (Vector Database)                  │
│                                                              │
│  Port: 19530 (main), 9091 (admin)                           │
│  Tech: Milvus v2.4.3                                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              milvus-standalone                      │    │
│  │  - Vector similarity search (cosine)                │    │
│  │  - Collection: face_embeddings                      │    │
│  │  - Index: IVF_FLAT                                  │    │
│  └────────┬───────────────┬──────────────────────────┘    │
│           │               │                                 │
│           ↓               ↓                                 │
│    ┌──────────┐    ┌─────────┐                            │
│    │   etcd   │    │  MinIO  │                            │
│    │(metadata)│    │(storage)│                            │
│    └──────────┘    └─────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Service Communication Flow

### 1. Face Recognition Request
```
Client → Backend → ML Service → Face Processor
                               ↓
                          Extract Embedding
                               ↓
                          Milvus Client
                               ↓
                          Milvus Search
                               ↓
                          Return Match
                               ↓
Client ← Backend ← ML Service ← Result
```

### 2. Face Enrollment Flow
```
Client → Backend → ML Service → Face Processor (multiple images)
                               ↓
                          Extract Embeddings
                               ↓
                          Embedding Manager
                               ↓
                          Compute Centroid
                               ↓
                          Milvus Client
                               ↓
                          Insert Vector
                               ↓
Client ← Backend ← ML Service ← Success
```

## Container Architecture

```
Docker Host
│
├─ Network: app-network (bridge)
│
├─ Container: backend
│  ├─ Image: node:18-alpine
│  ├─ Port: 3000:3000
│  └─ Links: ml-service
│
├─ Container: ml-service
│  ├─ Image: ml-service:latest (custom)
│  ├─ Port: 8000:8000
│  ├─ GPU: nvidia runtime
│  ├─ Links: milvus
│  └─ Volumes: logs/, models/
│
├─ Container: milvus-standalone
│  ├─ Image: milvusdb/milvus:v2.4.3
│  ├─ Port: 19530:19530, 9091:9091
│  ├─ Links: etcd, minio
│  └─ Volumes: milvus/
│
├─ Container: milvus-etcd
│  ├─ Image: quay.io/coreos/etcd:v3.5.5
│  └─ Volumes: etcd/
│
└─ Container: milvus-minio
   ├─ Image: minio/minio:latest
   ├─ Port: 9000, 9001
   └─ Volumes: minio/
```

## Data Flow

### Enrollment Data
```
Image Files (.jpg/.png)
        ↓
   [Face Detection]
        ↓
   Raw Embedding (512-dim float array)
        ↓
   [Normalization]
        ↓
   Normalized Embedding
        ↓
   [Multiple images → Centroid]
        ↓
   Final Embedding
        ↓
   [Milvus Insert]
        ↓
   Vector ID + Metadata
        ↓
   [Persistent Storage in MinIO]
```

### Recognition Data
```
Query Image
     ↓
[Face Detection]
     ↓
Extract Embedding
     ↓
[Normalize]
     ↓
Query Vector (512-dim)
     ↓
[Milvus Similarity Search]
     ↓
Top-K Results (ID, Distance)
     ↓
[Threshold Check (0.65)]
     ↓
Match / No Match + Confidence
```

## File System Layout

```
Host: c:\Users\Admin\Documents\PEP intern\arcface_exp\
│
├─ ml_service/                    # ← ML Service (NEW)
│  ├─ main.py
│  ├─ inference/
│  ├─ embeddings/
│  ├─ milvus_client/
│  ├─ requirements.txt
│  ├─ Dockerfile
│  └─ README.md
│
├─ Backend/                       # ← API Gateway
│  ├─ src/
│  ├─ package.json
│  └─ Dockerfile
│
├─ infra/                         # ← Infrastructure
│  └─ milvus/
│     ├─ docker-compose.yml
│     ├─ conn.py
│     └─ volumes/
│
├─ Modelling/                     # ← Legacy (preserved)
│  └─ main/
│     ├─ face_recognition_system.py
│     └─ webcam_conn.py
│
├─ docker-compose.prod.yml        # ← Production orchestration
├─ deploy.sh / deploy.bat         # ← Deployment scripts
├─ README.md                      # ← Main documentation
├─ DEPLOYMENT.md                  # ← Deployment guide
└─ MIGRATION_SUMMARY.md           # ← Change log
```

## Port Mapping

| Service | Internal Port | External Port | Protocol | Purpose |
|---------|---------------|---------------|----------|---------|
| Backend | 3000 | 3000 | HTTP | API Gateway |
| ML Service | 8000 | 8000 | HTTP | Face Recognition API |
| ML Docs | 8000 | 8000 | HTTP | Swagger UI (/docs) |
| Milvus | 19530 | 19530 | gRPC | Vector search |
| Milvus Admin | 9091 | 9091 | HTTP | Health/metrics |
| MinIO | 9000 | - | HTTP | Object storage |
| MinIO Console | 9001 | - | HTTP | Web UI |
| etcd | 2379 | - | HTTP | Metadata |

## Volume Mounts

```
Host Filesystem                    Container Filesystem
│
├─ infra/milvus/volumes/
│  ├─ etcd/                   →  /etcd
│  ├─ milvus/                 →  /var/lib/milvus
│  └─ minio/                  →  /minio_data
│
├─ ml_service/logs/           →  /app/logs
│
└─ Docker Volume: ml-models   →  /app/models
```

## Security Layers

```
┌─────────────────────────────────────────┐
│        External Network (Internet)       │
└────────────────┬────────────────────────┘
                 │
                 ↓
          [Firewall/WAF]
                 ↓
          [Reverse Proxy]
           - SSL/TLS
           - Rate Limiting
                 ↓
┌────────────────────────────────────────┐
│     Application Network (Docker)       │
│                                        │
│  ┌──────────┐    ┌──────────────┐   │
│  │ Backend  │←→  │  ML Service  │   │
│  └──────────┘    └───────┬──────┘   │
│                          ↓           │
│                   ┌──────────────┐   │
│                   │    Milvus    │   │
│                   └──────────────┘   │
│                                        │
└────────────────────────────────────────┘
                 ↑
          Internal Only
       (No external access)
```

## Scaling Strategy

### Horizontal Scaling
```
Load Balancer
     │
     ├─ ML Service Instance 1 (GPU 0)
     ├─ ML Service Instance 2 (GPU 1)
     └─ ML Service Instance 3 (GPU 2)
              ↓
         Milvus Cluster
         (Distributed)
```

### Vertical Scaling
```
Single Instance
├─ CPU: 8 cores → 16 cores
├─ RAM: 16GB → 32GB
├─ GPU: 1x RTX 3090 → 2x RTX 4090
└─ Storage: 100GB → 500GB
```

## Monitoring Points

```
┌─────────────┐
│  Prometheus │  ← Metrics collection
└──────┬──────┘
       │
       ├─ Backend: response time, errors
       ├─ ML Service: inference time, queue length
       └─ Milvus: search latency, index size
              ↓
       ┌───────────┐
       │  Grafana  │  ← Visualization
       └───────────┘
```

---

## Quick Commands

### Deploy Everything
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Check Architecture
```bash
docker-compose -f docker-compose.prod.yml ps
docker network ls
docker volume ls
```

### Test Flow
```bash
# 1. Check health
curl http://localhost:8000/health

# 2. Enroll person
curl -X POST http://localhost:8000/enroll \
  -F "name=Test" -F "files=@1.jpg" -F "files=@2.jpg"

# 3. Recognize
curl -X POST http://localhost:8000/recognize -F "file=@test.jpg"
```

This architecture is **production-ready** and **horizontally scalable**! 🚀
