# Product Engineering Review
## ArcFace Classroom Attendance System
**Reviewer:** Senior Product Engineer / Architect (AI-assisted deep review)
**Date:** 2026-09-23
**Codebase:** `d:/pep-Intern/arcface_exp` (GitHub: `I-paul/arcface_exp`)

---

## 1. Executive Summary

**What the product is:** A real-time, AI-powered **student attendance system** for educational institutions. RTSP cameras in classrooms stream video through a pipeline that performs face detection, quality assessment, and ArcFace embedding-based recognition against a Milvus vector store. Recognized students are automatically marked present in a PostgreSQL database. An instructor-facing React web app manages rooms, cameras, class periods, sessions, student enrollment, and live classroom monitoring.

**Overall health:** The system has a **solid architectural concept and a well-structured codebase for an early prototype**. The core ML pipeline (InsightFace + MiniFASNet + Milvus) is technically sound, the data model is coherent, and the real-time streaming path (Camera → Redis Stream → Backend → ML WebSocket → DB) is intelligently designed. However, several critical blockers prevent a clean end-to-end run, and there are meaningful security gaps that must be addressed before any real-student deployment.

**Readiness verdict:** ⚠️ **NOT READY FOR DEPLOYMENT.** Estimated 3–4 weeks of focused effort required to reach a solid, deployable prototype.

**Top 5 issues:**

1. 🔴 **Hard schema split (CRITICAL):** The only Prisma migration (`0_init/migration.sql`) creates the old `employees / cameras / attendance_events` schema, while the live `schema.prisma` defines a completely different schema (`rooms / students / periods / sessions / attendance_records`). A fresh clone will have schema inconsistencies.

2. 🔴 **Anti-spoofing initialized but never invoked in live recognition (CRITICAL):** `main.py` initializes `antispoof_predictor` but the `/ws/recognize` WebSocket handler never calls it. Every frame passes through recognition without liveness checking — defeating the core fraud-prevention feature.

3. 🔴 **Docker volume mount overwrites `node_modules` (CRITICAL):** `docker-compose.yml` mounts `./Backend:/app` which shadows the installed image node_modules. The named volume partially compensates but creates fragile, order-dependent startup.

4. 🔴 **No authentication or authorization on any endpoint (CRITICAL):** Every API route — attendance-marking, student-deletion, enrollment — is publicly accessible with no credentials required.

5. 🟠 **Session detection silently broken on monitor page (HIGH):** `GET /api/sessions/today` response omits `room_id`, but `ClassroomMonitor.jsx:50` matches on `s.room_id`. Faculty always see "No Active Session" even when one is running.

---

## 2. Product Overview

**Problem solved:** Manual attendance marking in educational settings is time-consuming, error-prone, and susceptible to proxy attendance. This system automates attendance via face recognition from existing classroom CCTV cameras.

**Target users** (inferred, high confidence):
- **Faculty/Instructors** — book sessions, monitor live classroom feed, view and override attendance roster.
- **System Administrators** — manage rooms, cameras, student enrollment, time periods.
- **Students** — passive recipients; their face biometrics are enrolled in advance.

**Core features (implemented):**
- Student enrollment via webcam or IP camera (3–5 images → ArcFace centroid embedding → Milvus)
- RTSP camera ingest → Redis stream → real-time face recognition via WebSocket
- Session lifecycle: SCHEDULED → ACTIVE → COMPLETED / CANCELLED
- Grace period attendance marking (15 min default from session start)
- Manual attendance override with `manually_marked` flag
- Live classroom monitor with canvas-rendered bounding boxes and detection log
- System health dashboard (Postgres, Redis, ML service status)
- Admin portal: rooms, cameras, periods, students CRUD

---

## 3. Tech Stack & Repository Map

