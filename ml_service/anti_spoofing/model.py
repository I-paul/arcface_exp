"""
MiniFASNet Model Definition
Based on: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


class DepthwiseSeparableConv(nn.Module):
    """Depthwise Separable Convolution Block"""
    def __init__(self, in_channels, out_channels, stride=1):
        super(DepthwiseSeparableConv, self).__init__()
        self.depthwise = nn.Conv2d(
            in_channels, in_channels, 
            kernel_size=3, stride=stride, padding=1, 
            groups=in_channels, bias=False
        )
        self.pointwise = nn.Conv2d(
            in_channels, out_channels, 
            kernel_size=1, bias=False
        )
        self.bn = nn.BatchNorm2d(out_channels)
        
    def forward(self, x):
        x = self.depthwise(x)
        x = self.pointwise(x)
        x = self.bn(x)
        return F.relu(x)


class InvertedResidual(nn.Module):
    """Inverted Residual Block (MobileNetV2 style)"""
    def __init__(self, in_channels, out_channels, stride=1):
        super(InvertedResidual, self).__init__()
        self.use_residual = (stride == 1 and in_channels == out_channels)
        
        self.conv1 = DepthwiseSeparableConv(in_channels, out_channels, stride=stride)
        self.conv2 = DepthwiseSeparableConv(out_channels, out_channels, stride=1)
        
    def forward(self, x):
        identity = x
        out = self.conv1(x)
        out = self.conv2(out)
        
        if self.use_residual:
            out = out + identity
        return out


class MiniFASNet(nn.Module):
    """
    MiniFASNet architecture for face anti-spoofing
    Input: 80x80x3 RGB face crop
    Output: 2 classes (0=real, 1=fake)
    
    This matches the checkpoint structure with:
    - stem
    - layer1 to layer6
    - fc classifier
    """
    def __init__(self, embedding_size=256, num_classes=2, img_channel=3):
        super(MiniFASNet, self).__init__()
        
        # Stem (initial convolution) - 3 -> 32
        self.stem = nn.Sequential(
            nn.Conv2d(img_channel, 32, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True)
        )
        
        # Layer 1: 32 -> 64
        self.layer1 = DepthwiseSeparableConv(32, 64, stride=1)
        
        # Layer 2: 64 -> 64 (with residual)
        self.layer2 = InvertedResidual(64, 64, stride=2)
        
        # Layer 3: 64 -> 128
        self.layer3 = DepthwiseSeparableConv(64, 128, stride=1)
        
        # Layer 4: 128 -> 128 (with residual)
        self.layer4 = InvertedResidual(128, 128, stride=2)
        
        # Layer 5: 128 -> 256
        self.layer5 = DepthwiseSeparableConv(128, embedding_size, stride=1)
        
        # Layer 6: 256 -> 256 (with residual)
        self.layer6 = InvertedResidual(embedding_size, embedding_size, stride=2)
        
        # Global average pooling and classifier
        self.fc = nn.Linear(embedding_size, num_classes)
        
    def forward(self, x):
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.layer5(x)
        x = self.layer6(x)
        
        # Global average pooling
        x = F.adaptive_avg_pool2d(x, (1, 1))
        x = x.view(x.size(0), -1)
        
        # Classifier
        x = self.fc(x)
        return x


class MiniFASNetV2(nn.Module):
    """
    MiniFASNet V2 architecture for face anti-spoofing
    Input: 80x80x3 RGB face crop
    Output: 2 classes (0=real, 1=fake)
    """
    def __init__(self, embedding_size=128, conv6_kernel=(5, 5), num_classes=2, img_channel=3):
        super(MiniFASNetV2, self).__init__()
        self.conv1 = nn.Conv2d(img_channel, 64, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        
        self.conv2 = nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(128)
        
        self.conv3 = nn.Conv2d(128, 196, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn3 = nn.BatchNorm2d(196)
        
        self.conv4 = nn.Conv2d(196, 128, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn4 = nn.BatchNorm2d(128)
        
        self.conv5 = nn.Conv2d(128, embedding_size, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn5 = nn.BatchNorm2d(embedding_size)
        
        self.conv6 = nn.Conv2d(embedding_size, embedding_size, kernel_size=conv6_kernel, stride=1, padding=0, bias=False)
        self.bn6 = nn.BatchNorm2d(embedding_size)
        
        # Classifier
        self.fc = nn.Linear(embedding_size, num_classes)
        
    def forward(self, x):
        # Layer 1
        x = self.conv1(x)
        x = self.bn1(x)
        x = F.relu(x)
        x = F.max_pool2d(x, kernel_size=3, stride=2, padding=1)
        
        # Layer 2
        x = self.conv2(x)
        x = self.bn2(x)
        x = F.relu(x)
        x = F.max_pool2d(x, kernel_size=3, stride=2, padding=1)
        
        # Layer 3
        x = self.conv3(x)
        x = self.bn3(x)
        x = F.relu(x)
        x = F.max_pool2d(x, kernel_size=3, stride=2, padding=1)
        
        # Layer 4
        x = self.conv4(x)
        x = self.bn4(x)
        x = F.relu(x)
        
        # Layer 5
        x = self.conv5(x)
        x = self.bn5(x)
        x = F.relu(x)
        
        # Layer 6
        x = self.conv6(x)
        x = self.bn6(x)
        x = F.relu(x)
        
        # Global average pooling
        x = F.adaptive_avg_pool2d(x, (1, 1))
        x = x.view(x.size(0), -1)
        
        # Classifier
        x = self.fc(x)
        return x


class MiniFASNetV1SE(nn.Module):
    """
    MiniFASNet V1 with Squeeze-and-Excitation blocks
    Alternative architecture - use this if V2 doesn't match your checkpoint
    """
    def __init__(self, embedding_size=128, num_classes=2, img_channel=3):
        super(MiniFASNetV1SE, self).__init__()
        self.conv1 = nn.Conv2d(img_channel, 64, kernel_size=3, stride=2, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        
        self.conv2_dw = nn.Conv2d(64, 64, kernel_size=3, stride=1, padding=1, groups=64, bias=False)
        self.bn2_dw = nn.BatchNorm2d(64)
        self.conv2 = nn.Conv2d(64, 64, kernel_size=1, stride=1, padding=0, bias=False)
        self.bn2 = nn.BatchNorm2d(64)
        
        self.conv3_dw = nn.Conv2d(64, 64, kernel_size=3, stride=2, padding=1, groups=64, bias=False)
        self.bn3_dw = nn.BatchNorm2d(64)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=1, stride=1, padding=0, bias=False)
        self.bn3 = nn.BatchNorm2d(128)
        
        self.conv4_dw = nn.Conv2d(128, 128, kernel_size=3, stride=1, padding=1, groups=128, bias=False)
        self.bn4_dw = nn.BatchNorm2d(128)
        self.conv4 = nn.Conv2d(128, 128, kernel_size=1, stride=1, padding=0, bias=False)
        self.bn4 = nn.BatchNorm2d(128)
        
        self.conv5_dw = nn.Conv2d(128, 128, kernel_size=3, stride=2, padding=1, groups=128, bias=False)
        self.bn5_dw = nn.BatchNorm2d(128)
        self.conv5 = nn.Conv2d(128, 128, kernel_size=1, stride=1, padding=0, bias=False)
        self.bn5 = nn.BatchNorm2d(128)
        
        self.conv6_dw = nn.Conv2d(128, 128, kernel_size=3, stride=1, padding=1, groups=128, bias=False)
        self.bn6_dw = nn.BatchNorm2d(128)
        self.conv6 = nn.Conv2d(128, embedding_size, kernel_size=1, stride=1, padding=0, bias=False)
        self.bn6 = nn.BatchNorm2d(embedding_size)
        
        self.fc = nn.Linear(embedding_size, num_classes)
        
    def forward(self, x):
        x = self.conv1(x)
        x = self.bn1(x)
        x = F.relu(x)
        
        x = self.conv2_dw(x)
        x = self.bn2_dw(x)
        x = F.relu(x)
        x = self.conv2(x)
        x = self.bn2(x)
        x = F.relu(x)
        
        x = self.conv3_dw(x)
        x = self.bn3_dw(x)
        x = F.relu(x)
        x = self.conv3(x)
        x = self.bn3(x)
        x = F.relu(x)
        
        x = self.conv4_dw(x)
        x = self.bn4_dw(x)
        x = F.relu(x)
        x = self.conv4(x)
        x = self.bn4(x)
        x = F.relu(x)
        
        x = self.conv5_dw(x)
        x = self.bn5_dw(x)
        x = F.relu(x)
        x = self.conv5(x)
        x = self.bn5(x)
        x = F.relu(x)
        
        x = self.conv6_dw(x)
        x = self.bn6_dw(x)
        x = F.relu(x)
        x = self.conv6(x)
        x = self.bn6(x)
        x = F.relu(x)
        
        x = F.adaptive_avg_pool2d(x, (1, 1))
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        return x


def load_model(checkpoint_path: str, device='cpu', architecture='default'):
    """
    Load MiniFASNet model from checkpoint
    
    Args:
        checkpoint_path: Path to .pth file
        device: 'cpu' or 'cuda'
        architecture: 'default', 'v2', or 'v1se'
    
    Returns:
        Loaded model in eval mode
    """
    if architecture == 'default':
        model = MiniFASNet(embedding_size=256)
    elif architecture == 'v2':
        model = MiniFASNetV2()
    elif architecture == 'v1se':
        model = MiniFASNetV1SE()
    else:
        raise ValueError(f"Unknown architecture: {architecture}")
    
    # Load checkpoint
    state_dict = torch.load(checkpoint_path, map_location=device)
    
    # Handle different checkpoint formats
    if 'state_dict' in state_dict:
        state_dict = state_dict['state_dict']
    elif 'model' in state_dict:
        state_dict = state_dict['model']
    
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    
    return model
