import torch
from torch.utils.data import IterableDataset
from datasets import load_dataset
import numpy as np
import cv2
from insightface.app import FaceAnalysis

DETECTION_THRESHOLD = 0.70
IMG_SIZE = (112, 112)

class CASIAStreamingDataset(IterableDataset):
    def __init__(self, split="train"):
        self.dataset = load_dataset(
            "CASIA-WebFace",
            split="train",
            streaming=True
        )

        self.face_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider"]
        )
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

    def preprocess(self, img):
        faces = self.face_app.get(img)
        if len(faces) != 1:
            return None , None
        face = faces[0]
        return face , face.det_score

    def __iter__(self):
        det_scores = []
        for sample in self.dataset:
            try:
                img = np.array(sample["image"].convert("RGB"))
                label = sample["label"]

                face, score = self.preprocess(img)
                if face is None or score < DETECTION_THRESHOLD:
                    continue

                det_scores.append(score)
                yield face, torch.tensor(label, dtype=torch.long)

            except Exception:
                continue
