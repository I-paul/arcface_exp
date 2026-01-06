import torch
from resnet_arcface import ResNet50ArcFace

model = ResNet50ArcFace()
model.eval()

x = torch.randn(2, 3, 112, 112)
with torch.no_grad():
    emb = model(x)

print("Embedding shape:", emb.shape)
print("Norms:", emb.norm(dim=1))
