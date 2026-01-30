import torch
import torch.nn as nn
from torchvision import models

class DeepPix(nn.Module):
    def __init__(self):
        super(DeepPix, self).__init__()

        DenseNet = models.densenet121(pretrained=True)

        self.conv0 = DenseNet.features.conv0
        self.norm0 = DenseNet.features.norm0
        self.relu0 = DenseNet.features.relu0
        self.pool0 = DenseNet.features.pool0
        self.denseblock1 = DenseNet.features.denseblock1
        self.transition1 = DenseNet.features.transition1
        self.denseblock2 = DenseNet.features.denseblock2
        self.transition2 = DenseNet.features.transition2

        self.conv1x1 = nn.Conv2d(256, 1, kernel_size=1, stride=1)
        self.sigmoid1 = nn.Sigmoid()

        # After transition2, spatial size is 14x14 for 224 input → 196
        self.linear1 = nn.Linear(196, 1)
        self.sigmoid2 = nn.Sigmoid()

    def forward(self, x):
        x = self.conv0(x)
        x = self.norm0(x)
        x = self.relu0(x)
        x = self.pool0(x)
        x = self.denseblock1(x)
        x = self.transition1(x)
        x = self.denseblock2(x)
        x = self.transition2(x)
        x = self.conv1x1(x)
        x = self.sigmoid1(x)

        y = x.view(x.shape[0], -1)
        y = self.linear1(y)
        y = self.sigmoid2(y)

        return y, x
