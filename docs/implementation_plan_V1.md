# College Attendance System — Full Implementation Plan

> **Decisions locked in:**
> D1: PRESENT/ABSENT per session, marked in real-time on each detection.
> D2: No dept/course/section. Attendance = student_id + room + session.
> D3: Pre-defined period slots. Faculty books a slot at start of day.
> D4: 15-min grace window. No late status. Manual override available.
> D5: Single detection = PRESENT.
> D6: Student ID is a 12-digit string e.g. `312323247048`.
> D11: Hikvision channel 101 (main stream). RTSP format: `rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/101`.
> D12: Camera list is DB-driven (ingestor reads from `cameras` table).
> D13: See section 4.2 below — `streamReader.js` performs session routing.
> D14: Current 5s sampling interval stays.
> D19: Student ID used as `emp_id` field in Milvus.
> D20: Ceiling-mounted corner camera. No threshold changes.
> D21: Bulk enrollment sessions (multiple students, 3–5 photos each).
> D23: Live session monitor required.
> D24: Reports on-demand only (no scheduled generation).
> Liveness: remains idle.

---

## Phase 1 — Database Schema

### 1.1 New Schema Design

**Drop all existing tables.** The old schema (employees, cameras, attendance_events) is replaced entirely.

**6 new tables:**

```
rooms              → physical classrooms
cameras            → one RTSP camera per room (DB-driven discovery)
students           → enrolled student records (no profile photo)
periods            → preset daily time slots (e.g. Period 1: 09:00–10:00)
sessions           → one session = one booking of a period in a room on a date
attendance_records → one row per (session, student) = PRESENT or ABSENT
```

**Relationships:**
- One `room` has one `camera`
- A `session` references one `period` and one `room`
- An `attendance_record` references one `session` and one `student`
- A `session` has many `attendance_records` (one per expected student)
- A `student` has many `attendance_records` across sessions

### 1.2 File: `Backend/prisma/schema.prisma`

**ACTION: Overwrite entirely with the following:**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Room {
  roomId    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid @map("room_id")
  roomName  String    @unique @map("room_name") @db.VarChar(100)
  createdAt DateTime  @default(now()) @map("created_at")

  camera    Camera?
  sessions  Session[]

  @@map("rooms")
}

model Camera {
  camId     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid @map("cam_id")
  roomId    String   @unique @db.Uuid @map("room_id")
  rtspUrl   String   @map("rtsp_url")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  room      Room     @relation(fields: [roomId], references: [roomId], onDelete: Cascade)

  @@map("cameras")
}

model Student {
  studentId   String    @id @map("student_id") @db.VarChar(20)
  name        String    @db.VarChar(100)
  milvusId    BigInt?   @unique @map("milvus_id")
  enrolledAt  DateTime  @default(now()) @map("enrolled_at")

  attendanceRecords AttendanceRecord[]

  @@map("students")
}

model Period {
  periodId   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid @map("period_id")
  periodName String    @map("period_name") @db.VarChar(50)
  startTime  String    @map("start_time") @db.VarChar(5)  // "09:00"
  endTime    String    @map("end_time")   @db.VarChar(5)  // "10:00"

  sessions   Session[]

  @@unique([startTime, endTime])
  @@map("periods")
}

model Session {
  sessionId   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid @map("session_id")
  periodId    String    @db.Uuid @map("period_id")
  roomId      String    @db.Uuid @map("room_id")
  sessionDate String    @map("session_date") @db.VarChar(10)  // "2026-09-21"
  status      String    @default("SCHEDULED") @db.VarChar(20) // SCHEDULED|ACTIVE|COMPLETED|CANCELLED
  bookedBy    String?   @map("booked_by") @db.VarChar(100)
  actualStart DateTime? @map("actual_start")
  actualEnd   DateTime? @map("actual_end")
  createdAt   DateTime  @default(now()) @map("created_at")

  period               Period             @relation(fields: [periodId], references: [periodId])
  room                 Room               @relation(fields: [roomId], references: [roomId])
  attendanceRecords    AttendanceRecord[]

  @@unique([periodId, roomId, sessionDate])
  @@index([status, sessionDate], name: "idx_sessions_status_date")
  @@map("sessions")
}

model AttendanceRecord {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionId       String    @db.Uuid @map("session_id")
  studentId       String    @map("student_id") @db.VarChar(20)
  status          String    @default("ABSENT") @db.VarChar(10) // PRESENT|ABSENT
  detectedAt      DateTime? @map("detected_at")
  similarityScore Float?    @map("similarity_score")
  manuallyMarked  Boolean   @default(false) @map("manually_marked")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at")

  session  Session @relation(fields: [sessionId], references: [sessionId], onDelete: Cascade)
  student  Student @relation(fields: [studentId], references: [studentId])

  @@unique([sessionId, studentId])
  @@index([sessionId], name: "idx_records_session")
  @@index([studentId, sessionId], name: "idx_records_student_session")
  @@map("attendance_records")
}
```

### 1.3 Migration Steps

Run in order:
```bash
# 1. Drop all old tables
npx prisma db push --force-reset

# 2. Generate Prisma client
npx prisma generate

