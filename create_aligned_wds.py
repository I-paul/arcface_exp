import webdataset as wds
import os
from PIL import Image

SRC = "celeba_aligned"
OUT = "celeba_aligned_wds"
SHARD_SIZE = 5000

os.makedirs(OUT, exist_ok=True)

sink = wds.ShardWriter(
    os.path.join(OUT, "celeba-aligned-%06d.tar"),
    maxcount=SHARD_SIZE
)

label = 0
for ident in sorted(os.listdir(SRC)):
    id_dir = os.path.join(SRC, ident)
    if not os.path.isdir(id_dir):
        continue

    for img_name in os.listdir(id_dir):
        img_path = os.path.join(id_dir, img_name)
        with Image.open(img_path) as img:
            sample = {
                "__key__": f"{ident}_{img_name}",
                "jpg": img.convert("RGB"),
                "cls": label
            }
            sink.write(sample)

    label += 1

sink.close()
print("Aligned WebDataset created")