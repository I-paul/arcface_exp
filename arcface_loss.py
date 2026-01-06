import torch
import torch.nn as nn
import torch.nn.functional as F
import math


class ArcFaceLoss(nn.Module):
    def __init__(self, embedding_dim, num_classes, s=64.0, m=0.50):
        super().__init__()
        self.embedding_dim = embedding_dim
        self.num_classes = num_classes
        self.s = s
        self.m = m

        self.weight = nn.Parameter(torch.Tensor(num_classes, embedding_dim))
        nn.init.xavier_uniform_(self.weight)

        self.cos_m = math.cos(m)
        self.sin_m = math.sin(m)
        self.th = math.cos(math.pi - m)
        self.mm = math.sin(math.pi - m) * m

    def forward(self, embeddings, labels):
        """
        embeddings: (B, 512)
        labels: (B,)
        """

        # Normalize
        embeddings = F.normalize(embeddings)
        weight = F.normalize(self.weight)

        # Cosine similarity
        cosine = F.linear(embeddings, weight)

        # Sine calculation
        sine = torch.sqrt(1.0 - torch.pow(cosine, 2)).clamp(0, 1)

        # cos(theta + m)
        phi = cosine * self.cos_m - sine * self.sin_m

        # ArcFace decision boundary
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)

        # One-hot labels
        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1), 1)

        # Apply margin only to correct class
        logits = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        logits *= self.s

        return F.cross_entropy(logits, labels)
