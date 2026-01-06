import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet50
from torchvision.models import resnet50, ResNet50_Weights


class ResNet50ArcFace(nn.Module):
    def __init__(self, embedding_dim=512, pretrained=False):
        super().__init__()


        base = resnet50(weights=None)

        # Modify first conv for 112x112
        base.conv1 = nn.Conv2d(
            3, 64, kernel_size=3, stride=1, padding=1, bias=False
        )
        base.maxpool = nn.Identity()

        # Remove classification head
        self.backbone = nn.Sequential(*list(base.children())[:-2])

        self.pool = nn.AdaptiveAvgPool2d(1)

        self.embedding = nn.Sequential(
            nn.Flatten(),
            nn.Linear(2048, embedding_dim),
            nn.BatchNorm1d(embedding_dim)
        )

    def forward(self, x):
        x = self.backbone(x)
        x = self.pool(x)
        x = self.embedding(x)
        x = F.normalize(x)
        return x
