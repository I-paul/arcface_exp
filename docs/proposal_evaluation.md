# Proposed Changes — Evaluation & Scoring

> Context: Pre-college-adaptation cleanup pass.
> Liveness: IDLE (kept as dead code).
> Camera: Hikvision RTSP, one per classroom.
> Dev constraint: Cannot test live camera feed until on campus network.

---

## Scoring Key

Each proposal is scored on four axes (1–5):

| Axis | Meaning |
|------|---------|
| **Impact** | How much does this improve the system? |
| **Feasibility** | How straightforward is it to implement? |
| **Risk** | How likely is it to break something? (5 = low risk, 1 = high risk) |
| **College Fit** | How well does this serve the college attendance use case? |

---

## Proposal 1 — Remove Unused / Unnecessary Code

**Verdict: ✅ APPROVED — Do This First**

### What's currently dead or misaligned

| File | Dead Code | Action |
|------|-----------|--------|
| `face.worker.js:13` | `attendanceCooldownCache` — declared, never used | Delete |
| `face.worker.js:184` | `worker.on('completed')` checks `result.name` and `result.confidence` — fields no longer exist in simplified response | Rewrite handler |
| `face.worker.js:10` | `BACKEND_URL` — worker no longer calls back to backend | Delete |
| `socketHandler.js` | `enroll-capture`, `enroll-submit` socket events — enrollment is REST-only now | Delete both |
| `attendance.model.js` | Entire IN/OUT cooldown + state machine — will be replaced by session-based logic | Keep for now, will replace in college migration |
| `employee.model.js` | `recognizeFace()` (queued recognition) — will become session-based | Keep interface, gut internals later |
| `ml_service/main.py:42` | `LATENCY_STATS` dict is computed but the actual `perform_voting()` and `aggregate_embedding()` in `RecognitionPipeline` are **never called** from `main.py` — both methods are dead code in the WS handler | Remove calls from pipeline or wire them in |
| `recognition_pipeline.py:110` | `aggregate_embedding()` — not called anywhere in main.py | Remove or wire in |
| `recognition_pipeline.py:120` | `perform_voting()` — not called anywhere in main.py | Remove or wire in |
| `recognition_pipeline.py:57` | `should_embed()` — defined but `main.py` doesn't use it; main.py embeds every face unconditionally | Wire in or remove |
| `camera_ingestor.py:44-51` | Motion detection code (commented-out block) | Keep commented — documents intent |
| `adapter.js:49` | `originalName` field in payload — never used by ML or backend | Remove from payload |
| `adapter.js:52` | `site_id` in adapter payload — unused when session routing is not yet wired | Remove for now |

### What to KEEP (do not remove)
- Liveness module (`anti_spoofing/`) — idle as instructed
- `RecognitionPipeline._sessions` tracker — critical for per-camera isolation
- `recognition_pipeline.py:53-55` `update_tracks()` — used in main.py
- `recognition_pipeline.py:85-101` `update_track_result()` — used in main.py
- All Milvus schema v2 migration code
- All `preprocessing/` module — used in enrollment

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Total: 18/20** — Straightforward, no-risk, do it in one session.

> ⚠️ **Wire in or explicitly remove `should_embed()`, `perform_voting()`, and `aggregate_embedding()`** before they cause confusion. They are good logic but currently disconnected.

---

## Proposal 2 — Single Persistent WebSocket Per Camera

**Verdict: ✅ APPROVED — This is architecturally the most important change**

### Current problem

Every recognition frame creates a **new TCP WebSocket handshake** to the ML service:

```
Frame arrives → BullMQ job created → worker picks up → new WebSocket() → connect → send → result → terminate
                                                         ↑ 50–100ms added per frame
```

With 5 classrooms × 1 frame/5s = 1 new WS connection every second shared across 3 worker threads.

### What you're proposing

One persistent WS per camera. For 5 classrooms = 5 long-lived WS connections:

