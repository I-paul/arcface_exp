import os
import shutil
from collections import defaultdict

IMG_DIR = r"C:\Users\Admin\Documents\PEP intern\arcface_exp\celeba_work\img_align_celeba"
IDENTITY_FILE = "identity_CelebA.txt"
OUTPUT_DIR = "celeba_subset"

MAX_IDENTITIES = 500        # safe, adjustable
MIN_IMAGES = 10             # identity quality filter

os.makedirs(OUTPUT_DIR, exist_ok=True)

id_map = defaultdict(list)

with open(IDENTITY_FILE, "r") as f:
    for line in f:
        img, ident = line.strip().split()
        id_map[int(ident)].append(img)

selected = list(id_map.items())[:MAX_IDENTITIES]

kept = 0
for ident, images in selected:
    if len(images) < MIN_IMAGES:
        continue

    id_dir = os.path.join(OUTPUT_DIR, f"id_{ident:05d}")
    os.makedirs(id_dir, exist_ok=True)

    for img in images:
        shutil.copy(
            os.path.join(IMG_DIR, img),
            os.path.join(id_dir, img)
        )

    kept += 1

print(f"Subset created with {kept} identities")

