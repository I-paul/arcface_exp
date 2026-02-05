import os
import time
import cv2
import pandas as pd
from tqdm import tqdm

from inference.face_processor import FaceProcessor
from preprocessing.preprocessor import preprocess
from preprocessing.schemas import PreprocessRequest
from tests.preprocessing.datasets import DATASETS, MAX_IMAGES_PER_DATASET, MODE

OUT_DIR = "tests/preprocessing/results"
os.makedirs(OUT_DIR, exist_ok=True)

def iter_images(root):
    for r, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".pgm")):
                yield os.path.join(r, f)

def main():
    face_processor = FaceProcessor(force_gpu=True)
    records = []

    for dataset_name, root in DATASETS.items():
        print(f"\nRunning dataset: {dataset_name}")

        scanned = 0
        processed = 0

        for img_path in tqdm(iter_images(root)):
            if scanned >= MAX_IMAGES_PER_DATASET:
                break
            scanned += 1

            img = cv2.imread(img_path)
            if img is None:
                continue

            faces = face_processor.detect_faces(img)
            if not faces:
                continue

            face = face_processor.select_largest_face(faces)

            req = PreprocessRequest(
                image=img,
                bbox=face.bbox.tolist(),
                landmarks={
                    "left_eye": face.kps[0].tolist(),
                    "right_eye": face.kps[1].tolist(),
                    "nose": face.kps[2].tolist(),
                    "left_mouth": face.kps[3].tolist(),
                    "right_mouth": face.kps[4].tolist(),
                },
                mode=MODE
            )

            start = time.time()
            result = preprocess(req)
            latency_ms = (time.time() - start) * 1000

            record = {
                "dataset": dataset_name,
                "usable": result.usable,
                "reject_reason": result.reject_reason,
                "latency_ms": latency_ms,
                "blur_score": None,
                "mean_luminance": None,
                "face_area_ratio": None,
                "contrast": None,
                "blur": None,
                "brightness": None,
            }

            if result.quality_metrics:
                for k in record:
                    if k in result.quality_metrics:
                        record[k] = result.quality_metrics[k]

            records.append(record)
            processed += 1


    df = pd.DataFrame(records)
    csv_path = os.path.join(OUT_DIR, "preprocessing_results.csv")
    df.to_csv(csv_path, index=False)

    print("\nSaved:", csv_path)
    print(df.groupby(["dataset", "reject_reason"]).size())

if __name__ == "__main__":
    main()