```
Camera 1 → WS-1 (persistent) ──→ ML service (tracker session: "cam-1")
Camera 2 → WS-2 (persistent) ──→ ML service (tracker session: "cam-2")
```

### Why this is perfect for college classrooms

The ML service's `RecognitionPipeline` uses `session_key = f"ws:{id(websocket)}"` to store tracker state. With per-camera persistent WS:
- Each classroom gets its own `SimpleTracker` — students in Room 101 are never confused with students in Room 102
- The IoU tracker correctly tracks students across frames within the same classroom
- Stale track cleanup (`max_stale_seconds=5.0`) works correctly because the WS is never dropped between frames

With per-job WS (current), the tracker state is created fresh every connection = **tracking is effectively broken** because there's no continuity between frames.

### Implementation approach

**Replace the BullMQ worker pattern with a `CameraStreamManager`** in Node.js:

```
Redis Stream (cam_id tagged) 
    → adapter reads frame
    → routes to CameraStreamManager.send(cam_id, imageBase64)
    → CameraStreamManager maintains Map<cam_id, WebSocket>
    → reuses or creates WS for that cam_id
    → receives result → emits to io with cam_id tag
```

The `CameraStreamManager`:
```javascript
class CameraStreamManager {
  constructor(mlWsUrl, io) {
    this.connections = new Map(); // cam_id → { ws, queue: [] }
    this.mlWsUrl = mlWsUrl;
    this.io = io;
  }

  async send(cam_id, imageBase64, frameId) {
    const conn = this._getOrCreate(cam_id);
    // push to per-cam queue, drain when WS is open
  }

  _getOrCreate(cam_id) {
    if (!this.connections.has(cam_id)) {
      this._createConnection(cam_id);
    }
    return this.connections.get(cam_id);
  }

  _createConnection(cam_id) {
    const ws = new WebSocket(this.mlWsUrl);
    // on message: emit 'face-recognition-result' to io.to(`cam:${cam_id}`)
    // on close: delete from map, reconnect after backoff
    this.connections.set(cam_id, { ws, pending: false });
  }
}
```

> ⚠️ **Critical**: BullMQ is then **only needed for enrollment jobs** — not recognition. The recognition path bypasses the queue entirely. This significantly simplifies the system.

### Latency improvement

| Path | Before | After |
|------|--------|-------|
| WS handshake per frame | ~80ms | 0ms (reused) |
| BullMQ enqueue overhead | ~5ms | 0ms (bypassed) |
| Redis XREADGROUP block wait | up to 2000ms | up to 200ms (reduced) |
| **Effective frame-to-result latency** | **~2.2s worst case** | **~400ms worst case** |

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Total: 16/20** — Highest impact change. Moderate implementation effort (new CameraStreamManager class, ~150 lines). Risk is in connection management (reconnect logic, backoff).

> ⚠️ **BullMQ is not removed entirely** — keep it for enrollment. Just remove it from the recognition hot path.

---

## Proposal 3 — Frontend Continuously Shows CCTV Stream

**Verdict: ⚠️ APPROVED WITH DESIGN DECISION — The goal is correct, but the implementation path needs to be chosen carefully**

### The core problem

Right now `IPCameraRecognition.jsx` listens for `face-recognition-result` which should include `imageBase64`. But `imageBase64` is **never included** in that event — the canvas stays blank.

### Why "send stream from camera ingestor" needs clarification

The camera ingestor is a Python process — it can't directly talk to Socket.IO. What you mean (and what makes sense) is:

**The camera adapter (Node.js) is already reading every frame from Redis.** It can emit frames for display BEFORE routing them to ML.

### Two viable approaches

---

**Option A — Dual-path (Recommended)**

The adapter emits two things per frame:
1. Sends frame to `CameraStreamManager` for ML recognition
2. ALSO directly emits `camera-frame` Socket.IO event to the frontend for display

