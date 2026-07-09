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
import yaml

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
        site_id = self.cam_cfg.get('site_id')
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
                                'cam_id': cam_id,
                                'site_id': site_id
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


def load_config(path):
    with open(path, 'r') as f:
        cfg = yaml.safe_load(f)
    return cfg


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', '-c', default='config.yaml')
    args = parser.parse_args()

    cfg = load_config(args.config)

    redis_cfg = cfg.get('redis', {})
    host = os.getenv('REDIS_HOST', redis_cfg.get('host', 'localhost'))
    port = int(os.getenv('REDIS_PORT', redis_cfg.get('port', 6379)))
    stream_key = os.getenv('STREAM_KEY', redis_cfg.get('stream_key', 'camera_ingestor:stream'))
    heartbeat_ttl = int(os.getenv('HEARTBEAT_TTL_S', redis_cfg.get('heartbeat_ttl_s', 60)))

    r = redis.Redis(host=host, port=port, decode_responses=True)

    cameras = cfg.get('cameras', [])
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
