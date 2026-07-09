# ArcFace Experiment — Face Recognition & Attendance System

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Quick Start (Docker — Recommended)](#quick-start-docker--recommended)
6. [Local Development Setup](#local-development-setup)
   - [ML Service (Python / FastAPI)](#ml-service-python--fastapi)
   - [Backend (Node.js / Express)](#backend-nodejs--express)
   - [Frontend (React / Vite)](#frontend-react--vite)
7. [Configuration](#configuration)
8. [Service Endpoints](#service-endpoints)
9. [API Overview](#api-overview)
10. [Database Schema](#database-schema)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This system identifies employees via webcam in real time and automatically records attendance events. Key capabilities:

- **Face Recognition** — InsightFace (ArcFace) embeddings for accurate face identification.
- **Liveness Detection** — MiniFASNet ONNX anti-spoofing model to reject photos/screens.
- **Vector Search** — Milvus vector database for fast embedding similarity search.
- **Attendance Tracking** — PostgreSQL stores enrolled employees and attendance events.
- **Real-time Streaming** — WebSocket endpoint for continuous live-video recognition.
- **Job Queue** — BullMQ + Redis decouples video-frame processing from the API.

---

## Architecture

```
┌──────────────┐     HTTP/WS      ┌─────────────────┐
│   Frontend   │ ───────────────► │  Backend API    │
│  (React/Vite)│                  │  (Express :3000) │
└──────────────┘                  └────────┬────────┘
                                           │ HTTP
                                  ┌────────▼────────┐
                                  │   ML Service    │
                                  │ (FastAPI :8000) │
                                  └────────┬────────┘
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                         ┌────────┐  ┌────────┐  ┌──────────┐
                         │ Milvus │  │Postgres│  │  Redis   │
                         │(Vector)│  │  (DB)  │  │ (Queue)  │
                         └────────┘  └────────┘  └──────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Socket.IO client, react-webcam |
| Backend API | Node.js, Express, Socket.IO, BullMQ, Prisma ORM |
| ML Service | Python 3, FastAPI, Uvicorn |
| Face Recognition | InsightFace 0.7.3 (ArcFace), ONNX Runtime GPU |
| Liveness Detection | MiniFASNet (ONNX) |
| Deep Learning | PyTorch 2.1.2 + CUDA 12.1 |
| Vector Database | Milvus 2.4.0 (+ MinIO + ETCD) |
| Relational Database | PostgreSQL 15 |
| Job Queue | Redis 7 + BullMQ |
| Containerisation | Docker + Docker Compose |

---

## Prerequisites

### For Docker deployment (recommended)

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2+
- NVIDIA GPU with drivers installed + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) *(required for GPU acceleration)*

### For local development

- **ML Service**: Python 3.10+, CUDA 12.1 toolkit (for GPU), pip
- **Backend**: Node.js 18+, npm, PostgreSQL 15+
- **Frontend**: Node.js 18+, npm
- Running instances of Milvus, PostgreSQL, and Redis

---

## Quick Start (Docker — Recommended)

This single command starts the entire stack (Milvus, PostgreSQL, Redis, ML Service, Backend, Worker).

**1. Clone the repository**

```bash
git clone https://github.com/I-paul/arcface_exp.git
cd arcface_exp
```

**2. Create your environment file**

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
DB_USER=postgres
DB_PASSWORD=<replace-with-a-strong-password>
DB_NAME=attendance_DB
```

**3. Start all services**

```bash
docker compose up --build
```

> First run downloads images and builds containers — this may take several minutes.

**4. Verify everything is running**

```bash
docker compose ps
```

All services should show `healthy` or `running`. Visit:

| Service | URL |
|---|---|
| Backend API | http://localhost:3000 |
| ML Service | http://localhost:8000 |
| Milvus GUI (Attu) | http://localhost:8888 |

**5. Stop all services**

```bash
docker compose down
```

To also remove all persisted data volumes:

```bash
docker compose down -v
```

---

## Local Development Setup

Use this approach if you want to iterate quickly on a single service without rebuilding Docker images.

> **Note:** Milvus, PostgreSQL, and Redis are easiest to run via Docker even during local development. You can start only the infrastructure services with:
>
> ```bash
> docker compose up etcd minio milvus postgres redis
> ```

---

### ML Service (Python / FastAPI)

**1. Navigate to the service directory**

```bash
cd ml_service
```

**2. Create and activate a virtual environment**

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

**3. Install dependencies**

> **Note:** The versions below match `ml_service/requirements.txt`. Verify compatibility at [pytorch.org](https://pytorch.org/get-started/locally/) if you are using a different CUDA version.

For GPU (CUDA 12.1):

```bash
pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
pip uninstall -y onnxruntime
pip install --force-reinstall onnxruntime-gpu==1.17.1
```

`insightface` may pull CPU `onnxruntime` as a transitive dependency. Reinstalling `onnxruntime-gpu` as the last step ensures `CUDAExecutionProvider` is retained.

For CPU only:

```bash
pip install torch==2.1.2 torchvision==0.16.2
pip install -r requirements.txt
```

**4. Configure environment variables**

Copy and edit the root `.env` file, then export the relevant ML variables, or set them in your shell:

```bash
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export FORCE_GPU=True          # Set False if no GPU
export FACE_DETECTION_THRESHOLD=0.5
export FACE_DET_SIZES=640,896,1024
export FACE_DET_THRESHOLDS=0.5,0.45,0.4
export FACE_RECOGNITION_THRESHOLD=0.6
```

**5. Run the service**

```bash
python main.py
```

The ML Service will start on `http://localhost:8000`.

---

### Backend (Node.js / Express)

**1. Navigate to the backend directory**

```bash
cd Backend
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment variables**

```bash
cp ../.env.example ../.env
# Edit .env - update DB_HOST=localhost and REDIS_HOST=localhost
```

**4. Run database migrations**

```bash
npm run migrate:dev
```

**5. Start the development server**

```bash
npm run dev
```

The Backend API will start on `http://localhost:3000`.

**Other available scripts:**

| Script | Purpose |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with hot-reload |
| `npm run migrate` | Run pending migrations (production) |
| `npm run migrate:dev` | Create and run migrations (development) |

---

### Frontend (React / Vite)

**1. Navigate to the frontend directory**

```bash
cd Demo
```

**2. Install dependencies**

```bash
npm install
```

**3. Start the development server**

```bash
npm run dev
```

The Frontend will start on `http://localhost:5173` by default (configured in `vite.config.js`).

---

## Configuration

All configuration is driven by the `.env` file in the project root. Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Node environment |
| `PORT` | `3000` | Backend API port |
| `DB_HOST` | `localhost` | PostgreSQL host (use `postgres` in Docker) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | *(required)* | PostgreSQL password |
| `DB_NAME` | `attendance_DB` | PostgreSQL database name |
| `REDIS_HOST` | `redis` | Redis host (use `localhost` locally) |
| `REDIS_PORT` | `6379` | Redis port |
| `ML_SERVICE_URL` | `http://ml_service:8000` | ML service URL (use `http://localhost:8000` locally) |
| `MILVUS_HOST` | `milvus` | Milvus host (use `localhost` locally) |
| `MILVUS_PORT` | `19530` | Milvus port |
| `FORCE_GPU` | `True` | Enable GPU acceleration (`False` for CPU-only) |
| `GPU_MEMORY_FRACTION` | `0.8` | Fraction of GPU memory to allocate |
| `FACE_DETECTION_THRESHOLD` | `0.5` | Minimum face detection confidence |
| `FACE_DET_SIZES` | `640,896,1024` | Detector input sizes tried in sequence (helps tiny faces) |
| `FACE_DET_THRESHOLDS` | `0.5,0.45,0.4` | Per-size detection thresholds aligned with `FACE_DET_SIZES` |
| `FACE_RECOGNITION_THRESHOLD` | `0.6` | Minimum recognition similarity score |
| `WORKERS` | `4` | Uvicorn worker count |

---

## Service Endpoints

| Service | Port | Notes |
|---|---|---|
| Backend API | 3000 | Express REST API + Socket.IO |
| ML Service | 8000 | FastAPI + WebSocket |
| PostgreSQL | 5432 | Relational database |
| Redis | 6379 | Job queue broker |
| Milvus | 19530 | Vector database gRPC |
| Milvus Health | 9091 | Milvus HTTP health check |
| Attu (Milvus GUI) | 8888 | Web UI for Milvus management |

---

## API Overview

### ML Service (`http://localhost:8000`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Service status |
| `GET` | `/health` | Health check (GPU, Milvus status) |
| `POST` | `/enroll` | Enroll a new person (multipart: `name` + `files[]`, min 3 images) |
| `GET` | `/collection/stats` | Milvus collection statistics |
| `DELETE` | `/person/{person_id}` | Remove a person from the collection |
| `WS` | `/ws/recognize` | Real-time face recognition stream |

### Backend API (`http://localhost:3000`)

Refer to the route files in `Backend/src/routes/` for the full list of REST endpoints.

---

## Database Schema

### `employees`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Internal identifier |
| `emp_id` | VARCHAR (UNIQUE) | Company-provided employee ID |
| `name` | VARCHAR | Employee full name |
| `milvus_id` | BIGINT (UNIQUE) | Link to vector in Milvus |
| `enrolled_at` | TIMESTAMP | Enrollment date/time |

### `cameras`

| Column | Type | Description |
|---|---|---|
| `cam_id` | UUID (PK) | Internal identifier |
| `site_id` | VARCHAR | Site identifier |
| `site_name` | VARCHAR | Site display name |
| `camera_label` | VARCHAR | Camera label |
| `created_at` | TIMESTAMP | Record creation time |

### `attendance_events`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Internal identifier |
| `emp_id` | VARCHAR (FK) | Employee reference |
| `cam_id` | UUID (FK) | Camera reference |
| `site_id` | VARCHAR | Site identifier |
| `event_time` | TIMESTAMP | Time of the attendance event |
| `action` | VARCHAR | `IN` or `OUT` |
| `similarity_score` | FLOAT | Recognition confidence |
| `liveness_passed` | BOOLEAN | Liveness check result |
| `created_at` | TIMESTAMP | Record creation time |

---

## Troubleshooting

### Services won't start

Check that all required containers are healthy:

```bash
docker compose ps
docker compose logs <service_name>
```

### Database migration fails

Ensure PostgreSQL is running and credentials in `.env` are correct:

```bash
docker compose ps postgres
echo $DATABASE_URL
```

Reset and rebuild if needed:

```bash
docker compose down -v
docker compose up --build
```

### ML Service fails to start (GPU error)

The service now enforces GPU availability based on ONNX Runtime's `CUDAExecutionProvider` (not only PyTorch CUDA).

1) Verify ONNX providers:

```bash
cd ml_service
python scripts/check_onnx_providers.py
```

If `CUDAExecutionProvider` is missing, your `onnxruntime-gpu` build or CUDA runtime libraries are incompatible.

Windows note for newer GPUs (for example RTX 50-series): if provider creation fails with missing `cudnn64_8.dll` or `cublasLt64_11.dll`, your wheel is too old for your local CUDA/cuDNN stack. For local Windows venv usage, install:

```bash
pip uninstall -y onnxruntime onnxruntime-gpu
pip install --force-reinstall onnxruntime-gpu==1.20.0
```

This version uses CUDA 12 and cuDNN 9 on Windows. Docker images based on CUDA 12.1 + cuDNN 8 may still require the older pinned wheel.

2) Verify PyTorch GPU compatibility:

```bash
python scripts/check_torch_gpu.py
```

If your GPU architecture is newer than your installed PyTorch wheel supports, install a newer PyTorch build matching your CUDA stack.

3) For CPU fallback during debugging:

If you do not have an NVIDIA GPU, set `FORCE_GPU=False` in `.env` and update `ml_service/main.py` line:

```python
face_processor = FaceProcessor(force_gpu=False)
```

Or run without GPU support by setting the environment variable before starting:

```bash
FORCE_GPU=False docker compose up --build
```

### No faces detected on CCTV footage

Small/distant faces are harder for SCRFD at a single detector size. The service now retries with larger detector sizes and lower thresholds.

Tune in `.env`:

```env
FACE_DET_SIZES=640,896,1024
FACE_DET_THRESHOLDS=0.5,0.45,0.4
```

For very dense or distant CCTV scenes, try:

```env
FACE_DET_SIZES=896,1024,1280
FACE_DET_THRESHOLDS=0.45,0.40,0.35
```

### Milvus connection refused

Milvus takes up to 90 seconds to become healthy on first start. The ML Service and Backend will wait for it via Docker health checks. If running locally, wait for Milvus to be ready before starting other services:

```bash
docker compose up etcd minio milvus
# Wait until healthy, then start the rest
docker compose up ml_service backend worker
```