# 3. Verify tables in DB
npx prisma studio
```

> **Note:** `--force-reset` drops all tables and recreates. Since this is a dev environment with no real data, this is the correct approach. Do NOT use `migrate dev` for a complete schema replacement without first manually dropping the old migration history.

---

## Phase 2 — Backend: Delete Obsolete Files

**ACTION: Delete the following files:**
- `Backend/src/models/employee.model.js`
- `Backend/src/models/camera.model.js`
- `Backend/src/models/attendance.model.js`
- `Backend/src/routes/employeeRoutes.js`
- `Backend/src/queues/face.queue.js`
- `Backend/src/workers/face.worker.js`
- `Backend/src/queues/` (directory)
- `Backend/src/workers/` (directory)

**ACTION: In `Backend/package.json`, run:**
```bash
npm uninstall bullmq
npm install ioredis
```
(`ioredis` is needed by `streamReader.js` for Redis Streams consumption.)

---

## Phase 3 — Backend: New API Models & Routes

### 3.1 Create `Backend/src/models/room.model.js`

Exports 4 functions, all using raw `pg` pool:

| Function | HTTP | SQL |
|----------|------|-----|
| `getAllRooms(req, res)` | `GET /api/rooms` | `SELECT room_id, room_name, created_at FROM rooms ORDER BY room_name` |
| `createRoom(req, res)` | `POST /api/rooms` | `INSERT INTO rooms (room_id, room_name, created_at) VALUES (gen_random_uuid(), $1, NOW()) RETURNING *` — body: `{ room_name }` |
| `updateRoom(req, res)` | `PUT /api/rooms/:room_id` | `UPDATE rooms SET room_name=$1 WHERE room_id=$2 RETURNING *` |
| `deleteRoom(req, res)` | `DELETE /api/rooms/:room_id` | `DELETE FROM rooms WHERE room_id=$1` — returns 404 if not found |

### 3.2 Create `Backend/src/models/camera.model.js`

Exports 4 functions:

| Function | HTTP | SQL |
|----------|------|-----|
| `getAllCameras(req, res)` | `GET /api/cameras` | `SELECT c.cam_id, c.room_id, r.room_name, c.rtsp_url, c.is_active, c.created_at FROM cameras c JOIN rooms r ON c.room_id = r.room_id ORDER BY r.room_name` |
| `createCamera(req, res)` | `POST /api/cameras` | `INSERT INTO cameras (cam_id, room_id, rtsp_url, is_active, created_at) VALUES (gen_random_uuid(), $1, $2, TRUE, NOW()) RETURNING *` — body: `{ room_id, rtsp_url }` — validates room exists and has no camera already |
| `updateCamera(req, res)` | `PUT /api/cameras/:cam_id` | `UPDATE cameras SET rtsp_url=$1, is_active=$2 WHERE cam_id=$3 RETURNING *` — body: `{ rtsp_url, is_active }` |
| `deleteCamera(req, res)` | `DELETE /api/cameras/:cam_id` | `DELETE FROM cameras WHERE cam_id=$1` |

### 3.3 Create `Backend/src/models/period.model.js`

Exports 4 functions. A period is an admin-only pre-configured time slot:

| Function | HTTP | SQL |
|----------|------|-----|
| `getAllPeriods(req, res)` | `GET /api/periods` | `SELECT * FROM periods ORDER BY start_time` |
| `createPeriod(req, res)` | `POST /api/periods` | `INSERT INTO periods (period_id, period_name, start_time, end_time) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *` — body: `{ period_name, start_time, end_time }` format `"09:00"` |
| `updatePeriod(req, res)` | `PUT /api/periods/:period_id` | `UPDATE periods SET period_name=$1, start_time=$2, end_time=$3 WHERE period_id=$4 RETURNING *` |
| `deletePeriod(req, res)` | `DELETE /api/periods/:period_id` | `DELETE FROM periods WHERE period_id=$1` — returns 409 if sessions reference this period |

### 3.4 Create `Backend/src/models/student.model.js`

Exports 6 functions:

| Function | HTTP | Notes |
|----------|------|-------|
| `getAllStudents(req, res)` | `GET /api/students` | Returns `student_id, name, milvus_id, enrolled_at`. Supports `?name=` filter with `ILIKE '%$1%'`. |
| `getStudentById(req, res)` | `GET /api/students/:student_id` | 404 if not found. |
| `createStudent(req, res)` | `POST /api/students` | body: `{ student_id, name }`. Inserts with `milvus_id = NULL`. Validates `student_id` is 12-digit numeric string via regex `/^\d{12}$/`. |
| `deleteStudent(req, res)` | `DELETE /api/students/:student_id` | 204 on success. |
| `enrollStudent(req, res)` | `POST /api/enroll` | Accepts `multipart/form-data` with `student_id`, `name`, and 3–5 image files. Calls ML `POST /enroll` with `emp_id=student_id`. On ML success, inserts/updates student row with `milvus_id` from ML response. Returns enrolled student object. |
| `reEnrollStudent(req, res)` | `POST /api/re-enroll` | Accepts `student_id` and 3–20 image files. Student must already exist. Calls ML `POST /re-enroll`. Updates `milvus_id` on success. |

**For `enrollStudent` — ML call format:**
```
POST http://ML_SERVICE_URL/enroll
Content-Type: multipart/form-data
Fields: name=<name>, emp_id=<student_id>
Files: files[]=<image1>, files[]=<image2>, ...
```

**For `createStudent` (without enrollment):**
- This is for pre-loading the student roster from CSV or manual entry.
- `milvus_id` is NULL → student exists in DB but cannot be recognized yet.
- A `GET /api/students?enrolled=false` query (filter: `WHERE milvus_id IS NULL`) shows unenrolled students.

### 3.5 Create `Backend/src/models/session.model.js`

Exports 7 functions:

**`bookSession(req, res)` — `POST /api/sessions`**
- Body: `{ period_id, room_id, session_date, booked_by, student_ids: ["312323247048", ...] }`
- `session_date` format: `"YYYY-MM-DD"`
- Validation: 
  - Period must exist.
  - Room must exist.
  - Room must have an active camera (`SELECT cam_id FROM cameras WHERE room_id=$1 AND is_active=TRUE`). Return 400 if not.
  - No existing session for `(period_id, room_id, session_date)`.
- Transaction: 
  1. `INSERT INTO sessions ... RETURNING session_id`
  2. For each `student_id` in `student_ids`: `INSERT INTO attendance_records (id, session_id, student_id, status, created_at, updated_at) VALUES (gen_random_uuid(), $session_id, $student_id, 'ABSENT', NOW(), NOW()) ON CONFLICT (session_id, student_id) DO NOTHING`
- Returns full session object + count of attendance records created.

**`getTodaySessions(req, res)` — `GET /api/sessions/today`**
- SQL:
  ```sql
  SELECT s.session_id, s.status, s.booked_by, s.actual_start, s.actual_end,
         p.period_name, p.start_time, p.end_time,
         r.room_name,
         COUNT(ar.id) as total_students,
         COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as present_count
  FROM sessions s
  JOIN periods p ON s.period_id = p.period_id
  JOIN rooms r ON s.room_id = r.room_id
  LEFT JOIN attendance_records ar ON s.session_id = ar.session_id
  WHERE s.session_date = CURRENT_DATE::text
  GROUP BY s.session_id, p.period_name, p.start_time, p.end_time, r.room_name
  ORDER BY p.start_time
  ```

**`getSessionById(req, res)` — `GET /api/sessions/:session_id`**
- Returns session info + full attendance roster:
  ```sql
  SELECT ar.student_id, st.name, ar.status, ar.detected_at, ar.similarity_score, ar.manually_marked
  FROM attendance_records ar
  JOIN students st ON ar.student_id = st.student_id
  WHERE ar.session_id = $1
  ORDER BY st.name
  ```

**`startSession(req, res)` — `POST /api/sessions/:session_id/start`**
- Validates: session exists and status is `'SCHEDULED'`. Returns 400 if already ACTIVE/COMPLETED.
- SQL: `UPDATE sessions SET status='ACTIVE', actual_start=NOW() WHERE session_id=$1 AND status='SCHEDULED' RETURNING *`

**`endSession(req, res)` — `POST /api/sessions/:session_id/end`**
- Validates: session exists and status is `'ACTIVE'`.
- SQL: `UPDATE sessions SET status='COMPLETED', actual_end=NOW() WHERE session_id=$1 AND status='ACTIVE' RETURNING *`
- No further records to insert — ABSENT records were pre-inserted during `bookSession`.

**`cancelSession(req, res)` — `POST /api/sessions/:session_id/cancel`**
- Validates: status is `'SCHEDULED'` (cannot cancel active/completed sessions).
- SQL: `UPDATE sessions SET status='CANCELLED' WHERE session_id=$1 AND status='SCHEDULED'`

**`manualMarkAttendance(req, res)` — `PUT /api/sessions/:session_id/attendance/:student_id`**
- Body: `{ status: "PRESENT" | "ABSENT" }`
- SQL: `UPDATE attendance_records SET status=$1, manually_marked=TRUE, updated_at=NOW() WHERE session_id=$2 AND student_id=$3 RETURNING *`
- Returns 404 if the attendance_record does not exist (student not in the session roster).

### 3.6 Create `Backend/src/models/health.model.js`

Exports `getSystemHealth(req, res)` — `GET /api/health`

Checks 3 services:
1. **PostgreSQL:** `pool.query('SELECT 1')`
2. **Redis:** `ioredis.ping()` using the same `streamReaderClient` instance (exported from `streamReader.js`)
3. **ML Service:** `axios.get(ML_SERVICE_URL + '/health', { timeout: 3000 })`

Returns:
```json
{ "status": "healthy", "timestamp": "...", "services": { "postgres": "connected", "redis": "connected", "ml": { "status": "healthy", "gpu_available": true, "milvus_connected": true } } }
```

### 3.7 Create `Backend/src/routes/index.js`

Single router file that mounts all sub-routers:
```javascript
const router = express.Router();
router.use('/rooms',    require('./roomRoutes'));
router.use('/cameras',  require('./cameraRoutes'));
router.use('/periods',  require('./periodRoutes'));
router.use('/students', require('./studentRoutes'));
router.use('/sessions', require('./sessionRoutes'));
router.use('/health',   require('./healthRoutes'));

