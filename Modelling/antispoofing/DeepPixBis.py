import os
import cv2
import torch
import numpy as np
import pandas as pd
from tqdm import tqdm
from DeepPixBis_implementation import DeepPix

# -----------------------
# CONFIG
# -----------------------
DATA_DIR = "data"
MODEL_PATH = "model/DeepPixBis.pth"
IMAGE_SIZE = 224
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# -----------------------
# LOAD MODEL
# -----------------------
print("Loading DeepPixBiS model...")
model = DeepPix()
state = torch.load(MODEL_PATH, map_location=DEVICE)


# Some checkpoints are saved as {"state_dict": ...}
if "state_dict" in state:
    state = state["state_dict"]

# Remove "module." prefix if present
new_state = {}
for k, v in state.items():
    if k.startswith("module."):
        k = k[7:]
    new_state[k] = v

missing, unexpected = model.load_state_dict(new_state, strict=False)
print("Missing keys:", missing)
print("Unexpected keys:", unexpected)
model.to(DEVICE)
model.eval()
print("Model loaded successfully.")

total = 0
zero = 0
for p in model.parameters():
    total += p.numel()
    zero += torch.sum(p == 0).item()

print("Total params:", total)
print("Zero params:", zero)

# -----------------------
# PREPROCESS
# -----------------------
def preprocess(img_bgr):
    img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
    img = img.astype(np.float32) / 255.0

    # ImageNet normalization (VERY important)
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    img = (img - mean) / std

    img = np.transpose(img, (2, 0, 1))
    img = torch.from_numpy(img).unsqueeze(0).float()
    return img

# -----------------------
# INFERENCE
# -----------------------
def infer(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return None

    x = preprocess(img).to(DEVICE)
    with torch.no_grad():
        score, _ = model(x)
        score = float(score.item())

    return score

# -----------------------
# TEST LOOP
# -----------------------
results = []
classes = ["real", "print", "screen", "replay"]

for cls in classes:
    folder = os.path.join(DATA_DIR, cls)
    if not os.path.exists(folder):
        print(f"Missing folder: {folder}")
        continue

    print(f"Processing: {cls}")
    for fname in tqdm(os.listdir(folder)):
        if not fname.lower().endswith((".jpg", ".png", ".jpeg")):
            continue

        path = os.path.join(folder, fname)
        score = infer(path)
        if score is None:
            continue

        results.append({
            "image": fname,
            "class": cls,
            "score": score
        })

# -----------------------
# SAVE RESULTS
# -----------------------
df = pd.DataFrame(results)
df.to_csv("deeppixbis_results.csv", index=False)

print("\nSaved to deeppixbis_results.csv")

# -----------------------
# SUMMARY
# -----------------------
print("\nScore summary:")
for cls in classes:
    sub = df[df["class"] == cls]
    if len(sub) == 0:
        continue
    print(f"{cls:8s} | mean={sub['score'].mean():.3f}  min={sub['score'].min():.3f}  max={sub['score'].max():.3f}")
