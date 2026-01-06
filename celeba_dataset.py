import os
import torch
from torch.utils.data import Dataset
from PIL import Image
import numpy as np

class CelebAAlignedDataset(Dataset):
    def __init__(self, root_dir):
        self.samples = []
        self.label_map = {}

        identities = sorted(os.listdir(root_dir))
        for idx, ident in enumerate(identities):
            self.label_map[ident] = idx
            ident_dir = os.path.join(root_dir, ident)
            for img in os.listdir(ident_dir):
                self.samples.append(
                    (os.path.join(ident_dir, img), idx)
                )

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        img = Image.open(img_path).convert("RGB")
        img = np.asarray(img, dtype=np.float32)
        img = (img - 127.5) / 128.0
        img = torch.from_numpy(img).permute(2, 0, 1)
        return img, label