// Enrollment (uses disk multer for temp files)
router.post('/enroll',    uploadDisk.array('files', 5),  enrollStudent);
router.post('/re-enroll', uploadDisk.array('files', 20), reEnrollStudent);

module.exports = router;
```

Individual route files:
- `roomRoutes.js` — GET `/`, POST `/`, PUT `/:room_id`, DELETE `/:room_id`
- `cameraRoutes.js` — GET `/`, POST `/`, PUT `/:cam_id`, DELETE `/:cam_id`
- `periodRoutes.js` — GET `/`, POST `/`, PUT `/:period_id`, DELETE `/:period_id`
- `studentRoutes.js` — GET `/`, GET `/:student_id`, POST `/`, DELETE `/:student_id`
- `sessionRoutes.js` — GET `/today`, GET `/:session_id`, POST `/`, POST `/:session_id/start`, POST `/:session_id/end`, POST `/:session_id/cancel`, PUT `/:session_id/attendance/:student_id`
- `healthRoutes.js` — GET `/`

### 3.8 Update `Backend/src/index.js`

Replace the old `app.use('/api', employeeRoutes)` line with:
```javascript
app.use('/api', require('./routes/index'));
```

Remove: `const employeeRoutes = require('./routes/employeeRoutes');`

---

## Phase 4 — Backend: Real-Time Attendance Pipeline

### 4.1 D13 — Session Routing Decision

**Chosen: Option A — `streamReader.js` performs session routing.**

`streamReader.js` maintains an in-memory cache of active sessions, refreshed every 30 seconds from the DB. For each incoming frame it looks up `cam_id → session`. If an active session exists, it passes the `session_id` to `CameraStreamManager`. If no active session exists, it still emits `camera-frame` for display but does NOT route to ML.

**Why Option A over B:**
- Avoids sending frames to ML and opening GPU work for rooms with no active class.
- The cache lookup is O(1) and eliminates a DB round-trip per frame.
- Simple and testable independently of the ML pipeline.

### 4.2 Create `Backend/src/utils/sessionCache.js`

This module holds the active session cache and refreshes it periodically.

```javascript
// sessionCache.js
const pool = require('../DB/config');

