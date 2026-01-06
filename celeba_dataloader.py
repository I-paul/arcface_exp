import webdataset as wds
import torch
import glob
from torch.utils.data import DataLoader

from celeba_arcface_dataset import preprocess

def get_dataloader(batch_size=64, num_workers=4):
    shards = glob.glob("celeba_wds/*.tar")

    dataset = (
        wds.WebDataset(
            shards,
            shardshuffle=False
        )
        .decode("pil")
        .map(preprocess)
        .select(lambda x: x is not None)
        .batched(batch_size)
    )

    return DataLoader(
        dataset,
        batch_size=None,
        num_workers=num_workers,
        pin_memory=True
    )
