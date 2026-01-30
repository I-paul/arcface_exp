"""
Data schemas for preprocessing requests and responses
"""

from dataclasses import dataclass
from typing import Dict, Optional, Any
import numpy as np


@dataclass
class PreprocessRequest:
    """
    Input schema for face preprocessing
    
    Attributes:
        image: Input image (numpy array)
        bbox: Bounding box [x1, y1, x2, y2]
        landmarks: Dictionary with landmark coordinates
                   Expected keys: 'left_eye', 'right_eye', 'nose', 'left_mouth', 'right_mouth'
        mode: Processing mode - "enroll" or "recognize"
    """
    image: np.ndarray
    bbox: list
    landmarks: Dict[str, list]
    mode: str  # "enroll" | "recognize"
    
    def __post_init__(self):
        if self.mode not in ["enroll", "recognize"]:
            raise ValueError(f"Invalid mode: {self.mode}. Must be 'enroll' or 'recognize'")


@dataclass
class PreprocessResponse:
    """
    Output schema for face preprocessing
    
    Attributes:
        usable: Whether the face passed all quality checks
        face_tensor: Preprocessed face tensor ready for embedding model (None if not usable)
        quality_metrics: Dictionary of computed quality scores
        flags: Dictionary of processing flags (what operations were applied)
        reject_reason: Reason for rejection if not usable (None if usable)
    """
    usable: bool
    face_tensor: Optional[np.ndarray]
    quality_metrics: Dict[str, float]
    flags: Dict[str, bool]
    reject_reason: Optional[str]
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "usable": self.usable,
            "face_tensor": self.face_tensor.tolist() if self.face_tensor is not None else None,
            "quality_metrics": self.quality_metrics,
            "flags": self.flags,
            "reject_reason": self.reject_reason,
        }
