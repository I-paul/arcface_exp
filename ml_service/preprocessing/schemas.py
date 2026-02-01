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
class PreprocessResult:
    """
    Output schema for face preprocessing (canonical contract)
    
    Attributes:
        usable: Whether the face passed all quality checks
        face_tensor: Preprocessed face tensor ready for embedding model (None if not usable)
        reject_reason: Reason for rejection if not usable (None if usable)
        quality_metrics: Dictionary of computed quality scores
    """
    usable: bool
    face_tensor: Optional[np.ndarray]
    reject_reason: Optional[str]
    quality_metrics: Dict[str, float]


@dataclass
class PreprocessResponse(PreprocessResult):
    """
    Output schema for face preprocessing (extended, backward-compatible)
    
    Attributes:
        flags: Dictionary of processing flags (what operations were applied)
    """
    flags: Dict[str, bool]
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        if self.face_tensor is None:
            face_tensor = None
        elif hasattr(self.face_tensor, "detach"):
            face_tensor = self.face_tensor.detach().cpu().numpy().tolist()
        else:
            face_tensor = self.face_tensor.tolist()

        return {
            "usable": self.usable,
            "face_tensor": face_tensor,
            "quality_metrics": self.quality_metrics,
            "flags": self.flags,
            "reject_reason": self.reject_reason,
        }
