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


def mean_luminance(face: np.ndarray) -> float:
    """
    Compute mean luminance (brightness)
    
    Args:
        face: Input face image
    
    Returns:
        Mean luminance value (0-255)
    """
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    return float(np.mean(gray))


def contrast_score(face: np.ndarray) -> float:
    """
    Compute contrast score (standard deviation of luminance)
    
    Args:
        face: Input face image
    
    Returns:
        Contrast score (std dev of luminance)
    """
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    return float(np.std(gray))


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


def face_area_ratio(bbox: list, image_shape: Optional[tuple]) -> float:
    """
    Compute face area ratio relative to the full image
    
    Args:
        bbox: Bounding box [x1, y1, x2, y2]
        image_shape: Full image shape (H, W, C)
    
    Returns:
        Ratio of face area to full image area (0-1)
    """
    if image_shape is None or len(bbox) != 4:
        return 0.0
    
    h, w = image_shape[:2]
    if h <= 0 or w <= 0:
        return 0.0
    
    x1, y1, x2, y2 = bbox
    width = max(0.0, x2 - x1)
    height = max(0.0, y2 - y1)
    face_area = width * height
    image_area = float(h * w)
    
    return float(face_area / image_area) if image_area > 0 else 0.0


def check_quality(
    face: np.ndarray,
    bbox: list,
    profile: Dict[str, float],
    image_shape: Optional[tuple] = None
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
    metrics["blur_score"] = blur_score(face)
    metrics["mean_luminance"] = mean_luminance(face)
    metrics["face_area_ratio"] = face_area_ratio(bbox, image_shape)
    metrics["contrast"] = contrast_score(face)

    # Backward-compatible metric keys
    metrics["blur"] = metrics["blur_score"]
    metrics["brightness"] = metrics["mean_luminance"]
    
    # Check blur
    if metrics["blur_score"] < profile["blur_min"]:
        return False, metrics, errors.BLUR_TOO_HIGH
    
    # Check brightness
    if metrics["mean_luminance"] < profile["brightness_min"]:
        return False, metrics, errors.LOW_LIGHT
    
    if metrics["mean_luminance"] > profile["brightness_max"]:
        return False, metrics, errors.OVER_EXPOSED
    
    # Check face size
    if not face_size_check(bbox, profile["face_min_size"]):
        return False, metrics, errors.FACE_TOO_SMALL
    
    # All checks passed
    return True, metrics, None
