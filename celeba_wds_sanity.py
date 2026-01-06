import webdataset as wds
import glob

# Explicitly expand shard paths (Windows-safe)
shards = glob.glob("celeba_wds/*.tar")

print(f"Found {len(shards)} shards")

dataset = (
    wds.WebDataset(
        shards,
        shardshuffle=False  # silence warning
    )
    .decode("pil")
)

for i, sample in enumerate(dataset):
    print(sample.keys())
    if i == 5:
        break
