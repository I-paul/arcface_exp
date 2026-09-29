#!/usr/bin/env python3
"""
Camera Ingestor

Captures frames from RTSP cameras, applies sampling/motion gating,
and pushes frame payloads to a Redis stream for downstream processing.
"""
import threading
import time
import base64
import argparse
import signal
import sys
import io
import json
import os
from datetime import datetime

import cv2
import numpy as np
import redis
import requests
import psycopg2

STOP_EVENT = threading.Event()


JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '70'))


def encode_jpeg_base64(frame):
    ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ret:
        raise ValueError('Failed to encode frame as JPEG')
    return base64.b64encode(buf.tobytes()).decode('ascii')


class CameraWorker(threading.Thread):
    def __init__(self, cam_cfg, redis_client, stream_key, heartbeat_ttl, stop_event=None):
        super().__init__(daemon=True)
        self.cam_cfg = cam_cfg
        self.redis = redis_client
        self.stream_key = stream_key
        self.heartbeat_ttl = heartbeat_ttl
        self.stop_event = stop_event or threading.Event()
        self.backSub = None
        # Motion detection disabled: using fixed-interval sampling only.
        # To re-enable motion detection, uncomment and adjust the block below.
        # if cam_cfg.get('motion_enabled', True):
        #     self.backSub = cv2.createBackgroundSubtractorMOG2(
        #         history=cam_cfg.get('motion_history', 500),
        #         varThreshold=cam_cfg.get('motion_varThreshold', 16),
        #         detectShadows=cam_cfg.get('motion_detectShadows', False)
        #     )

    def _should_stop(self):
        return STOP_EVENT.is_set() or self.stop_event.is_set()

    def stop(self):
        self.stop_event.set()

    def run(self):
        cam_id = self.cam_cfg['cam_id']
        rtsp = self.cam_cfg['rtsp']
        sample_interval = float(self.cam_cfg.get('sample_interval_s',
                                                   os.getenv('SAMPLE_INTERVAL_S', '0.3')))
        min_motion_frames = int(self.cam_cfg.get('min_motion_frames', 1))

        while not self._should_stop():
            cap = None
            try:
                os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = (
                    'rtsp_transport;tcp|analyzeduration;0|fflags;nobuffer'
                    '|flags;low_delay|max_delay;0|probesize;32'
                )
                cap = cv2.VideoCapture(rtsp, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if not cap.isOpened():
                    print(f"[ingestor:{cam_id}] Failed to open stream, retrying in 5s")
                    time.sleep(5)
                    continue

                print(f"[ingestor:{cam_id}] Stream opened (low-latency): {rtsp}")

                last_sample_time = 0

                while not self._should_stop():
                    # grab() is fast (no decode) — keeps the buffer drained
                    if not cap.grab():
                        print(f"[ingestor:{cam_id}] Frame grab failed, reconnecting")
                        break

                    now = time.time()
                    time_ok = (now - last_sample_time) >= sample_interval

                    if time_ok:
                        # retrieve() decodes only when we need the frame
                        ret, frame = cap.retrieve()
                        if not ret or frame is None:
                            continue
                        try:
                            image_b64 = encode_jpeg_base64(frame)
                            payload = {
                                'imageBase64': image_b64,
                                'originalName': f"{cam_id}-{int(now)}.jpg",
                                'requestTime': datetime.utcnow().isoformat() + 'Z',
                                'cam_id': cam_id
                            }

                            # push to redis stream with bounded length to avoid unbounded growth
                            # use approximate trimming for performance
                            self.redis.xadd(self.stream_key, payload, maxlen=1000, approximate=True)

                            # heartbeat
                            hb_key = f"camera_ingestor:heartbeat:{cam_id}"
                            self.redis.setex(hb_key, self.heartbeat_ttl, int(now))

                            last_sample_time = now

                            print(f"[ingestor:{cam_id}] Enqueued frame at {payload['requestTime']}")
                        except Exception as e:
                            print(f"[ingestor:{cam_id}] Failed to enqueue frame: {e}")

                    # small sleep to avoid tight loop
                    time.sleep(0.01)

            except Exception as e:
                print(f"[ingestor:{cam_id}] Worker error: {e}")
            finally:
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass

                # wait a bit before reconnecting
                time.sleep(2)


def fetch_active_cameras_from_db(database_url, timeout=10):
    """
    Query PostgreSQL database directly for active cameras
    Returns list of camera configs suitable for CameraWorker
    """
    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        cur.execute("""
            SELECT c.cam_id, c.rtsp_url, r.room_name
            FROM cameras c
            JOIN rooms r ON c.room_id = r.room_id
            WHERE c.is_active = TRUE
              AND c.rtsp_url NOT LIKE 'rtsp://CONFIGURE%%'
            ORDER BY r.room_name
        """)

        rows = cur.fetchall()
        cur.close()
        conn.close()

        # Transform to CameraWorker config format
        camera_configs = []
        for row in rows:
            cam_id, rtsp_url, room_name = row
            camera_configs.append({
                'cam_id': str(cam_id),
                'rtsp': rtsp_url,
                'sample_interval_s': float(os.getenv('SAMPLE_INTERVAL_S', '0.3')),
            })

        return camera_configs
    except Exception as e:
        print(f"[ingestor] Failed to fetch cameras from database: {e}")
        return []


def fetch_active_cameras_from_api(backend_url, timeout=10):
    """
    Query Backend API for active cameras (fallback method)
    Returns list of camera configs suitable for CameraWorker
    """
    try:
        response = requests.get(
            f"{backend_url}/api/cameras",
            params={'is_active': 'true'},
            timeout=timeout
        )
        response.raise_for_status()
        cameras_data = response.json()

        # Transform to CameraWorker config format
        camera_configs = []
        for cam in cameras_data:
            if cam.get('is_active'):
                camera_configs.append({
                    'cam_id': cam['cam_id'],
                    'rtsp': cam['rtsp_url'],
                    'sample_interval_s': float(os.getenv('SAMPLE_INTERVAL_S', '0.3')),
                })

        return camera_configs
    except Exception as e:
        print(f"[ingestor] Failed to fetch cameras from backend API: {e}")
        return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backend-url', default=None, help='Backend API URL (default: from env BACKEND_URL or http://localhost:3000)')
    args = parser.parse_args()

    # Redis configuration from environment
    redis_host = os.getenv('REDIS_HOST', 'localhost')
    redis_port = int(os.getenv('REDIS_PORT', '6379'))
    stream_key = os.getenv('STREAM_KEY', 'camera_ingestor:stream')
    heartbeat_ttl = int(os.getenv('HEARTBEAT_TTL_S', '60'))

    # Database or Backend API
    database_url = os.getenv('DATABASE_URL')
    backend_url = args.backend_url or os.getenv('BACKEND_URL', 'http://localhost:3000')

    r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

    # Fetch active cameras (prefer database, fallback to API)
    # Retry indefinitely on first boot — DB may be empty until admin adds cameras via UI
    POLL_INTERVAL_S = 30
    while True:
        if database_url:
            cameras = fetch_active_cameras_from_db(database_url)
        else:
            cameras = fetch_active_cameras_from_api(backend_url)

        if cameras:
            break

        print(f"[ingestor] No active cameras found. Retrying in {POLL_INTERVAL_S}s...")
        time.sleep(POLL_INTERVAL_S)
        if STOP_EVENT.is_set():
            sys.exit(0)

    print(f"[ingestor] Found {len(cameras)} active camera(s)")

    workers = {}
    for cam in cameras:
        w = CameraWorker(cam, r, stream_key, heartbeat_ttl)
        w.start()
        workers[cam['cam_id']] = w

    def handle_sig(signum, frame):
        print('Shutting down...')
        STOP_EVENT.set()

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    CAMERA_REFRESH_S = 60

    try:
        last_refresh = time.time()
        while not STOP_EVENT.is_set():
            time.sleep(1)
            if time.time() - last_refresh >= CAMERA_REFRESH_S and database_url:
                last_refresh = time.time()
                try:
                    live = fetch_active_cameras_from_db(database_url)
                    live_by_id = {cam['cam_id']: cam for cam in live}
                    live_ids = set(live_by_id.keys())

                    for cam_id, cam in live_by_id.items():
                        existing = workers.get(cam_id)
                        if existing and existing.is_alive():
                            if existing.cam_cfg['rtsp'] != cam['rtsp']:
                                print(f"[ingestor] RTSP URL changed for cam {cam_id}, restarting worker")
                                existing.stop()
                                existing.join(timeout=5)
                                w = CameraWorker(cam, r, stream_key, heartbeat_ttl)
                                w.start()
                                workers[cam_id] = w
                        else:
                            w = CameraWorker(cam, r, stream_key, heartbeat_ttl)
                            w.start()
                            workers[cam_id] = w
                            print(f"[ingestor] Started new worker for cam {cam_id}")

                    stale_ids = set(workers.keys()) - live_ids
                    for cam_id in stale_ids:
                        print(f"[ingestor] Camera {cam_id} no longer active, stopping worker")
                        workers[cam_id].stop()
                        workers[cam_id].join(timeout=5)
                        del workers[cam_id]

                except Exception as e:
                    print(f"[ingestor] Camera refresh error: {e}")
    except KeyboardInterrupt:
        STOP_EVENT.set()

    for w in workers.values():
        w.join(timeout=5)


if __name__ == '__main__':
    main()