### 3.1 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 18.3.1 |
| Frontend build | Vite | 5.3.1 |
| Frontend routing | react-router-dom | 6.23.1 |
| Frontend real-time | socket.io-client | 4.7.5 |
| Frontend styling | Tailwind CSS | 3.4.4 |
| Backend framework | Express | 5.2.1 |
| Backend WebSockets | Socket.IO | 4.8.3 |
| Backend ORM | Prisma | 5.8.0 (schema only; runtime uses raw pg pool) |
| Backend DB driver | pg (node-postgres) | 8.16.3 |
| Backend queue client | ioredis | 6.0.0 |
| ML service | FastAPI + Uvicorn | (unpinned in requirements.txt) |
| Face recognition | InsightFace (buffalo_l / ArcFace) | 0.7.3 |
| Anti-spoofing | MiniFASNet (ONNX) | — |
| ONNX runtime | onnxruntime-gpu | 1.17.1 (Dockerfile) |
| Deep learning | PyTorch | 2.1.2 + CUDA 12.1 |
| Vector database | Milvus | 2.4.0 |
| Relational DB | PostgreSQL | 15 |
| Streaming | Redis Streams | 7 |
| Containerisation | Docker + Docker Compose | v2+ |
| Camera ingestor | Python (OpenCV + psycopg2 + redis-py) | — |

### 3.2 Repository Map

```
arcface_exp/
├── .env                        # Real secrets (COMMITTED TO REPO — security risk)
├── .env.example                # Template — well maintained
├── docker-compose.yml          # Orchestrates 9 services
├── gpu-req.txt                 # Notes (not a pip requirements file)
├── requirement.txt             # Root-level stub (unused)
│
├── Backend/                    # Node.js / Express API server
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       # ACTIVE schema: rooms/students/sessions
│   │   └── migrations/
│   │       └── 0_init/
│   │           └── migration.sql  # STALE: employees/cameras/attendance_events
│   └── src/
│       ├── index.js            # Entry point, Socket.IO, stream reader init
│       ├── streamReader.js     # Redis XREADGROUP consumer loop
│       ├── routes/             # REST routes per entity
│       ├── models/             # DB logic (raw SQL via pg pool)
│       ├── DB/config.js        # pg.Pool factory
│       └── utils/
│           ├── CameraStreamManager.js  # Per-camera ML WebSocket pool
│           ├── socketHandler.js        # Socket.IO event handler
│           └── sessionCache.js         # In-memory active-session cache
│
├── frontend/                   # React / Vite SPA
│   └── src/
│       ├── App.jsx             # Router with 6 routes
│       └── components/
│           ├── ClassroomMonitor.jsx
│           ├── EnrollmentPage.jsx
│           ├── BookSessionPage.jsx
│           ├── SessionDetail.jsx
│           ├── admin/
│           └── layout/AppLayout.jsx
│
├── ml_service/                 # Python / FastAPI ML inference service
│   ├── Dockerfile              # nvidia/cuda:12.1 base
│   ├── main.py                 # FastAPI app: /enroll, /ws/recognize
│   ├── inference/              # FaceProcessor, RecognitionPipeline, SimpleTracker
│   ├── embeddings/             # EmbeddingManager (centroid)
│   ├── milvus_client/          # pymilvus CRUD + search (schema v2)
│   ├── anti_spoofing/          # MiniFASNet ONNX predictor (INITIALIZED, NEVER CALLED)
│   ├── preprocessing/          # align→quality→CLAHE→ArcFace tensor
│   ├── models/minifasnet.onnx  # Anti-spoofing model (918 KB)
│   └── scripts/                # Debug scripts, benchmarks, test images
│
├── camera_ingestor/            # Python RTSP frame grabber → Redis stream
│   ├── camera_ingestor.py
│   ├── config.yaml             # HARDCODED RTSP CREDS — not read at runtime
│   └── node_adapter/adapter.js # Unused Node.js alternative (dead code)
│
└── infra/milvus/               # Standalone Milvus compose (superseded by root)
```

---

## 4. Architecture Analysis

### 4.1 Architecture Diagram

