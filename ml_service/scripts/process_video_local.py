"""
Local video processor for quick testing without running the full service.
Samples frames from a provided MP4 and runs detection, anti-spoof, and embedding extraction
using the existing `FaceProcessor` and `AntiSpoofPredictor` on CPU.

Usage: run from the `ml_service` directory:
    python scripts/process_video_local.py

Adjust `VIDEO_PATH` below as needed.
"""
import os
import sys
import time
import json
from pathlib import Path

import cv2

# Ensure imports resolve when running from ml_service folder
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
# Add ml_service root to sys.path so sibling packages can be imported
sys.path.insert(0, str(ROOT))

from inference.face_processor import FaceProcessor
from anti_spoofing.inference import init_predictor


# Choose a video file from the dataset
VIDEO_PATH = r"c:\pep-ml\data\faceAttendance\meta\6.4\D12_20260406042414.mp4"


def clip_bbox(bbox, w, h):
    x1, y1, x2, y2 = map(int, bbox)
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(x1 + 1, min(x2, w))
    y2 = max(y1 + 1, min(y2, h))
    return x1, y1, x2, y2


def main():
    print(f"Processing video: {VIDEO_PATH}")

    if not Path(VIDEO_PATH).exists():
        print(json.dumps({"error": "video_not_found", "path": VIDEO_PATH}))
        return

    # Initialize on CPU for quick local tests
    try:
        fp = FaceProcessor(force_gpu=False)
    except Exception as e:
        print(json.dumps({"error": "face_processor_init_failed", "exc": str(e)}))
        return

    try:
        predictor = init_predictor(use_gpu=False)
    except Exception as e:
        print(json.dumps({"error": "antispoof_init_failed", "exc": str(e)}))
        predictor = None

    cap = cv2.VideoCapture(VIDEO_PATH)
    if not cap.isOpened():
        print(json.dumps({"error": "video_open_failed", "path": VIDEO_PATH}))
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    sample_every = int(max(1, fps // 2))  # sample twice per second

    frame_idx = 0
    processed = 0
    results = []

    start = time.time()
    while processed < 10:  # limit to a few samples for speed
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_every != 0:
            frame_idx += 1
            continue

        h, w = frame.shape[:2]
        timestamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0

        faces = fp.detect_faces(frame)
        entry = {
            "frame_idx": int(frame_idx),
            "timestamp": float(timestamp),
            "num_faces": int(len(faces)),
            "faces": []
        }

        for face in faces:
            bbox = face.bbox
            x1, y1, x2, y2 = clip_bbox(bbox, w, h)
            face_crop = frame[y1:y2, x1:x2]

            pre = fp.preprocess_face(frame, face, mode="recognize")

            liveness = None
            if predictor is not None and face_crop.size != 0:
                try:
                    res = predictor.predict(face_crop)
                    liveness = {
                        "is_live": bool(res.is_live),
                        "real_score": float(res.real_score),
                        "fake_score": float(res.fake_score),
                        "label": int(res.label)
                    }
                except Exception as e:
                    liveness = {"error": str(e)}

            emb = None
            try:
                emb = fp.get_embedding(face).tolist()
            except Exception:
                emb = None

            face_entry = {
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "usable": bool(getattr(pre, "usable", False)),
                "reject_reason": getattr(pre, "reject_reason", None),
                "quality_metrics": getattr(pre, "quality_metrics", {}),
                "liveness": liveness,
                "embedding_len": len(emb) if emb else 0
            }

            entry["faces"].append(face_entry)

        results.append(entry)

        print(json.dumps(entry))

        processed += 1
        frame_idx += 1

    cap.release()
    elapsed = time.time() - start
    summary = {"processed_samples": processed, "elapsed_seconds": elapsed}
    print(json.dumps({"summary": summary}))


if __name__ == "__main__":
    main()
