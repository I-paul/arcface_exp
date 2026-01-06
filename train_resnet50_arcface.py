import os
import time
import torch
import numpy as np
from PIL import Image
from tqdm import tqdm
from torch.utils.data import Dataset, DataLoader

from resnet_arcface import ResNet50ArcFace
from arcface_loss import ArcFaceLoss

scaler = torch.amp.GradScaler('cuda')
# ================== CONFIG ==================
DATASET_DIR = "celeba_aligned"
CHECKPOINT_DIR = "checkpoints"
CHECKPOINT_PATH = os.path.join(CHECKPOINT_DIR, "latest.pth")

EMBEDDING_DIM = 512
BATCH_SIZE = 128
EPOCHS = 10
LR = 1e-4

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

torch.backends.cudnn.enabled = True
torch.backends.cudnn.benchmark = True

os.makedirs(CHECKPOINT_DIR, exist_ok=True)

print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))

# ============================================


# ================== DATASET ==================
class CelebAAlignedDataset(Dataset):
    def __init__(self, root_dir):
        self.samples = []
        self.label_map = {}

        identities = sorted(os.listdir(root_dir))
        for label, ident in enumerate(identities):
            self.label_map[ident] = label
            ident_dir = os.path.join(root_dir, ident)
            for img_name in os.listdir(ident_dir):
                self.samples.append(
                    (os.path.join(ident_dir, img_name), label)
                )

        print(f"[INFO] Loaded {len(self.samples)} images from {len(self.label_map)} identities")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]

        img = Image.open(img_path).convert("RGB")
        img = np.asarray(img, dtype=np.float32)
        img = (img - 127.5) / 128.0
        img = torch.from_numpy(img).permute(2, 0, 1)

        return img, label


# ================== CHECKPOINT ==================
def save_checkpoint(epoch, model, loss_fn, optimizer):
    torch.save({
        "epoch": epoch,
        "model": model.state_dict(),
        "arcface": loss_fn.state_dict(),
        "optimizer": optimizer.state_dict()
    }, CHECKPOINT_PATH)


def load_checkpoint(model, loss_fn, optimizer):
    if not os.path.exists(CHECKPOINT_PATH):
        return 0

    ckpt = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
    model.load_state_dict(ckpt["model"])
    loss_fn.load_state_dict(ckpt["arcface"])
    optimizer.load_state_dict(ckpt["optimizer"])

    print(f"[INFO] Resumed from epoch {ckpt['epoch'] + 1}")
    return ckpt["epoch"] + 1


# ================== METRICS ==================
def accuracy_from_logits(logits, labels):
    preds = torch.argmax(logits, dim=1)
    return (preds == labels).float().mean().item()


# ================== TRAIN ==================
def train():
    dataset = CelebAAlignedDataset(DATASET_DIR)
    num_classes = len(dataset.label_map)

    train_loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=2,
        pin_memory=True
    )

    model = ResNet50ArcFace(EMBEDDING_DIM).to(DEVICE)
    loss_fn = ArcFaceLoss(
        embedding_dim=EMBEDDING_DIM,
        num_classes=num_classes,
        m=0.5,
        s=64
    ).to(DEVICE)

    optimizer = torch.optim.AdamW(
        list(model.parameters()) + list(loss_fn.parameters()),
        lr=LR,
        weight_decay=5e-4
    )

    print("Model device:", next(model.parameters()).device)
    print("Loss device:", next(loss_fn.parameters()).device)

    start_epoch = load_checkpoint(model, loss_fn, optimizer)

    for epoch in range(start_epoch, EPOCHS):
        model.train()
        loss_fn.train()

        epoch_loss = 0.0
        epoch_acc = 0.0
        steps = 0
        start_time = time.time()

        for images, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}"):
            images = images.to(DEVICE, non_blocking=True)
            labels = labels.to(DEVICE)

            optimizer.zero_grad()

            with torch.amp.autocast('cuda'):
                embeddings = model(images)
                loss = loss_fn(embeddings, labels)

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            with torch.no_grad():
                logits = loss_fn.s * torch.nn.functional.linear(
                    embeddings,
                    torch.nn.functional.normalize(loss_fn.weight)
                )
                acc = accuracy_from_logits(logits, labels)

            epoch_loss += loss.item()
            epoch_acc += acc
            steps += 1

        epoch_loss /= steps
        epoch_acc /= steps
        epoch_time = time.time() - start_time

        print(
            f"\nEpoch {epoch+1} Summary | "
            f"Loss: {epoch_loss:.4f} | "
            f"Acc: {epoch_acc:.4f} | "
            f"Time: {epoch_time/60:.2f} min\n"
        )

        save_checkpoint(epoch, model, loss_fn, optimizer)

    torch.save(model.state_dict(), "resnet50_arcface_final.pth")
    print("Training complete. Final model saved.")


if __name__ == "__main__":
    train()