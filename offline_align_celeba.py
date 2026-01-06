import os
import cv2
import numpy as np
from tqdm import tqdm
from insightface.app import FaceAnalysis
from insightface.utils.face_align import norm_crop

SRC_DIR = r"C:\Users\Admin\Documents\PEP intern\arcface_exp\celeba_subset"
OUT_DIR = r"C:\Users\Admin\Documents\PEP intern\arcface_exp\celeba_aligned"

IMG_SIZE = (112, 112)
DET_THRESHOLD = 0.70

os.makedirs(OUT_DIR, exist_ok=True)

# Initialize detector ONCE
face_app = FaceAnalysis(
    name="buffalo_l",
    providers=["CUDAExecutionProvider"]
)
face_app.prepare(ctx_id=0, det_size=(640, 640))


def align_identity(identity):
    src_id_dir = os.path.join(SRC_DIR, identity)
    out_id_dir = os.path.join(OUT_DIR, identity)

    if os.path.exists(out_id_dir):
        return  # resume-safe

    os.makedirs(out_id_dir, exist_ok=True)

    for img_name in os.listdir(src_id_dir):
        img_path = os.path.join(src_id_dir, img_name)
        img = cv2.imread(img_path)

        if img is None:
            continue

        faces = face_app.get(img)
        if len(faces) != 1:
            continue

        face = faces[0]
        if face.det_score < DET_THRESHOLD:
            continue

        aligned = norm_crop(img, face.kps)
        aligned = cv2.resize(aligned, IMG_SIZE)

        cv2.imwrite(
            os.path.join(out_id_dir, img_name),
            aligned
        )


def main():
    identities = sorted(os.listdir(SRC_DIR))
    for ident in tqdm(identities, desc="Aligning identities"):
        align_identity(ident)

    print("Offline alignment complete")


if __name__ == "__main__":
    main()