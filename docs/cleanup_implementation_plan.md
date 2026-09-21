# Implementation Plan: Pre-College Setup & Optimization

> **Objective:** Execute the 6 approved cleanup and performance proposals to create a stable, low-latency, real-time foundation before implementing the new college domain schema.
> **Key Architectural Choice:** Proposal 3 / Option A is selected. The system will use a dual-path pipeline where frames are sent immediately to the frontend for display, and separately to the ML service for recognition, merging on the client canvas.

---

## Phase 1: Codebase Cleanup & Lean Payloads (Proposals 1 & 4)
**Goal:** Remove all dead code, unused fields, and unused dependencies.

### 1.1 Backend Cleanup
- [ ] **Delete `Backend/src/workers/face.worker.js` entirely.** (BullMQ is no longer needed for recognition, and enrollment already uses direct Axios calls).
- [ ] **Delete `Backend/src/queues/face.queue.js`.**
- [ ] **Uninstall `bullmq`** from Backend dependencies (`npm uninstall bullmq`).
- [ ] **Update `Backend/src/utils/socketHandler.js`:** Remove `enroll-capture` and `enroll-submit` socket listeners.
- [ ] **Update `Backend/src/models/attendance.model.js`:** Remove the 1-minute cooldown logic (lines 23-43). Keep a simple dummy INSERT for now until the college schema is built.
- [ ] **Update `Backend/src/models/employee.model.js`:** Delete the `recognizeFace` and `getJobStatus` functions, and remove their corresponding routes in `employeeRoutes.js`.

### 1.2 ML Service Cleanup
- [ ] **Update `ml_service/inference/recognition_pipeline.py`:**
  - Remove the unused `should_embed`, `aggregate_embedding`, and `perform_voting` methods completely to reduce clutter.
  - Alternatively, if you wish to keep them, they must be explicitly wired into the `main.py` WebSocket handler. (Recommendation: Delete them for now; they can be restored from git when temporal voting is explicitly needed).
- [ ] **Update `ml_service/main.py` WebSocket response (`/ws/recognize`):**
  - Strip down the response payload.
  - Return ONLY: `{"frame_id": int, "faces": [{"bbox": [x1,y1,x2,y2], "roll_number": "...", "confidence": 0.95}]}`
  - Remove `label`, `detected`, `template_version`, `reject_reason`, and `type`.

### 1.3 Adapter Cleanup (`camera_ingestor/node_adapter/adapter.js`)
- [ ] Uninstall `bullmq` from adapter dependencies.
- [ ] Remove `originalName` and `site_id` from the extracted payload data.

---

## Phase 2: Dual-Path Display & Persistent WebSockets (Proposals 2, 3 Option A, 6)
**Goal:** Achieve < 500ms latency by bypassing queues, reducing Redis block times, and maintaining open WebSockets per camera.

### 2.1 The New Redis Pub/Sub Bridge
Since BullMQ is gone, `adapter.js` will route frames using Redis Pub/Sub.
- [ ] **Update `adapter.js`:**
  - Change `BLOCK, 2000` to `BLOCK, 100` (Fixes 2-second lag).
  - After reading a frame from the stream, use `client.publish('camera:frames', JSON.stringify(payload))`.
  - The payload should be strictly: `{ "cam_id": "cam-1", "frame_id": 123, "imageBase64": "..." }`.
  - Still do `XACK` and `XDEL` to clear the stream.

### 2.2 `CameraStreamManager` (Backend)
- [ ] **Create `Backend/src/utils/CameraStreamManager.js`:**
  - Initialize a `Map<String, WebSocket>` to hold persistent connections to `ws://ML_SERVICE_URL/ws/recognize`.
  - Implement a `send(cam_id, frame_id, imageBase64)` method:
    - Checks if WS for `cam_id` exists and is OPEN. If not, creates it.
    - Sends `{ type: "recognize", image: imageBase64, frame_id }`.
  - Implement WS `on('message')` handler:
    - Parses ML result.
    - Broadcasts to Socket.IO: `io.emit('face-recognition-result', { cam_id, frame_id, faces })`. (Note: NO imageBase64 here).
    - Handle reconnects with exponential backoff on WS `close` or `error`.

### 2.3 Backend Pub/Sub Consumer
- [ ] **Update `Backend/src/index.js` (or a new initializer):**
  - Create a dedicated Redis subscriber client.
  - `redisSub.subscribe('camera:frames')`.
  - On receiving a message on `camera:frames`:
    1. **Display Path:** Immediately emit `io.emit('camera-frame', { cam_id, frame_id, imageBase64 })` to frontend.
    2. **ML Path:** Pass data to `CameraStreamManager.send(cam_id, frame_id, imageBase64)`.

---

## Phase 3: College Frontend Redo & Mock Mode (Proposal 5)
**Goal:** Build the college UI layout and implement rendering that merges the dual-path streams seamlessly without real cameras.

### 3.1 Setup College Routes & Layouts
- [ ] Refactor `frontend/src/App.jsx` to define the new structure:
  - `/monitor`: Live Classroom Monitor.
  - `/sessions`: Today's Class Sessions.
  - `/admin/*`: Admin routes (Students, Courses, Cameras).
- [ ] Implement dark-mode aesthetic utilizing Tailwind.

### 3.2 Dual-Path Canvas Renderer (`ClassroomMonitor.jsx`)
- [ ] **State Management:**
  - Maintain a buffer of recent recognition results keyed by `frame_id`.
- [ ] **Socket Listeners:**
  - On `camera-frame`: Draw the `imageBase64` directly to the `<canvas>` using `requestAnimationFrame`. Immediately check if a matching recognition result already exists in the buffer and draw boxes.
  - On `face-recognition-result`: Store the result in the buffer. Check if the current canvas frame matches this `frame_id`. If so, draw bounding boxes + roll numbers over the canvas.

### 3.3 Mock Data Mode (Dev Environment)
- [ ] Create a `useMockCamera` hook or a dev toggle in `ClassroomMonitor.jsx`.
- [ ] When activated (or if Socket.IO is disconnected):
  - Set an interval of 1000ms (simulating 1 fps).
  - Simulate `camera-frame` event using a static base64 placeholder image of a classroom.
  - 300ms later, simulate `face-recognition-result` with dummy bounding boxes and roll numbers (`22CS3045`, `22CS3046`).
  - This allows the frontend UI/UX to be fully developed, styled, and tested completely offline from the campus network.

---

## Phase 4: Final Validation & Tuning
**Goal:** Verify the foundational cleanup is complete before the database schema shift.

### 4.1 Latency Check
- [ ] Confirm Redis Stream reads in `adapter.js` take ~100ms.
- [ ] Verify `CameraStreamManager` does not create a new WebSocket per frame.
- [ ] Ensure frontend dual-path rendering draws the image instantly and overlays boxes momentarily later without tearing.

### 4.2 Liveness Verification
- [ ] Verify `ml_service/anti_spoofing/` directory and code remains intact but idle (not imported or called in the `main.py` WebSocket handler).

---
*Once this plan is fully implemented, the system will be technically sound, hyper-fast, and cleanly separated. We will then proceed to rewrite the PostgreSQL schemas and API endpoints for the College Domain as defined in the previous decision log.*
