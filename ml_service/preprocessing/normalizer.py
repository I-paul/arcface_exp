"""
Normalization for ArcFace model compatibility

Ensures embedding distribution stability and model-agnostic preprocessing.
"""

import cv2
import numpy as np
from .config import FACE_SIZE


def to_arcface_tensor(face: np.ndarray) -> np.ndarray:
    """
    Convert face image to ArcFace-compatible tensor
    
    Performs:
    1. BGR to RGB conversion
    2. Normalization to [0, 1]
    3. Standardization to [-1, 1] (mean=0.5, std=0.5)
    4. Channel-first format (C, H, W)
    5. Add batch dimension
    
    Args:
        face: Input face image (H, W, C) in BGR format, uint8
    
    Returns:
        Normalized tensor of shape (1, C, H, W) ready for model inference
    """
    # Ensure target size (112x112)
    target_w, target_h = FACE_SIZE
    if face.shape[1] != target_w or face.shape[0] != target_h:
        face = cv2.resize(face, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

    # BGR to RGB
    face = face[:, :, ::-1]
    
    # Convert to float32 and normalize to [0, 1]
    face = face.astype("float32") / 255.0
    
    # Standardize to [-1, 1] with mean=0.5, std=0.5
    face = (face - 0.5) / 0.5
    
    # Transpose to channel-first format (C, H, W)
    face = np.transpose(face, (2, 0, 1))
    
    # Add batch dimension (1, C, H, W)
    face = face[np.newaxis, :]
    
    return face


def denormalize_arcface_tensor(tensor: np.ndarray) -> np.ndarray:
    """
    Convert ArcFace tensor back to image for visualization
    
    Args:
        tensor: Normalized tensor of shape (1, C, H, W) or (C, H, W)
    
    Returns:
        Image in BGR format (H, W, C), uint8
    """
    # Remove batch dimension if present
    if tensor.ndim == 4:
        tensor = tensor[0]
    
    # Transpose to (H, W, C)
    image = np.transpose(tensor, (1, 2, 0))
    
    # Denormalize from [-1, 1] to [0, 1]
    image = (image * 0.5) + 0.5
    
    # Scale to [0, 255]
    image = (image * 255.0).clip(0, 255).astype("uint8")
    
    # RGB to BGR
    image = image[:, :, ::-1]
    
    return image
