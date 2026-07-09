Camera Ingestor
================

Purpose
-------
A standalone process/container that ingests RTSP/HTTP camera streams, performs sampling and optional motion gating, and forwards frames to the backend queue. This component sits between physical cameras and the queue:

IP Cameras (RTSP) → camera-ingestor → Redis (stream) → adapter-to-bullmq → BullMQ (faceQueue) → Worker → ML Service

Why this shape
--------------
- Python + OpenCV is used for robust RTSP handling and motion detection.
- The ingestor writes messages into a Redis stream (`camera_ingestor:stream`). A small Node adapter (provided) reads the stream and creates BullMQ jobs so that existing `faceQueue`/workers can remain unchanged.

Files
-----
- `camera_ingestor.py` — main Python program
- `config.yaml` — camera list and settings
- `requirements.txt` — Python dependencies
- `Dockerfile` — optional container image
- `node_adapter/adapter.js` — Node adapter that reads Redis stream and adds jobs to BullMQ
- `node_adapter/package.json` — Node dependencies for adapter

Quick start (development)
-------------------------
1. Configure `config.yaml` with camera RTSP URLs and IDs.
2. Create Python venv and install dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

3. Run the ingestor:

```bash
python camera_ingestor.py --config config.yaml
```

4. In parallel run the Node adapter so jobs are pushed into BullMQ:

```bash
cd node_adapter
npm install
node adapter.js
```

Notes on integration
--------------------
- The Node adapter uses the same queue name `face-recognition` and job name `recognize-face` as the backend. Set `REDIS_HOST` & `REDIS_PORT` in env.
- You can replace the adapter with a more production-grade bridge (consumer groups, Redis Stream XREADGROUP) if required.

Configuration example
---------------------
See `config.yaml` for camera example and parameter descriptions.

Health & monitoring
-------------------
- The ingestor sets a Redis heartbeat key per camera: `camera_ingestor:heartbeat:<cam_id>` with TTL (default 60s). The backend can monitor these keys to detect silence.

Security
--------
- Run the ingestor inside the same VPC/network as Redis. Protect the RTSP endpoints and Redis with network controls.

License
-------
MIT (project default)