```
Redis frame → adapter → [display path] → Socket.IO 'camera-frame' → Frontend canvas (immediate)
                      → [ML path]     → CameraStreamManager → ML WS → 'face-recognition-result' → Frontend overlay
```

Frontend logic:
- On `camera-frame`: draw image to canvas immediately (low latency display)
- On `face-recognition-result`: overlay bounding boxes on top of canvas (recognition arrives ~200-400ms later)
- Use `frame_id` to match overlays to frames

**Result**: Smooth live video at ingestor frame rate (0.5–1 fps for classrooms). Face boxes appear a moment after.

**Latency for display**: Redis block time (~200ms after fix) + Socket.IO emit = **~250ms** — acceptable for a classroom display.

> ⚠️ **The adapter process must have Socket.IO client access to emit to the backend.** Options:
> - Adapter connects to backend Socket.IO as a client (using `socket.io-client`) and emits to a special `camera-source` namespace
> - OR: The adapter pushes display frames to a separate Redis pub/sub channel, and the backend broadcasts them
> - OR: Merge the adapter into the backend process (simpler for single-server setup)

---

**Option B — Attach imageBase64 to recognition result (Simpler)**

Store `imageBase64` in the per-camera WS connection state (Proposal 2). When the ML result comes back, attach the original frame to the `face-recognition-result` event.

```
adapter → CameraStreamManager.send(cam_id, imageBase64, frameId)
  → stores: pendingFrames.set(frameId, imageBase64)
  → sends to ML WS: { type: 'recognize', image: imageBase64, frame_id }
  → on ML result: attach pendingFrames.get(frame_id) → emit with imageBase64
```

**Latency for display**: Same as recognition latency (~400ms). No separate display path needed. Simpler code.

**Downside**: Every recognition result carries a full JPEG base64 image through Socket.IO. At 85% JPEG quality, a 1280×720 frame ≈ **150–300KB base64**. At 0.5fps per camera × 5 cameras = 750KB/s constant Socket.IO bandwidth. Manageable for a local network.

---

**Recommendation for college + can't test cameras now**: Start with **Option B** (simpler, no new architecture). The `imageBase64` just needs to be threaded through from the adapter → CameraStreamManager → emission. One clean change. Switch to Option A later if bandwidth becomes a concern.

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Total: 17/20** — Critical fix (canvas is blank without this). Feasibility is moderate only because of the adapter → display bridge design choice.

---

## Proposal 4 — Lean Payloads (No Unnecessary Data)

**Verdict: ✅ APPROVED — Easy win**

### Current payload bloat audit

**From camera adapter → BullMQ job** (current):
```json
{ "imageBase64": "...", "originalName": "cam-1-1234567.jpg", "requestTime": "...", "cam_id": "...", "site_id": "..." }
```
`originalName` is never used. `site_id` is not used in recognition.

**From ML WS response** (current):
```json
{
  "type": "result", "frame_id": 5,
  "faces": [{ 
    "track_id": 3, "bbox": [x1,y1,x2,y2], "label": "Track-3",
    "confidence": 0.82, "detected": true, "person_id": "22CS3045",
    "template_version": 2, "reject_reason": null
  }]
}
```

For college attendance you need:
```json
{
  "frame_id": 5, "cam_id": "cam-1",
  "faces": [{ "bbox": [x1,y1,x2,y2], "roll_number": "22CS3045", "confidence": 0.82 }]
}
```

**Fields to remove from ML response:**
- `type` — only "result" is valid at this point, redundant
- `label: "Track-X"` — UI debugging artifact, not needed in production
- `detected: boolean` — derivable from `roll_number !== null`
- `template_version` — internal Milvus detail, not for display
- `reject_reason` — only useful in dev; strip in production (env flag)

