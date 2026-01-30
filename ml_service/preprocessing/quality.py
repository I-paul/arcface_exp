"""
Face quality assessment - hard gates for rejection

This module makes decisions only - no enhancement.
"""

import cv2
import numpy as np
from typing import Dict, Tuple, Optional
from . import errors


def blur_score(face: np.ndarray) -> float:
    """
    Compute blur score using Laplacian variance
    
    Higher values indicate sharper images.
    
    Args:
        face: Input face image
    
    Returns:
        Blur score (variance of Laplacian)
    """
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def brightness_score(face: np.ndarray) -> float:
    """
    Compute average brightness
    
    Args:
        face: Input face image
    
    Returns:
        Mean brightness value (0-255)
    """
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    return float(np.mean(gray))


def face_size_check(bbox: list, min_size: int) -> bool:
    """
    Check if face is large enough
    
    Args:
        bbox: Bounding box [x1, y1, x2, y2]
        min_size: Minimum face dimension in pixels
    
    Returns:
        True if face is large enough
    """
    if len(bbox) != 4:
        return False
    
    x1, y1, x2, y2 = bbox
    width = x2 - x1
    height = y2 - y1
    
    return min(width, height) >= min_size


def check_quality(
    face: np.ndarray,
    bbox: list,
    profile: Dict[str, float]
) -> Tuple[bool, Dict[str, float], Optional[str]]:
    """
    Check if face meets quality requirements
    
    This is a hard gate - face is either accepted or rejected.
    No enhancement is applied here.
    
    Args:
        face: Aligned face image
        bbox: Original bounding box (for size check)
        profile: Quality profile with thresholds
    
    Returns:
        Tuple of (passed, metrics, reject_reason)
        - passed: Whether face passed all checks
        - metrics: Dictionary of computed quality metrics
        - reject_reason: Reason for rejection (None if passed)
    """
    metrics = {}
    
    # Compute all metrics
    metrics["blur"] = blur_score(face)
    metrics["brightness"] = brightness_score(face)
    
    # Check blur
    if metrics["blur"] < profile["blur_min"]:
        return False, metrics, errors.BLUR_TOO_HIGH
    
    # Check brightness
    if metrics["brightness"] < profile["brightness_min"]:
        return False, metrics, errors.LOW_BRIGHTNESS
    
    if metrics["brightness"] > profile["brightness_max"]:
        return False, metrics, errors.HIGH_BRIGHTNESS
    
    # Check face size
    if not face_size_check(bbox, profile["face_min_size"]):
        return False, metrics, errors.FACE_TOO_SMALL
    
    # All checks passed
    return True, metrics, None