```mermaid
graph TB
    subgraph "User Devices"
        Browser["Browser (React :5173)"]
        RTSP["RTSP Camera (CCTV)"]
    end

    subgraph "Backend :3000"
        Express["Express REST API"]
        SocketIO["Socket.IO Server"]
        StreamReader["Redis Stream Reader\n(XREADGROUP loop)"]
        CSM["CameraStreamManager\n(per-cam WS pool)"]
        SessionCache["SessionCache\n(in-memory, 30s refresh)"]
    end

    subgraph "ML Service :8000"
        FastAPI["FastAPI"]
        FaceProc["FaceProcessor (InsightFace/SCRFD)"]
        Preproc["Preprocessing Pipeline"]
        AntiSpoof["AntiSpoofPredictor\n(INITIALIZED BUT UNUSED)"]
        MilvusCli["MilvusClient"]
    end

    subgraph "Infrastructure"
        Redis["Redis :6379 (Streams + KV)"]
        Postgres["PostgreSQL :5432"]
        Milvus["Milvus :19530\n(IVF_FLAT, 512-dim, IP)"]
    end

    subgraph "Camera Ingestor"
        CamWorker["CameraWorker threads\n(OpenCV RTSP)"]
    end

    Browser -- "HTTP REST + Socket.IO" --> Express
    RTSP --> CamWorker
    CamWorker -- "XADD" --> Redis
    StreamReader -- "XREADGROUP" --> Redis
    StreamReader -- "emit camera-frame (ALL CLIENTS)" --> SocketIO
    StreamReader -- "send if session active" --> CSM
    CSM -- "WS /ws/recognize?cam_id=X" --> FastAPI
    FastAPI --> FaceProc --> Preproc
    FastAPI --> MilvusCli --> Milvus
    CSM -- "name lookup + attendance UPDATE" --> Postgres
    Express -- "pg pool" --> Postgres
    Express -- "axios /enroll" --> FastAPI
    SessionCache -- "SELECT active sessions" --> Postgres
    SocketIO -- Browser
```

### 4.2 Architectural Evaluation

**Strengths:**
- Dual-path design in `streamReader.js` (PATH 1: broadcast frame to display; PATH 2: route to ML only if session active) is efficient.
- `CameraStreamManager` maintains persistent per-camera WebSocket connections to ML — avoids per-frame connection overhead. Exponential backoff reconnect is correct.
- Backpressure: `conn.busy` flag drops frames if the previous one hasn't returned.
- `sessionCache` correctly invalidates immediately on `startSession`/`endSession`.
- Proper pg transaction in `bookSession` with explicit ROLLBACK.

**Weaknesses:**
- **Layering violation (major):** Business logic (attendance marking, grace period enforcement, name resolution) lives in `CameraStreamManager.js` — a utility class.
- **Two DB access patterns:** Raw `pg` pool in models + Prisma only for migrations. Prisma type-safety is never used at runtime.
- **`socketHandler.js`** opens a new WebSocket to ML per `recognize-face` Socket.IO event in test mode — creates N connections per frontend client.
- **`io.emit('camera-frame', ...)` broadcasts ALL frames to ALL connected clients** regardless of which camera they're watching.
- **Dead code:** `node_adapter/adapter.js` is never used in any compose file or backend code.
- **`config.yaml`** contains hardcoded RTSP credentials and is never read at runtime.

---

## 5. Schema & Data Model Analysis

### 5.1 ER Diagram (Active Prisma Schema)

```mermaid
erDiagram
    Room {
        UUID room_id PK
        VARCHAR room_name UK
        TEXT[] default_students
        TIMESTAMP created_at
    }
    Camera {
        UUID cam_id PK
        UUID room_id FK_UK
        TEXT rtsp_url
        BOOLEAN is_active
        TIMESTAMP created_at
    }
    Student {
        VARCHAR student_id PK
        VARCHAR name
        BIGINT milvus_id UK
        TIMESTAMP enrolled_at
    }
    Period {
        UUID period_id PK
        VARCHAR period_name
        VARCHAR start_time
        VARCHAR end_time
    }
    Session {
        UUID session_id PK
        UUID period_id FK
        UUID room_id FK
        VARCHAR session_date
        VARCHAR status
        VARCHAR booked_by
        TIMESTAMP actual_start
        TIMESTAMP actual_end
        TIMESTAMP created_at
    }
    AttendanceRecord {
        UUID id PK
        UUID session_id FK
        VARCHAR student_id FK
        VARCHAR status
        TIMESTAMP detected_at
        FLOAT similarity_score
        BOOLEAN manually_marked
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    Room ||--o| Camera : "has"
    Room ||--o{ Session : "hosts"
    Period ||--o{ Session : "defines"
    Session ||--o{ AttendanceRecord : "contains"
    Student ||--o{ AttendanceRecord : "has"
```

### 5.2 Milvus Vector Collection (`face_embeddings`, Schema v2)

