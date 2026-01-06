import torch
from arcface_loss import ArcFaceLoss

loss_fn = ArcFaceLoss(
    embedding_dim=512,
    num_classes=100
)

embeddings = torch.randn(8, 512)
labels = torch.randint(0, 100, (8,))

loss = loss_fn(embeddings, labels)
print("ArcFace loss:", loss.item())
