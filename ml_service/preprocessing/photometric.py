"""
Photometric enhancements - soft fixes (optional)

This module NEVER rejects faces - it only enhances.
All operations are optional and configurable.
"""

import cv2
import numpy as np
from typing import Optional


def apply_gamma(face: np.ndarray, gamma: float = 1.2) -> np.ndarray:
    """
    Apply gamma correction to face image
    
    Useful for adjusting overall brightness without clipping.
    
    Args:
        face: Input face image
        gamma: Gamma value (>1 brightens, <1 darkens)
    
    Returns:
        Gamma-corrected face image
    """
    inv_gamma = 1.0 / gamma
    table = np.array([
        ((i / 255.0) ** inv_gamma) * 255
        for i in range(256)
    ]).astype("uint8")
    
    return cv2.LUT(face, table)


def apply_clahe(face: np.ndarray, clip_limit: float = 2.0, tile_size: int = 8) -> np.ndarray:
    """
    Apply Contrast Limited Adaptive Histogram Equalization
    
    Enhances local contrast while avoiding over-amplification.
    Applied only to luminance channel (Y in YCrCb).
    
    Args:
        face: Input face image (BGR)
        clip_limit: Contrast clipping limit
        tile_size: Size of grid for histogram equalization
    
    Returns:
        CLAHE-enhanced face image
    """
    # Convert to YCrCb color space
    ycrcb = cv2.cvtColor(face, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)
    
    # Apply CLAHE to Y channel only
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
    y_enhanced = clahe.apply(y)
    
    # Merge back and convert to BGR
    enhanced_ycrcb = cv2.merge((y_enhanced, cr, cb))
    enhanced_bgr = cv2.cvtColor(enhanced_ycrcb, cv2.COLOR_YCrCb2BGR)
    
    return enhanced_bgr


def apply_bilateral_filter(
    face: np.ndarray,
    d: int = 5,
    sigma_color: float = 50.0,
    sigma_space: float = 50.0
) -> np.ndarray:
    """
    Apply bilateral filter for noise reduction while preserving edges
    
    Args:
        face: Input face image
        d: Diameter of pixel neighborhood
        sigma_color: Filter sigma in color space
        sigma_space: Filter sigma in coordinate space
    
    Returns:
        Filtered face image
    """
    return cv2.bilateralFilter(face, d, sigma_color, sigma_space)


def adaptive_brightness(face: np.ndarray, target_mean: float = 128.0) -> np.ndarray:
    """
    Adaptively adjust brightness to target mean
    
    Args:
        face: Input face image
        target_mean: Target mean brightness (0-255)
    
    Returns:
        Brightness-adjusted face image
    """
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    current_mean = np.mean(gray)
    
    if current_mean < 1:  # Avoid division by zero
        return face
    
    # Calculate adjustment factor
    factor = target_mean / current_mean
    
    # Apply adjustment with clipping
    adjusted = np.clip(face * factor, 0, 255).astype(np.uint8)
    
    return adjusted


def enhance_face(
    face: np.ndarray,
    use_clahe: bool = True,
    use_gamma: bool = False,
    use_bilateral: bool = False,
    use_adaptive_brightness: bool = False,
    gamma: float = 1.2
) -> np.ndarray:
    """
    Apply selected enhancements to face
    
    Args:
        face: Input face image
        use_clahe: Whether to apply CLAHE
        use_gamma: Whether to apply gamma correction
        use_bilateral: Whether to apply bilateral filtering
        use_adaptive_brightness: Whether to apply adaptive brightness
        gamma: Gamma value if use_gamma=True
    
    Returns:
        Enhanced face image
    """
    enhanced = face.copy()
    
    if use_adaptive_brightness:
        enhanced = adaptive_brightness(enhanced)
    
    if use_clahe:
        enhanced = apply_clahe(enhanced)
    
    if use_gamma:
        enhanced = apply_gamma(enhanced, gamma)
    
    if use_bilateral:
        enhanced = apply_bilateral_filter(enhanced)
    
    return enhanced