| Field | Type | Notes |
|---|---|---|
| id | INT64 (auto PK) | Milvus-generated |
| emp_id | VARCHAR(64) | Maps to `Student.studentId` |
| template_version | INT64 | Version counter for re-enrollment |
| created_at | DOUBLE | Unix timestamp |
| embedding | FLOAT_VECTOR(512) | L2-normalized ArcFace embedding |

**Index:** IVF_FLAT, nlist=1024, metric=IP (cosine similarity on normalized vectors).

### 5.3 Critical Schema Mismatch

> [!CAUTION]
> The migration file `Backend/prisma/migrations/0_init/migration.sql` creates:
> - `employees` (id, emp_id, name, milvus_id NOT NULL)
> - `cameras` (cam_id, site_id, site_name, camera_label)
> - `attendance_events` (emp_id → employees, cam_id → cameras)
>
> The active `schema.prisma` defines a completely different schema:
> - `rooms`, `students`, `periods`, `sessions`, `attendance_records`
>
> Running `prisma migrate dev` on a fresh DB will attempt to apply the old migration then diff for new tables, resulting in both schemas partially present. Running `prisma db push` (the current `migrate` script) silently pushes the new schema without tracking — no migration history.

### 5.4 Key Data Contract Issues

| Issue | Location | Severity |
|---|---|---|
| `GET /api/sessions/today` omits `room_id`; `ClassroomMonitor.jsx:50` matches on it | `session.model.js:109`, `ClassroomMonitor.jsx:50` | Critical |
| `camera.model.js` returns `rtsp_url` but `ClassroomMonitor.jsx:314` reads `camera_ip` (undefined) | `ClassroomMonitor.jsx:314` | Medium |
| ML `person_id` (string Milvus auto-id) stored as BIGINT `milvus_id` — type mismatch | `student.model.js:292`, `client.py:203` | Medium |
| `default_students` String[] has no FK enforcement; orphaned IDs silently masked by `ON CONFLICT DO NOTHING` | `session.model.js:77-82` | Medium |

---

## 6. Data Flow & Pipeline Analysis

### 6.1 Frame Ingestion → Recognition → Attendance

```mermaid
sequenceDiagram
    participant RTSP as RTSP Camera
    participant CI as Camera Ingestor
    participant Redis
    participant SR as StreamReader
    participant FE as Frontend
    participant CSM as CameraStreamManager
    participant ML as ML Service
    participant Milvus
    participant PG as PostgreSQL

    RTSP->>CI: raw video
    CI->>CI: sample every 2s, JPEG encode, base64
    CI->>Redis: XADD camera_ingestor:stream
    SR->>Redis: XREADGROUP (BLOCK 100ms)
    Redis-->>SR: messages
    SR->>FE: socket.emit('camera-frame') ← broadcasts to ALL clients
    SR->>SR: getSession(cam_id) — in-memory cache check
    alt Session ACTIVE
        SR->>CSM: send(cam_id, frame_id, imageBase64)
        CSM->>ML: WS {type:'recognize', image, frame_id}
        ML->>ML: detect faces (SCRFD 640×640)
        ML->>ML: preprocess (align→quality→CLAHE)
        ML->>ML: get_embedding (ArcFace normed_embedding)
        Note over ML: ⚠️ anti-spoofing NOT called here
        ML->>Milvus: search_face(embedding, top_k=1)
        Milvus-->>ML: {person_id=emp_id, confidence}
        ML-->>CSM: {frame_id, faces:[{bbox, roll_number, confidence}]}
        CSM->>PG: SELECT name FROM students WHERE student_id=roll_number
        CSM->>FE: emit('face-recognition-result')
        CSM->>PG: UPDATE attendance_records SET status='PRESENT'\nWHERE session_id=? AND student_id=? AND status='ABSENT'\nAND manually_marked=FALSE AND within grace period
        CSM->>FE: emit('session-attendance-update')
    end
    SR->>Redis: XACK + XDEL
```

### 6.2 Enrollment Flow

