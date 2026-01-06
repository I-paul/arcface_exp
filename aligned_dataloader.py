import glob
import webdataset as wds
from dataset_utils import normalize_img

def get_dataloader(batch_size=128, steps_per_epoch=179):
    shards = glob.glob("celeba_aligned_wds/*.tar")
    print(f"[INFO] Loaded {len(shards)} shards")

    dataset = (
        wds.WebDataset(shards, shardshuffle=100)
        .decode("torch")                     # 🔥 FAST DECODE
        .to_tuple("jpg", "cls")
        .map_tuple(normalize_img, lambda y: y)
        .batched(batch_size)
        .with_epoch(steps_per_epoch)
    )

    loader = wds.WebLoader(
        dataset,
        batch_size=None,
        num_workers=4,                       # 🔥 CPU parallelism
        pin_memory=True,
        prefetch_factor=2
    )

    return loader