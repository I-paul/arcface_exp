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


def encode_jpeg_base64(frame):
    # Encode an image (BGR) as JPEG and return base64 string (without data header)
    ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ret:
        raise ValueError('Failed to encode frame as JPEG')
    b = buf.tobytes()
    return base64.b64encode(b).decode('ascii')


class CameraWorker(threading.Thread):
    def __init__(self, cam_cfg, redis_client, stream_key, heartbeat_ttl):
        super().__init__(daemon=True)
        self.cam_cfg = cam_cfg
        self.redis = redis_client
        self.stream_key = stream_key
        self.heartbeat_ttl = heartbeat_ttl
        self.backSub = None
        # Motion detection disabled: using fixed-interval sampling only.
        # To re-enable motion detection, uncomment and adjust the block below.
        # if cam_cfg.get('motion_enabled', True):
        #     self.backSub = cv2.createBackgroundSubtractorMOG2(
        #         history=cam_cfg.get('motion_history', 500),
        #         varThreshold=cam_cfg.get('motion_varThreshold', 16),
        #         detectShadows=cam_cfg.get('motion_detectShadows', False)
        #     )

    def run(self):
        cam_id = self.cam_cfg['cam_id']
        rtsp = self.cam_cfg['rtsp']
        sample_interval = float(self.cam_cfg.get('sample_interval_s', 2))
        min_motion_frames = int(self.cam_cfg.get('min_motion_frames', 1))

        while not STOP_EVENT.is_set():
            cap = None
            try:
                cap = cv2.VideoCapture(rtsp, cv2.CAP_FFMPEG)
                if not cap.isOpened():
                    print(f"[ingestor:{cam_id}] Failed to open stream, retrying in 5s")
                    time.sleep(5)
                    continue

                print(f"[ingestor:{cam_id}] Stream opened: {rtsp}")

                last_sample_time = 0
                motion_count = 0

                while not STOP_EVENT.is_set():
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        print(f"[ingestor:{cam_id}] Frame read failed, reconnecting")
                        break

                    now = time.time()

                    # Motion detection disabled — use interval-only sampling
                    motion_detected = True
                    # If you want motion gating later, re-enable and tune the block below.
                    # if self.backSub is not None:
                    #     gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    #     fgmask = self.backSub.apply(gray)
                    #     # count non-zero pixels in fgmask
                    #     nz = int(np.count_nonzero(fgmask))
                    #     if nz > 500:  # heuristic threshold
                    #         motion_count += 1
                    #     else:
                    #         motion_count = 0
                    #     motion_detected = motion_count >= min_motion_frames

                    # Sampling decision
                    time_ok = (now - last_sample_time) >= sample_interval

                    if (self.backSub is None and time_ok) or (self.backSub is not None and motion_detected and time_ok):
                        # prepare payload
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
                'sample_interval_s': 2,  # Default 2 seconds
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
                    'sample_interval_s': 2,  # Default 2 seconds
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

    workers = []
    for cam in cameras:
        w = CameraWorker(cam, r, stream_key, heartbeat_ttl)
        w.start()
        workers.append(w)

    def handle_sig(signum, frame):
        print('Shutting down...')
        STOP_EVENT.set()

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    try:
        while not STOP_EVENT.is_set():
            time.sleep(1)
    except KeyboardInterrupt:
        STOP_EVENT.set()

    for w in workers:
        w.join(timeout=5)


if __name__ == '__main__':
    main()