```mermaid
sequenceDiagram
    participant User as Admin Browser
    participant BE as Backend Express
    participant ML as ML Service FastAPI
    participant Milvus
    participant PG as PostgreSQL

    User->>BE: POST /api/enroll (student_id, name, files[3-5])
    BE->>BE: validate 12-digit student_id
    BE->>ML: POST /enroll (emp_id=student_id, files)
    loop per image
        ML->>ML: imdecode → detect_faces → select_largest
        ML->>ML: preprocess_face (mode='enroll', strict)
        ML->>ML: get_embedding (ArcFace)
    end
    ML->>ML: compute_centroid (mean of ≥3 embeddings)
    ML->>Milvus: insert_face(emp_id, centroid, template_version=1)
    Milvus-->>ML: milvus_id (INT64)
    ML-->>BE: {success:true, person_id: str(milvus_id)}
    BE->>PG: INSERT INTO students ON CONFLICT UPDATE milvus_id
    PG-->>BE: student row
    BE-->>User: {success:true, student:{...}}
```

### 6.3 ML Pipeline Audit

| Stage | Status | Issues |
|---|---|---|
| Frame ingestion | ✅ | Fixed 2s interval; no adaptive rate |
| Face detection (SCRFD) | ✅ | Hardcoded `det_size=(640,640)` — multi-scale env vars exist but are ignored |
| Face alignment | ✅ | AffineTransform to canonical 112×112 |
| Quality checks | ✅ | Blur, brightness, size, frontality; separate enroll vs recognize profiles |
| CLAHE enhancement | ✅ | Applied post-alignment |
| ArcFace embedding | ✅ | `normed_embedding` + explicit L2 normalization |
| Milvus ANN search | ✅ | IVF_FLAT, IP metric, nprobe=10 |
| Template versioning | ✅ | Highest-version wins on search collapse |
| **Anti-spoofing** | ❌ | **MiniFASNet initialized but NEVER called in `/ws/recognize`** |
| Temporal voting | ⚠️ | `recognition_history` populated; voting env vars defined; voting logic never applied to gate results |
| Multi-scale detection | ❌ | `FACE_DET_SIZES` env var documented in README + `.env.example` but not read in `face_processor.py` |

---

## 7. Professional Evaluation & Scorecard

| Area | Score | Justification |
|---|---|---|
| **Architecture** | 7/10 | Well-conceived polyglot design; let down by layering violations and dead code |
| **Code Quality** | 6/10 | Readable, consistent naming; debug logs in production paths; no linting config |
| **Security** | 3/10 | No auth on any endpoint; wildcard CORS; RTSP creds in repo; SSRF risk; no rate limiting |
| **Reliability** | 5/10 | Good reconnect/backpressure logic; anti-spoofing is dead code; multi-scale detection is docs-only |
| **Performance** | 6/10 | Per-camera persistent WS is efficient; `io.emit` broadcasts ALL frames to ALL clients |
| **Maintainability** | 5/10 | Schema divergence; no tests; no linting; root `requirement.txt` misleading |
| **Product Fit** | 7/10 | All core journeys implemented; main gap is dead anti-spoofing and broken active-session detection on monitor page |
| **Data Model** | 6/10 | Schema well-designed, good indexes; schema vs migration mismatch is a critical operational issue |

### Strengths (Keep)
1. **Dual-path streaming** — display vs ML routing at stream reader is elegant and efficient.
2. **`conn.busy` backpressure** — exactly right for real-time ML pipelines.
3. **Grace period logic** — `GRACE_PERIOD_MINUTES` + `manually_marked` guard is sound.
4. **Preprocessing module** — stateless, well-structured, separates concerns cleanly.
5. **Template versioning** — allows re-enrollment without breaking existing embeddings.
6. **Immediate session cache invalidation** on start/end is a good UX decision.
7. **Transactional session booking** — `BEGIN`/`COMMIT`/`ROLLBACK` used correctly.

---

## 8. Pre-Deployment Gap Analysis