**From backend → frontend Socket.IO (`face-recognition-result`)**:
```json
{
  "cam_id": "cam-1", "frame_id": 5, "session_id": "uuid",
  "imageBase64": "...",
  "faces": [{ "bbox": [x1,y1,x2,y2], "roll_number": "22CS3045", "name": "Rahul K", "confidence": 0.82 }]
}
```

No `detected`, no `label`, no `template_version`, no `track_id` (only meaningful inside ML), no `reject_reason`.

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Total: 16/20** — Low effort, no risk. Reduces network payload and keeps frontend logic clean.

---

## Proposal 5 — Complete Frontend UI/UX Redo

**Verdict: ✅ APPROVED — Necessary for the domain change, existing stack (React + Tailwind + Router) is solid**

### What needs to completely change

The current frontend is structured around the **employee attendance** system:
- "Real-time Feed" + "Recognition Logs" side-by-side — generic
- "Webcam Enrollment" — stays, but restyled for student enrollment
- "Admin Panel" with employee records — entire domain model changes to students/courses/sections

### Proposed new page structure for college

```
/                → redirect to /monitor
/monitor         → Live Classroom Monitor (select room → see canvas + detected names overlay)
/sessions        → Today's Sessions (list, start/stop buttons for each class)
/sessions/:id    → Session Detail (present/absent roster in real time, manual override)
/enroll          → Student Enrollment (multi-photo capture, batch upload)
/admin           → Admin portal
  /admin/students        → Student roster, enrollment status, re-enroll
  /admin/courses         → Course/Section management
  /admin/cameras         → Camera management (room assignments)
  /admin/reports         → Attendance reports (by student / by course / low attendance flags)
  /admin/system          → ML health, Milvus stats
```

### Key UX changes

- **Classroom Monitor page**: Full-screen canvas per room. Face boxes with student names and checkmarks. Running tally "18/32 Present". List panel on the right updates in real time.
- **Dark theme retained** (already in Tailwind dark palette — fits CCTV monitoring aesthetic)
- **No more generic "Recognition Logs"** — replaced by session-scoped student roster
- **Session cards** on `/sessions` page: each class shown as a card with time, section name, room, camera status, and a "Start" / "End" toggle

### What to keep from current frontend

- React Router v6 — ✅ keep
- Tailwind CSS — ✅ keep
- Socket.IO shared connection via `useMemo` — ✅ keep
- Canvas rendering approach in `IPCameraRecognition` — ✅ keep and extend
- Admin portal structure (sidebar + sub-routes) — ✅ keep and retheme

### Cannot test yet — design for mock data

Since cameras aren't accessible now, design frontend with **mock data mode**: a dev toggle that feeds a static base64 image + dummy face overlay to the canvas. This way the full UI can be built and validated before the camera goes live.

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Total: 16/20** — High impact, most time-consuming change. Low risk (pure frontend, no ML changes). The existing component skeleton is a good starting point.

> ⚠️ **Can't finalize page structure until domain decisions (D3 session model) are resolved.** Recommend building the Monitor and Session Detail pages first — these work regardless of whether sessions are auto or manual.

---

## Proposal 6 — Ensure No Lag

**Verdict: ⚠️ PARTIALLY VALID — "No lag" is a performance goal, not a feature. The sources of lag are specific and fixable.**

### Latency budget analysis (current system)

```
RTSP frame decode (OpenCV + FFmpeg):     ~30–80ms   (network + decode)
JPEG encode + base64:                    ~10–20ms
Redis XADD to stream:                    ~2ms
Redis XREADGROUP BLOCK=2000:             0–2000ms ← BIGGEST BOTTLENECK
BullMQ job enqueue:                      ~5ms
New WS handshake to ML (per job):        ~80ms      ← FIXED by Proposal 2
ML face detection + embedding (GPU):     ~30–80ms
Socket.IO broadcast to frontend:         ~5ms
Canvas render:                           ~5ms
─────────────────────────────────────────────────
Current WORST CASE (2s Redis block):     ~2.2–2.4 seconds
Current BEST CASE (no Redis wait):       ~200–300ms
```

