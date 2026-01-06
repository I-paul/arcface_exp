from collections import defaultdict
import numpy as np
from tqdm import tqdm

from casia_streaming_dataset import CASIAStreamingDataset

MAX_SAMPLES = 5000  # small, controlled probe

def main():
    dataset = CASIAStreamingDataset()

    stats = {
        "total_seen": 0,
        "accepted": 0,
        "rejected": 0
    }

    rejection_reasons = defaultdict(int)
    det_scores = []
    labels = []

    for i, sample in enumerate(tqdm(dataset)):
        if i >= MAX_SAMPLES:
            break

        stats["total_seen"] += 1

        try:
            image, label = sample
            stats["accepted"] += 1
            labels.append(label.item())

        except Exception as e:
            stats["rejected"] += 1
            rejection_reasons[type(e).__name__] += 1
            continue

    # Print stats
    print("\n===== DATASET SANITY REPORT =====")
    for k, v in stats.items():
        print(f"{k}: {v}")

    print("\nUnique labels seen:", len(set(labels)))
    print("Label range:", min(labels), "→", max(labels))

    print("\n===== DONE =====")

if __name__ == "__main__":
    main()