| ID | Area | Issue (file reference) | Why it matters | Recommended change | Severity | Effort |
|---|---|---|---|---|---|---|
| G01 | Schema | `prisma/migrations/0_init/migration.sql` creates V1 schema (`employees/cameras/attendance_events`); `schema.prisma` defines V2 (`rooms/students/sessions`). Fresh clone with `prisma migrate dev` produces mixed tables | System won't start cleanly | Delete stale migration; run `prisma migrate reset`; generate new initial migration; change `migrate` script to `prisma migrate deploy` | Critical | S |
| G02 | ML Pipeline | `antispoof_predictor` initialized at `main.py:127` but `/ws/recognize` handler (`main.py:377-491`) never calls it | Anti-spoofing (core feature) is inactive; photos of students pass recognition | Add `antispoof_predictor.predict(face_crop)` before Milvus search; reject `is_live=False` faces | Critical | S |
| G03 | Docker | `docker-compose.yml:143` mounts `./Backend:/app` which shadows the image's installed `node_modules` | Backend container frequently fails to start | Use multi-stage build or copy-only approach; remove source volume mount | Critical | M |
| G04 | Auth | No authentication/authorization on any REST endpoint | Anyone on the network can read/modify/delete all student and attendance data | Add JWT middleware on all `/api/*` routes; token-based login | Critical | M |
| G05 | Data Contract | `GET /api/sessions/today` (`session.model.js:109`) omits `room_id`; `ClassroomMonitor.jsx:50` matches on `s.room_id === cam.room_id` | Active session detection on monitor page always fails silently | Add `r.room_id` to SELECT in `getTodaySessions` | Critical | S |
| G06 | ML Pipeline | `FACE_DET_SIZES`/`FACE_DET_THRESHOLDS` env vars documented but never read; `face_processor.py:95` uses hardcoded `det_size=(640, 640)` | Documented CCTV tuning feature doesn't work; small/distant faces missed | Implement multi-scale retry in `detect_faces()` | High | M |
| G07 | Security | `ml_service/main.py:75`: `allow_origins=["*"]` with `allow_credentials=True` — invalid per CORS spec; browsers reject this combination | CORS errors; potential credential leakage | Set `ALLOWED_ORIGINS` from env var in ML CORS config | High | S |
| G08 | Security | `camera_ingestor/config.yaml:7`: `rtsp://user:pass@192.168.1.100:554/stream` committed to repo | RTSP credentials in version control | Add `config.yaml` to `.gitignore`; replace with placeholder template | High | S |
| G09 | Performance | `streamReader.js:77`: `io.emit('camera-frame', ...)` broadcasts every frame to all Socket.IO clients | N clients × M cameras bandwidth; unscalable | Use Socket.IO rooms per camera; clients subscribe on camera select | High | M |
| G10 | Code Quality | `student.model.js:171-175`: hex dump debug logging runs on every enrollment | Logs file data noise; slows enrollment | Remove debug block | High | S |
| G11 | Schema | `package.json:10`: `migrate` script runs `prisma db push` (no migration tracking) | Schema drift with no audit trail | Change to `prisma migrate deploy` | High | S |
| G12 | Reliability | Camera ingestor fetches cameras once at startup; never polls for new cameras | Newly added cameras require container restart | Add background polling thread for camera changes | High | M |
| G13 | Security | `/api` proxy-snapshot endpoint (`routes/index.js:27-43`) accepts arbitrary user-supplied URLs | SSRF — attacker can probe internal network | Validate URL against allowlist of permitted hosts/IPs | High | S |
| G14 | Reliability | `sessionCache.js` doesn't guard for `actual_start = NULL`; `new Date(null)` = epoch → grace period always expired | Attendance never marked if actual_start null | Add null guard: `if (!row.actual_start) continue` | Medium | S |
| G15 | Frontend | `ClassroomMonitor.jsx:38`: sessions stored in `window.__todaySessions` global | Global state pollution; breaks with multiple instances | Use React state/context | Medium | S |
| G16 | Camera Ingestor | `config.yaml` never read at runtime (ingestor reads from ENV/DB); contains misleading example with hardcoded RTSP creds | Misleads developers | Either implement YAML loading or delete and document in README | Medium | S |
| G17 | Tests | No automated tests exist in any service | No regression safety net | Add unit tests for session model, sessionCache, preprocessing pipeline, and enrollment flow | High | L |
| G18 | Container | `camera_ingestor/Dockerfile` is incomplete: missing `COPY requirements.txt`, `RUN pip install`, `COPY . .`, `CMD` | Camera ingestor Docker image won't run | Complete the Dockerfile | Critical | S |
| G19 | Container | `ml_service/Dockerfile:27` `COPY . .` includes `scripts/test_face_frame.jpg` (767 KB), `debug_frame*.jpg` etc. | Image bloat | Add files to `.dockerignore` | Low | S |
| G20 | Dependency | `Backend/package.json:29`: `"fs": "^0.0.1-security"` — built-in `fs` doesn't need declaration; stub package may shadow native | Unnecessary dependency | Remove `"fs"` from dependencies | Medium | S |
| G21 | Env | `.env.example:80`: `ALLOWED_ORIGINS=*` — dangerous default shipped as template | Wildcard shipped to production | Add startup warning when `ALLOWED_ORIGINS=*` and `NODE_ENV=production` | Medium | S |
| G22 | Data | `room.model.js:86-103` `deleteRoom` doesn't check for existing sessions before deletion | FK violations or orphaned records | Add pre-delete check for associated sessions | Medium | S |
| G23 | Dead Code | `camera_ingestor/node_adapter/adapter.js` consumes from same Redis stream as backend using different consumer group (`camera_ingestor_group` vs `backend_stream_group`); not referenced in any compose or backend code | Confusing; if accidentally started, causes double-consumption | Delete file or document clearly as archived alternative | Low | S |
| G24 | ML | `anti_spoofing/best.pth` (948 KB PyTorch weights) never loaded by any code | Binary artifact in git; should be in model registry | Remove from repo; add `*.pth` to `.gitignore` | Low | S |
| G25 | Security | No rate limiting on any backend endpoint | DoS via flooding `/api/enroll` (CPU + disk intensive) | Add `express-rate-limit`; ≤5 enrollment req/min per IP | High | S |
| G26 | Frontend | No production Dockerfile for frontend; `docker-compose.yml:168` uses `image: node:18` running `npm run dev` | Dev server in production is not acceptable | Add `frontend/Dockerfile` with `vite build` + nginx | High | M |
| G27 | Env | `FACE_DET_SIZES`/`FACE_DET_THRESHOLDS` in `.env.example` never consumed | Misleads operators; undocumented noop | Implement feature (G06) or remove variables | Medium | S |
| G28 | Reliability | `health.model.js` creates a separate `IORedis` instance for health checks | Extra connection overhead | Reuse `getRedisClient()` from `streamReader.js` | Low | S |
| G29 | Security | `.env` file is committed to the repository (`2764 bytes` confirmed present in repo) | Real secrets in version control | Add `.env` to `.gitignore` immediately; rotate all secrets | Critical | S |

