import webdataset as wds
import glob

shards = glob.glob("celeba_aligned_wds/*.tar")

dataset = (
    wds.WebDataset(shards, shardshuffle=False)
    .decode("pil")
)

for i, sample in enumerate(dataset):
    print(sample["jpg.jpg"].size, sample["jpg.cls"])
    if i == 5:
        break