let cache = new Map(); // cam_id (UUID) → { session_id, room_id, actual_start (Date) }

async function refresh() {
  try {
    const { rows } = await pool.query(`
      SELECT s.session_id, s.actual_start, c.cam_id
      FROM sessions s
      JOIN rooms r ON s.room_id = r.room_id
      JOIN cameras c ON r.room_id = c.room_id
      WHERE s.status = 'ACTIVE'
        AND s.session_date = CURRENT_DATE::text
        AND c.is_active = TRUE
    `);
    const newCache = new Map();
    for (const row of rows) {
      newCache.set(row.cam_id, {
        session_id: row.session_id,
        actual_start: new Date(row.actual_start),
      });
    }
    cache = newCache;
  } catch (err) {
    console.error('[SessionCache] Refresh error:', err.message);
  }
}

function getSession(cam_id) {
  return cache.get(cam_id) || null;
}

function startAutoRefresh(intervalMs = 30000) {
  refresh(); // immediate first load
  setInterval(refresh, intervalMs);
}

module.exports = { getSession, refresh, startAutoRefresh };
```

### 4.3 Create `Backend/src/utils/CameraStreamManager.js`

Full implementation:

```javascript
const WebSocket = require('ws');
const pool = require('../DB/config');
const { getSession } = require('./sessionCache');

const ML_WS_BASE = (process.env.ML_SERVICE_URL || 'http://localhost:8000')
  .replace(/^http/, 'ws') + '/ws/recognize';
const GRACE_MINUTES = parseInt(process.env.GRACE_PERIOD_MINUTES || '15');
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class CameraStreamManager {
  constructor(io) {
    this.io = io;
    // Map<cam_id, { ws, status: 'connecting'|'open'|'closed', busy: bool, reconnectAttempts: int }>
    this.connections = new Map();
  }

  /**
   * Called by streamReader for every frame from Redis.
   * cam_id: string UUID from cameras table.
   * frame_id: monotonic integer.
   * imageBase64: JPEG base64 string.
   */
  send(cam_id, frame_id, imageBase64) {
    const conn = this._getOrCreate(cam_id);
    // Backpressure: if already processing a frame, drop this one for ML
    // (frame is still shown to frontend via camera-frame event in streamReader)
    if (conn.busy) return;
    if (conn.status !== 'open') return;

    conn.busy = true;
    conn.currentFrameId = frame_id;
    conn.ws.send(JSON.stringify({
      type: 'recognize',
      image: imageBase64,
      frame_id,
    }), (err) => {
      if (err) {
        console.error(`[CSM] Send error cam=${cam_id}: ${err.message}`);
        conn.busy = false;
      }
    });
  }

  _getOrCreate(cam_id) {
    if (!this.connections.has(cam_id)) {
      this._initConnection(cam_id);
    }
    return this.connections.get(cam_id);
  }

  _initConnection(cam_id) {
    const conn = { ws: null, status: 'connecting', busy: false, reconnectAttempts: 0, currentFrameId: null };
    this.connections.set(cam_id, conn);
    this._connect(cam_id, conn);
  }

  _connect(cam_id, conn) {
    // Pass cam_id as query param so ML service uses it as session key
    const url = `${ML_WS_BASE}?cam_id=${encodeURIComponent(cam_id)}`;
    const ws = new WebSocket(url, { perMessageDeflate: false });
    conn.ws = ws;
    conn.status = 'connecting';

    ws.on('open', () => {
      conn.status = 'open';
      conn.reconnectAttempts = 0;
      console.log(`[CSM] WS open for cam=${cam_id}`);
    });

    ws.on('message', (raw) => {
      conn.busy = false; // ready for next frame
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.faces !== undefined) {
          this._handleResult(cam_id, msg.frame_id ?? conn.currentFrameId, msg.faces);
        }
      } catch (e) {
        console.error(`[CSM] Parse error cam=${cam_id}: ${e.message}`);
      }
    });

    ws.on('close', () => {
      conn.status = 'closed';
      conn.busy = false;
      this._scheduleReconnect(cam_id, conn);
    });

    ws.on('error', (err) => {
      console.error(`[CSM] WS error cam=${cam_id}: ${err.message}`);
      conn.busy = false;
    });
  }

  async _handleResult(cam_id, frame_id, faces) {
    // Get the current active session for this camera from the in-memory cache
    const sessionInfo = getSession(cam_id);

    // Step 1: Name lookup + emit face-recognition-result to frontend regardless
    const resolvedFaces = await Promise.all(faces.map(async (face) => {
      if (!face.roll_number) return { bbox: face.bbox, student_id: null, name: 'Unknown', confidence: face.confidence };
      try {
        const { rows } = await pool.query(
          'SELECT name FROM students WHERE student_id = $1',
          [face.roll_number]
        );
        return {
          bbox: face.bbox,
          student_id: face.roll_number,
          name: rows.length ? rows[0].name : 'Unknown',
          confidence: face.confidence,
        };
      } catch {
        return { bbox: face.bbox, student_id: face.roll_number, name: 'Unknown', confidence: face.confidence };
      }
    }));

    // Emit to frontend for canvas overlay (no imageBase64 — already sent via camera-frame)
    this.io.emit('face-recognition-result', { cam_id, frame_id, faces: resolvedFaces });

    // Step 2: Mark attendance if a session is active
    if (!sessionInfo) return;
    const { session_id, actual_start } = sessionInfo;
    const now = new Date();
    const graceDeadline = new Date(actual_start.getTime() + GRACE_MINUTES * 60 * 1000);
    const withinGrace = now <= graceDeadline;

    for (const face of resolvedFaces) {
      if (!face.student_id || !withinGrace) continue;
      // Only flip ABSENT → PRESENT; never overwrite manually_marked records
      // Only mark students already in the session's attendance_records (pre-booked)
      await pool.query(`
        UPDATE attendance_records
        SET status = 'PRESENT',
            detected_at = NOW(),
            similarity_score = $1,
            updated_at = NOW()
        WHERE session_id = $2
          AND student_id = $3
          AND status = 'ABSENT'
          AND manually_marked = FALSE
      `, [face.confidence, session_id, face.student_id]);

      // Emit real-time attendance update so the live roster in the frontend updates
      this.io.emit('session-attendance-update', {
        session_id,
        student_id: face.student_id,
        name: face.name,
        status: 'PRESENT',
        detected_at: now.toISOString(),
      });
    }
  }

  _scheduleReconnect(cam_id, conn) {
    conn.reconnectAttempts++;
    const delay = Math.min(RECONNECT_BASE_MS * (2 ** (conn.reconnectAttempts - 1)), RECONNECT_MAX_MS);
    console.log(`[CSM] Reconnecting cam=${cam_id} in ${delay}ms`);
    setTimeout(() => {
      if (this.connections.has(cam_id)) {
        this._connect(cam_id, this.connections.get(cam_id));
      }
    }, delay);
  }

  closeAll() {
    for (const [, conn] of this.connections) {
      if (conn.ws) conn.ws.terminate();
    }
    this.connections.clear();
  }
}