---

## 9. Prioritized Action Plan

### Phase 1 — Blockers (must fix before app can run end-to-end)

| # | Task | Gap IDs | Effort |
|---|---|---|---|
| 1.1 | Remove `.env` from repo, add to `.gitignore`, rotate all secrets | G29 | S |
| 1.2 | Fix Prisma migration: delete stale `0_init/migration.sql`, reset, generate correct initial migration, change script to `prisma migrate deploy` | G01, G11 | S |
| 1.3 | Add `room_id` to `getTodaySessions` SELECT | G05 | S |
| 1.4 | Complete `camera_ingestor/Dockerfile` | G18 | S |
| 1.5 | Fix Docker Backend volume mount | G03 | M |

### Phase 2 — Core Completion

| # | Task | Gap IDs | Effort |
|---|---|---|---|
| 2.1 | Wire anti-spoofing into `/ws/recognize` | G02 | S |
| 2.2 | Implement multi-scale detection (read env vars) | G06 | M |
| 2.3 | Fix `io.emit` broadcast → Socket.IO rooms per camera | G09 | M |
| 2.4 | Remove enrollment debug logging | G10 | S |
| 2.5 | Add camera ingestor dynamic reload | G12 | M |
| 2.6 | Fix SSRF on proxy-snapshot endpoint | G13 | S |
| 2.7 | Add null guard for `actual_start` in sessionCache | G14 | S |

### Phase 3 — Pre-Deployment Readiness

| # | Task | Gap IDs | Effort |
|---|---|---|---|
| 3.1 | Add JWT authentication on all `/api/*` routes | G04 | M |
| 3.2 | Fix ML service CORS (env-configured origins) | G07 | S |
| 3.3 | Remove RTSP creds from `config.yaml`; add to `.gitignore` | G08 | S |
| 3.4 | Add `express-rate-limit` | G25 | S |
| 3.5 | Add production frontend Dockerfile (Vite build + nginx) | G26 | M |
| 3.6 | Fix `deleteRoom` pre-check for sessions | G22 | S |
| 3.7 | Remove `best.pth`; add `*.pth` to `.gitignore` | G24 | S |
| 3.8 | Remove `"fs"` from Backend `package.json` | G20 | S |
| 3.9 | Add smoke / integration tests | G17 | L |