### After Proposals 2, 3, and this:

| Fix | Saving |
|-----|--------|
| Redis BLOCK: 2000ms → 100ms | Saves up to 1.9s worst case |
| Persistent WS (no handshake) | Saves ~80ms per frame |
| Dual-path display (Option A) | Display path skips ML entirely, ~250ms |
| Lean payloads (Proposal 4) | Saves ~5ms serialization |

**Target after all fixes:**
- Display latency: **~150–300ms** (camera to canvas)
- Recognition overlay: **~300–500ms** after display frame

For a classroom — showing a face box 300–500ms after the person appears on screen — **this is imperceptible lag**. You don't need sub-100ms for an attendance system (it's not real-time gaming).

### Additional changes for "no lag"

1. **Reduce `BLOCK` time in adapter** from 2000ms to **100ms** — accept slightly higher CPU usage
2. **Camera sample interval**: 5s is right for classroom attendance (don't go faster — GPU can't keep up with 30 students at 1fps)
3. **Socket.IO `transports: ['websocket']`** only — remove polling fallback (already in App.jsx — ✅ done)
4. **Canvas `requestAnimationFrame`** instead of `img.onload` for rendering overlays — smoother animation
5. **`maxHttpBufferSize` in Socket.IO** — current is 5MB, check it covers the frame size (720p JPEG base64 ≈ 200–400KB — fine)
6. **Milvus `nprobe=10`** — already set, appropriate for IVF_FLAT index with 1024 clusters

### What "no lag" does NOT mean

- Zero latency is physically impossible with RTSP → Redis → Node → GPU → Socket.IO
- For a classroom attendance system, **< 500ms frame-to-result is excellent**
- The goal should be: **consistent latency, no stalls, no frozen canvas**

### Score

| Impact | Feasibility | Risk | College Fit |
|--------|-------------|------|-------------|
| ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Total: 17/20** — Achieved mainly by Proposals 2 and 3. The remaining specific change (BLOCK time) is 1-line.

> ⚠️ **Risk note on reducing BLOCK time**: Lower BLOCK = more `XREADGROUP` calls per second = marginally more Redis CPU. At 5 cameras, this is negligible. At 50+ cameras, revisit.

---

## Overall Execution Order

Execute in this sequence — each proposal unblocks the next:

```
Phase 1 — Safe (no architecture changes)
  [1] Remove dead code + wire/remove disconnected pipeline methods

Phase 2 — Architecture (changes the recognition hot path)
  [2] Implement CameraStreamManager (persistent WS pool per camera)
      ↑ This replaces the worker's recognition path and the BullMQ queue for recognition

Phase 3 — Data pipeline (feeds the new display)
  [3] Add imageBase64 threading (Option B) through CameraStreamManager
  [4] Lean payloads — strip all unnecessary fields from all events

Phase 4 — Performance tuning
  [6] Reduce Redis BLOCK to 100ms
      Add requestAnimationFrame to canvas render

Phase 5 — Frontend (can start in parallel with Phase 2–4)
  [5] New frontend routes and components
      Build with mock data mode for dev without cameras
```

---

## Summary Scorecard

| Proposal | Impact | Feasibility | Risk | College Fit | **Total** | Priority |
|----------|--------|-------------|------|-------------|-----------|----------|
| 1. Remove dead code | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **18/20** | Do First |
| 2. Persistent WS per camera | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **16/20** | Critical |
| 3. Live CCTV stream on frontend | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **17/20** | Critical |
| 4. Lean payloads | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **16/20** | Easy win |
| 5. Frontend UI/UX redo | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **16/20** | Start parallel |
| 6. No lag | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **17/20** | Achieved via 2+3 |

**All 6 proposals are approved. No proposal should be dropped.**

---

*Evaluation based on full codebase analysis. Ready to execute on approval.*