module.exports = CameraStreamManager;
```

### 4.4 Create `Backend/src/streamReader.js`

Replaces the old `camera_ingestor/node_adapter/adapter.js`. Now lives inside the backend process.

```javascript
const IORedis = require('ioredis');
const { getSession } = require('./utils/sessionCache');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const STREAM_KEY = process.env.STREAM_KEY || 'camera_ingestor:stream';
const GROUP = 'backend_stream_group';
const CONSUMER = 'backend_consumer_1';
const BLOCK_MS = 100; // Reduced from 2000ms — eliminates 2s lag

let client = null;
let frameCounter = 0;

async function ensureGroup(redisClient) {
  try {
    await redisClient.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM');
  } catch (err) {
    if (!String(err).includes('BUSYGROUP')) throw err;
  }
}

async function startStreamReader(io, cameraStreamManager) {
  client = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
  await client.connect();
  await ensureGroup(client);
  console.log(`[StreamReader] Started. Listening on Redis stream: ${STREAM_KEY}`);

  while (true) {
    try {
      const resp = await client.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'BLOCK', BLOCK_MS,
        'COUNT', 5,
        'STREAMS', STREAM_KEY, '>'
      );
      if (!resp) continue;

      for (const [, messages] of resp) {
        for (const [streamMsgId, fields] of messages) {
          const data = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          const cam_id = data.cam_id;
          const imageBase64 = data.imageBase64;
          const requestTime = data.requestTime;
          if (!cam_id || !imageBase64) continue;

          const frameId = ++frameCounter;

          // PATH 1 — Display: emit frame immediately to all frontend clients
          io.emit('camera-frame', { cam_id, frame_id: frameId, imageBase64, requestTime });

          // PATH 2 — ML: only if there is an active session for this camera
          const sessionInfo = getSession(cam_id);
          if (sessionInfo) {
            cameraStreamManager.send(cam_id, frameId, imageBase64);
          }

          // ACK and delete from stream
          try {
            await client.xack(STREAM_KEY, GROUP, streamMsgId);
            await client.xdel(STREAM_KEY, streamMsgId);
          } catch (ackErr) {
            console.error('[StreamReader] ACK error:', ackErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[StreamReader] Read error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function getRedisClient() {
  return client;
}

module.exports = { startStreamReader, getRedisClient };
```

### 4.5 Update `Backend/src/index.js`

Add to the top:
```javascript
const CameraStreamManager = require('./utils/CameraStreamManager');
const { startStreamReader } = require('./streamReader');
const sessionCache = require('./utils/sessionCache');
```

After `socketHandler(io);` add:
```javascript
// Start session cache auto-refresh (polls DB every 30s for active sessions)
sessionCache.startAutoRefresh(30000);

// Start Redis stream reader + camera stream manager
const cameraStreamManager = new CameraStreamManager(io);
startStreamReader(io, cameraStreamManager).catch((err) => {
  console.error('[StreamReader] Fatal:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  cameraStreamManager.closeAll();
  process.exit(0);
});
process.on('SIGINT', async () => {
  cameraStreamManager.closeAll();
  process.exit(0);
});
```

### 4.6 Update `Backend/src/utils/socketHandler.js`

**Remove:**
- `QueueEvents` import and all `queueEvents.on(...)` listeners (no BullMQ).
- The `enroll-capture` and `enroll-submit` socket event handlers (if still present).
- The inline `recognizeViaWebSocket` function and `recognize-face` event handler.
- All attendance logging code (now in `CameraStreamManager._handleResult`).

**Keep:**
- `check-ml-service` socket event (health check pings `ML_SERVICE_URL/health`).
- `disconnect` event handler.

**Add:**
- A `recognize-face` socket handler specifically for the `DirectWebcamRecognition.jsx` testing component. This is the ONLY place a one-off WebSocket to ML is acceptable (infrequent, test-only):
  ```javascript
  socket.on('recognize-face', async (data) => {
    const { image, camera_id } = data;
    if (!image) { socket.emit('recognition-error', { message: 'No image' }); return; }
    // ... existing recognizeViaWebSocket function stays for this handler only
    const mlResponse = await recognizeViaWebSocket(image, data.frame_id);
    const faces = (mlResponse.faces || []).map(f => ({
      bbox: f.bbox,
      student_id: f.roll_number,
      confidence: f.confidence,
    }));
    socket.emit('recognition-result', { camera_id, faces });
  });
  ```

---

## Phase 5 — ML Service: cam_id Session Isolation

### 5.1 Modify `ml_service/main.py` — WebSocket endpoint signature

**Find the current WebSocket route definition:**
```python
@app.websocket("/ws/recognize")
async def websocket_recognize(websocket: WebSocket):
    session_key = f"ws:{id(websocket)}"
```

**Replace with:**
```python
from typing import Optional
from fastapi import WebSocket, Query

@app.websocket("/ws/recognize")
async def websocket_recognize(
    websocket: WebSocket,
    cam_id: Optional[str] = Query(default=None)
):
    # Use cam_id as session key if provided — ensures tracker state persists
    # across frames from the same camera even on reconnect.
    # Falls back to websocket object id for direct test connections.
    session_key = cam_id if cam_id else f"ws:{id(websocket)}"
```

No other changes to `main.py`. The rest of the WebSocket handler already uses `session_key` correctly.

**Note:** The ML response already returns `{ "frame_id": int, "faces": [{"bbox": [...], "roll_number": str, "confidence": float}] }` after Phase 1 cleanup. No changes needed.

---

## Phase 6 — Camera Ingestor: DB-Driven Discovery

### 6.1 Add `psycopg2-binary` dependency

In `camera_ingestor/requirements.txt` (create if not exists), add:
```
psycopg2-binary>=2.9.0
```

In `camera_ingestor/Dockerfile` (or the docker-compose build step), ensure `pip install -r requirements.txt` is called.

### 6.2 Modify `camera_ingestor/camera_ingestor.py`

**Goal:** Replace static YAML camera list with a DB query. Add a background thread that re-checks the DB every 60 seconds and starts/stops `CameraWorker` threads dynamically.

**Changes:**
- Add import: `import psycopg2`
- Add function `load_cameras_from_db(db_conn_str)` that returns a list of dicts matching the old YAML camera format:
  ```python
  def load_cameras_from_db(db_conn_str):
      """Query active cameras from PostgreSQL."""
      conn = psycopg2.connect(db_conn_str)
      cur = conn.cursor()
      cur.execute("SELECT cam_id, rtsp_url FROM cameras WHERE is_active = TRUE")
      rows = cur.fetchall()
      cur.close()
      conn.close()
      return [
          {
              'cam_id': str(row[0]),
              'rtsp': row[1],
              'sample_interval_s': float(os.getenv('SAMPLE_INTERVAL_S', '5')),
          }
          for row in rows
      ]
  ```
- Remove the `originalName` and `site_id` fields from the payload dict in `CameraWorker.run()`. Keep only: `{ 'imageBase64': image_b64, 'cam_id': cam_id, 'requestTime': ... }`.
- In `main()`, replace:
  ```python
  cameras = cfg.get('cameras', [])
  ```
  With:
  ```python
  DB_URL = os.getenv('DATABASE_URL')
  if DB_URL:
      cameras = load_cameras_from_db(DB_URL)
      print(f"[ingestor] Loaded {len(cameras)} cameras from DB")
  else:
      cameras = cfg.get('cameras', [])  # fallback to YAML for local dev
      print(f"[ingestor] Using {len(cameras)} cameras from config.yaml (no DB_URL set)")
  ```
- After spawning initial worker threads, add a camera-refresh thread:
  ```python
  def camera_refresh_loop(db_url, current_workers_ref, r, stream_key, heartbeat_ttl, stop_event):
      while not stop_event.is_set():
          time.sleep(60)
          if stop_event.is_set():
              break
          try:
              live_cameras = load_cameras_from_db(db_url)
              live_ids = {c['cam_id'] for c in live_cameras}
              running_ids = {w.cam_cfg['cam_id'] for w in current_workers_ref if w.is_alive()}

              # Start new cameras
              for cam in live_cameras:
                  if cam['cam_id'] not in running_ids:
                      w = CameraWorker(cam, r, stream_key, heartbeat_ttl)
                      w.start()
                      current_workers_ref.append(w)
                      print(f"[ingestor] Started new worker for cam {cam['cam_id']}")

              # Stop deactivated cameras (workers check STOP_EVENT, we can't kill them directly)
              # Deactivated cameras will simply not produce frames since RTSP will fail.
              # They'll retry every 5s and log failures. Acceptable for now.
          except Exception as e:
              print(f"[ingestor] Camera refresh error: {e}")

  if DB_URL:
      refresh_thread = threading.Thread(
          target=camera_refresh_loop,
          args=(DB_URL, workers, r, stream_key, heartbeat_ttl, STOP_EVENT),
          daemon=True
      )
      refresh_thread.start()
  ```

### 6.3 Update `docker-compose.yml` — `camera-ingestor` service

Add `DATABASE_URL` environment variable to the `camera-ingestor` service:
```yaml
camera-ingestor:
  environment:
    - DATABASE_URL=postgresql://postgres:password@postgres:5432/face_attendance
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - SAMPLE_INTERVAL_S=5
```

### 6.4 Remove `camera-adapter` service from `docker-compose.yml`

The old `camera-adapter` service is completely removed. Its functionality is now inside `Backend/src/streamReader.js`.

Add the following environment variables to the `backend` service in `docker-compose.yml`:
```yaml
backend:
  environment:
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - STREAM_KEY=camera_ingestor:stream
    - GRACE_PERIOD_MINUTES=15
```

---

## Phase 7 — Frontend: New UI

### 7.1 New Route Structure in `frontend/src/App.jsx`

Replace existing routes:
```jsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Navigate to="/monitor" replace />} />
    <Route path="/monitor" element={<AppLayout socket={socket}><ClassroomMonitor socket={socket} /></AppLayout>} />
    <Route path="/sessions" element={<AppLayout socket={socket}><SessionsPage socket={socket} /></AppLayout>} />
    <Route path="/sessions/book" element={<AppLayout socket={socket}><BookSessionPage /></AppLayout>} />
    <Route path="/sessions/:session_id" element={<AppLayout socket={socket}><SessionDetail socket={socket} /></AppLayout>} />
    <Route path="/enroll" element={<AppLayout socket={socket}><EnrollmentPage /></AppLayout>} />
    <Route path="/admin/*" element={<AppLayout socket={socket}><AdminPortal /></AppLayout>} />
    <Route path="/test" element={<DirectWebcamRecognition socket={socket} />} />
  </Routes>
</BrowserRouter>
```

### 7.2 Component: `frontend/src/components/layout/AppLayout.jsx` [NEW]

Persistent sidebar layout. Props: `{ children, socket }`.

**Sidebar links:**
| Icon | Label | Route |
|------|-------|-------|
| Monitor icon | Live Monitor | `/monitor` |
| Calendar icon | Sessions | `/sessions` |
| UserPlus icon | Enroll | `/enroll` |
| Settings icon | Admin | `/admin` |

**Header:** Shows "AuraFace" branding + socket connection dot (green = connected, red = disconnected) + current time (live clock).

### 7.3 Component: `frontend/src/components/ClassroomMonitor.jsx` [REWRITE]

**Purpose:** Select a room camera and display the live CCTV feed with face overlays.

**State:**
- `selectedCamId` — currently selected camera (from dropdown)
- `cameras` — list from `GET /api/cameras`
- `lastOverlay` — `{ faces: [] }` from latest `face-recognition-result` matching `selectedCamId`

**Socket listeners (registered once on mount, cleaned up on unmount):**
```javascript
// Listener 1: camera-frame
socket.on('camera-frame', (payload) => {
  if (payload.cam_id !== selectedCamId) return;
  // Draw payload.imageBase64 to canvasRef.current using new Image()
  // After drawing, immediately re-draw lastOverlay bounding boxes on top
});

// Listener 2: face-recognition-result
socket.on('face-recognition-result', (payload) => {
  if (payload.cam_id !== selectedCamId) return;
  setLastOverlay(payload); // triggers overlay re-draw
});
```

**Canvas drawing logic:**
- `drawFrame(imageBase64)` — decodes base64 to Image, draws to canvas at full canvas size, then calls `drawOverlay(lastOverlay.faces)`.
- `drawOverlay(faces)` — for each face:
  - Draw green bounding box using `ctx.strokeRect()`.
  - Draw filled name label above box: white text on semi-transparent dark background.
  - Unknown faces (student_id null): red box, label "Unknown".

**Mock Mode (dev only):**
- Button "Enable Mock Feed" visible only if `import.meta.env.VITE_MOCK_MODE === 'true'`.
- When enabled: simulates `camera-frame` events every 1000ms with a static classroom placeholder image (a base64 PNG bundled as a constant in the component).
- 300ms after each frame: simulates `face-recognition-result` with 2 fake faces (`student_id: '312323247048'`, bbox at fixed coordinates).

**UI layout:** Full-width canvas (16:9 aspect ratio). Below canvas: HUD bar showing FPS counter, face count, last detection time.

### 7.4 Component: `frontend/src/components/SessionsPage.jsx` [NEW]

**Purpose:** Show all of today's sessions and allow starting/ending them.

**On mount:** Fetch `GET /api/sessions/today`. Poll every 30 seconds.

**Display:** List of `SessionCard` components.

### 7.5 Component: `frontend/src/components/SessionCard.jsx` [NEW]

**Props:** `{ session, onStart, onEnd, onCancel }`

**Displays:**
- Period name + time range (e.g. "Period 3 · 11:00 – 12:00")
- Room name
- Booked by
- Status badge (SCHEDULED=grey, ACTIVE=green pulse, COMPLETED=blue, CANCELLED=red)
- Student count chip: "18 / 30 Present"

**Buttons:**
- SCHEDULED → "Start Session" button → calls `POST /api/sessions/:id/start` → re-fetches
- ACTIVE → "End Session" button (red) → calls `POST /api/sessions/:id/end`
- ACTIVE → "View Live" link → navigates to `/sessions/:id`
- SCHEDULED → "Cancel" button (grey) → calls `POST /api/sessions/:id/cancel`
- COMPLETED → "View Report" link → navigates to `/sessions/:id`

### 7.6 Component: `frontend/src/components/BookSessionPage.jsx` [NEW]

**Purpose:** Faculty books a session slot.

**Form fields:**
1. Period selector — `GET /api/periods` → dropdown showing "Period 1 (09:00–10:00)"
2. Room selector — `GET /api/rooms` → dropdown. On selection, fetch camera status from `GET /api/cameras` and show warning if room has no active camera.
3. Session date — date picker (defaults to today).
4. Booked by — text input (faculty name).
5. Expected students — multiselect from `GET /api/students`. Searchable by name or student ID. Shows count of selected.

**Submit:** `POST /api/sessions` with `{ period_id, room_id, session_date, booked_by, student_ids: [...] }`. On success: navigate to `/sessions`.

### 7.7 Component: `frontend/src/components/SessionDetail.jsx` [NEW]

**Purpose:** Live and historical view of one session's attendance roster.

**Props:** `{ socket }` — receives `session_id` from `useParams()`.

**On mount:** Fetch `GET /api/sessions/:session_id` → sets `session` + `roster` (list of `{ student_id, name, status, detected_at, manually_marked }`).

**Socket listener (only when session.status === 'ACTIVE'):**
```javascript
socket.on('session-attendance-update', (update) => {
  if (update.session_id !== session_id) return;
  setRoster(prev => prev.map(r =>
    r.student_id === update.student_id
      ? { ...r, status: update.status, detected_at: update.detected_at }
      : r
  ));
});
```

**Display:**
- Session header: Room, Period, Date, Status, actual start time.
- Summary bar: "21 / 35 Present · 14 Absent".
- Split roster table:
  - Columns: Student ID | Name | Status | Detected At | Action
  - Rows sorted: PRESENT first (green chip), then ABSENT (red chip).
  - "Mark Present" / "Mark Absent" button per row → calls `PUT /api/sessions/:session_id/attendance/:student_id` → updates row in UI.
  - Manually marked rows show a pencil icon.

### 7.8 Component: `frontend/src/components/EnrollmentPage.jsx` [REWRITE]

**Purpose:** Enroll students for face recognition.

**Flow:**
1. Search/select a student from `GET /api/students?enrolled=false` OR create a new one.
2. Capture 3–5 webcam photos (reuse webcam logic from `DirectWebcamRecognition`).
3. Submit: `POST /api/enroll` with `student_id`, `name`, and image files.
4. Show success confirmation with student details.

**Webcam logic:** Uses `navigator.mediaDevices.getUserMedia({ video: true })`. Capture button takes a still frame from `<video>` element, converts to blob, adds to a preview strip. When 3–5 images collected, "Enroll" button activates.

### 7.9 Admin Panel Routes — `frontend/src/components/admin/`

**`AdminPortal.jsx`** — nested router, sidebar with links to sub-pages.

**`AdminStudents.jsx`** — Table from `GET /api/students`. Columns: Student ID, Name, Enrolled At, Face Enrolled (milvus_id not null → yes). Delete button per row.

**`AdminRooms.jsx`** — Table from `GET /api/rooms`. Add room form. Each row shows linked camera status. Button to add/edit camera for that room.

**`AdminPeriods.jsx`** — Table from `GET /api/periods`. Add period form (name, start_time, end_time). Delete only if no sessions reference it.

**`AdminCameras.jsx`** — Table from `GET /api/cameras`. Shows room assignment, RTSP URL (masked), is_active toggle (calls `PUT /api/cameras/:id`).

**`SystemHealth.jsx`** — Calls `GET /api/health` on mount and every 10s. Shows status indicators for Postgres, Redis, ML Service (GPU available, Milvus connected).

---

## Phase 8 — Environment Variables Summary

All environment variables that must be set (in `docker-compose.yml` or `.env`):

**Backend service:**
```
DATABASE_URL=postgresql://postgres:password@postgres:5432/face_attendance
REDIS_HOST=redis
REDIS_PORT=6379
STREAM_KEY=camera_ingestor:stream
ML_SERVICE_URL=http://ml_service:8000
FRONTEND_URL=http://localhost:5173
GRACE_PERIOD_MINUTES=15
```

**Camera ingestor service:**
```
DATABASE_URL=postgresql://postgres:password@postgres:5432/face_attendance
REDIS_HOST=redis
REDIS_PORT=6379
STREAM_KEY=camera_ingestor:stream
SAMPLE_INTERVAL_S=5
```

**ML service (unchanged from current, liveness idle):**
```
MILVUS_HOST=milvus
MILVUS_PORT=19530
FORCE_GPU=true
FACE_RECOGNITION_THRESHOLD=0.5
```

**Frontend (Vite):**
```
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_MOCK_MODE=true   # set false for production
```

---

## Socket.IO Event Contract (Final)

All events, their emitters, and their exact payload shapes:

| Event | Emitter | Payload | Consumer |
|-------|---------|---------|----------|
| `camera-frame` | `streamReader.js` → `io.emit` | `{ cam_id: string, frame_id: int, imageBase64: string, requestTime: string }` | `ClassroomMonitor` canvas |
| `face-recognition-result` | `CameraStreamManager._handleResult` → `io.emit` | `{ cam_id: string, frame_id: int, faces: [{ bbox: [x1,y1,x2,y2], student_id: string\|null, name: string, confidence: float }] }` | `ClassroomMonitor` overlay |
| `session-attendance-update` | `CameraStreamManager._handleResult` → `io.emit` | `{ session_id: string, student_id: string, name: string, status: 'PRESENT', detected_at: string }` | `SessionDetail` roster |
| `recognition-result` | `socketHandler.js` → `socket.emit` | `{ camera_id: string, faces: [{ bbox: [], student_id: string, confidence: float }] }` | `DirectWebcamRecognition` (test only) |
| `recognition-error` | `socketHandler.js` → `socket.emit` | `{ message: string, camera_id: string }` | `DirectWebcamRecognition` (test only) |
| `ml-service-status` | `socketHandler.js` → `socket.emit` | `{ status: 'healthy'\|'offline', gpu_available: bool, milvus_connected: bool }` | `SystemHealth` |

---

## Execution Order

```
Phase 1: DB Schema  →  prisma db push --force-reset  →  prisma generate
Phase 2: Delete old files, npm uninstall bullmq, npm install ioredis
Phase 3: Create 6 new model files, 6 route files, update index.js
Phase 4: Create sessionCache.js, CameraStreamManager.js, streamReader.js, update index.js, update socketHandler.js
Phase 5: Patch ml_service/main.py (WebSocket signature only, 2-line change)
Phase 6: Patch camera_ingestor.py (DB-driven discovery), add psycopg2-binary, update docker-compose.yml
Phase 7: Build frontend components in order: AppLayout → ClassroomMonitor → SessionsPage → SessionCard → BookSessionPage → SessionDetail → EnrollmentPage → Admin components
```

Each phase can be verified independently before proceeding to the next.