### Phase 4 — Recommended Improvements

| # | Task | Notes |
|---|---|---|
| 4.1 | Structured logging (pino/winston) | Replace all `console.log` |
| 4.2 | Service layer refactor | Extract attendance marking out of `CameraStreamManager` |
| 4.3 | Implement temporal voting | `recognition_history` exists; gate results with vote threshold |
| 4.4 | Model artifact management | Store model files in S3/DVC rather than git |
| 4.5 | CI/CD pipeline | GitHub Actions: lint, test, build Docker images |
| 4.6 | ML service Docker healthcheck | Change `condition: service_started` to `service_healthy` |
| 4.7 | Replace `window.__todaySessions` with React context | G15 |

---

## 10. Assumptions, Unverified Items & Open Questions

### Assumptions
- **Deployment target:** Single-site, on-premises (university lab). Inferred from RTSP architecture and domain model.
- **Scale:** Small-to-medium (≤10 cameras, ≤500 students). At larger scales, the `io.emit` broadcast and IVF_FLAT index (nlist=1024 on <500 vectors queries every cluster) need revisiting.
- **`.env` at root:** Confirmed present and 2764 bytes. Contents deliberately not read to avoid exposing real credentials. Its presence in the repo is a **critical security risk** if the repo is or becomes public.

### Unverified
- **`infra/milvus/docker-compose.yml`**: Appears to be an older standalone stack, superseded by root `docker-compose.yml`. Assumed dead infrastructure config — not confirmed deleted.
- **`node_adapter/adapter.js`**: Never referenced in compose or backend. Uses different consumer group name. Assumed dead prototype artefact — not confirmed intentionally disabled.
- **`anti_spoofing/best.pth`**: May be source weights used to export `minifasnet.onnx`, or an unrelated model. No code loads it.
- **Whether `prisma migrate dev` was ever run**: The migration lock file indicates prisma 5, but migration content is from a previous schema version. Likely `prisma db push` was used exclusively.

### Open Questions
1. **Is this intended for real students' biometric data?** If yes, GDPR/DPDP Act/FERPA apply. Explicit consent, data minimization, and breach notification are required — none present.
2. **GPU in deployment?** ML service hard-fails on startup if `FORCE_GPU=true` and no CUDA available. Should `FORCE_GPU=false` be the `.env.example` default?
3. **Authentication model?** Internal SSO/LDAP vs standalone login changes implementation significantly.

---

## 11. Appendix: Commands Run

All code review was performed via **file reads only** (READ-ONLY). No services were started, no packages were installed, and no destructive commands were run.

```powershell
# List migration directory
Get-ChildItem "d:\pep-Intern\arcface_exp\Backend\prisma\migrations\0_init"
# Result: migration.sql (1568 bytes)

# Read stale migration SQL for schema comparison
Get-Content "d:\pep-Intern\arcface_exp\Backend\prisma\migrations\0_init\migration.sql"
# Result: CREATE TABLE employees, cameras, attendance_events (V1 schema confirmed)

# Confirm docs directory exists for report output
New-Item -ItemType Directory -Force -Path "d:\pep-Intern\arcface_exp\docs"
```

**Files read in full:** README.md, .env.example, docker-compose.yml, all Backend source files (index.js, streamReader.js, all routes/*, all models/*, all utils/*, DB/config.js, Dockerfile, package.json, schema.prisma, migration.sql), all ml_service source files (main.py, face_processor.py, recognition_pipeline.py, tracker.py, client.py, inference.py, embedding_manager.py, preprocessor.py, Dockerfile, requirements.txt), all frontend source files (App.jsx, all components, package.json, vite.config.js), camera_ingestor/camera_ingestor.py, config.yaml, node_adapter/adapter.js, infra/milvus/docker-compose.yml.

---

*Report generated 2026-09-23. All findings are based on static code analysis of a fully read (not sampled) codebase. No runtime verification was performed.*
