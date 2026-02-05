"""
Face alignment using landmark-based similarity transform

Pure geometric transformation - no quality checks or enhancements.
"""

import cv2
import numpy as np
from typing import Dict, Tuple, Optional
from .config import FACE_SIZE, ARCFACE_SRC
from . import errors


def landmarks_to_array(landmarks: Dict[str, list]) -> Optional[np.ndarray]:
    """
    Convert landmark dictionary to numpy array
    
    Args:
        landmarks: Dictionary with keys: left_eye, right_eye, nose, left_mouth, right_mouth
    
    Returns:
        Numpy array of shape (5, 2) with landmark coordinates, or None if invalid
    """
    required_keys = ['left_eye', 'right_eye', 'nose', 'left_mouth', 'right_mouth']
    
    try:
        landmark_array = np.array([
            landmarks['left_eye'],
            landmarks['right_eye'],
            landmarks['nose'],
            landmarks['left_mouth'],
            landmarks['right_mouth'],
        ], dtype=np.float32)
        
        # Validate shape
        if landmark_array.shape != (5, 2):
            return None
            
        # Validate all coordinates are finite
        if not np.all(np.isfinite(landmark_array)):
            return None
            
        return landmark_array
        
    except (KeyError, ValueError, TypeError):
        return None


def estimate_transform(src_pts: np.ndarray, dst_pts: np.ndarray) -> Optional[np.ndarray]:
    """
    Estimate similarity transform matrix between two sets of points
    
    Args:
        src_pts: Source points (N, 2)
        dst_pts: Destination points (N, 2)
    
    Returns:
        2x3 affine transformation matrix, or None if estimation fails
    """
    try:
        # Use cv2.estimateAffinePartial2D for similarity transform
        # (rotation, scale, translation - no shear)
        transform, _ = cv2.estimateAffinePartial2D(src_pts, dst_pts)
        
        if transform is None:
            return None
            
        return transform
        
    except Exception:
        return None


def align_face(
    image: np.ndarray,
    landmarks: Dict[str, list],
    output_size: Tuple[int, int] = FACE_SIZE
) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """
    Align face using landmark-based similarity transform to ArcFace template
    
    This function:
    - Converts landmarks to array format
    - Estimates similarity transform to ArcFace reference template
    - Warps image to align face
    
    Args:
        image: Input image (H, W, C)
        landmarks: Dictionary with 5 facial landmarks
        output_size: Output face size (default: 112x112)
    
    Returns:
        Tuple of (aligned_face, error_message)
        - aligned_face: Aligned face image or None if alignment fails
        - error_message: Error reason or None if successful
    """
    # Convert landmarks to array
    landmark_array = landmarks_to_array(landmarks)
    if landmark_array is None:
        return None, errors.INVALID_LANDMARKS
    
    # Prepare destination points (ArcFace template)
    dst_pts = np.array(ARCFACE_SRC, dtype=np.float32)
    
    # Estimate transform
    transform = estimate_transform(landmark_array, dst_pts)
    if transform is None:
        return None, errors.ALIGNMENT_FAILED
    
    # Apply transform
    try:
        aligned_face = cv2.warpAffine(
            image,
            transform,
            output_size,
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0)
        )
        
        return aligned_face, None
        
    except Exception:
        return None, errors.ALIGNMENT_FAILED
