"""
Face Preprocessor - The Orchestrator

Stateless, deterministic, and testable preprocessing pipeline.
Coordinates alignment, quality checks, enhancement, and normalization.
"""

import numpy as np
from typing import Dict
from .schemas import PreprocessRequest, PreprocessResponse
from .aligner import align_face
from .quality import check_quality
from .photometric import enhance_face
from .normalizer import to_arcface_tensor
from .config import PROFILES


def preprocess(req: PreprocessRequest) -> PreprocessResponse:
    """
    Preprocess a face for embedding extraction
    
    Pipeline:
    1. Align face using landmarks
    2. Check quality (reject if fails)
    3. Apply enhancements (optional)
    4. Normalize to model format
    
    Args:
        req: PreprocessRequest with image, bbox, landmarks, and mode
    
    Returns:
        PreprocessResponse with:
        - usable: Whether face passed all checks
        - face_tensor: Normalized tensor (None if rejected)
        - quality_metrics: Computed quality scores
        - flags: Processing flags
        - reject_reason: Reason for rejection (None if accepted)
    """
    # Get profile for mode
    if req.mode not in PROFILES:
        return PreprocessResponse(
            usable=False,
            face_tensor=None,
            quality_metrics={},
            flags={},
            reject_reason=f"INVALID_MODE_{req.mode}"
        )
    
    profile = PROFILES[req.mode]
    flags = {}
    
    # Step 1: Align face
    aligned, align_error = align_face(req.image, req.landmarks)
    
    if aligned is None or align_error is not None:
        return PreprocessResponse(
            usable=False,
            face_tensor=None,
            quality_metrics={},
            flags={"aligned": False},
            reject_reason=align_error
        )
    
    flags["aligned"] = True
    
    # Step 2: Quality check (hard gate)
    passed, metrics, reject_reason = check_quality(aligned, req.bbox, profile)
    
    if not passed:
        return PreprocessResponse(
            usable=False,
            face_tensor=None,
            quality_metrics=metrics,
            flags=flags,
            reject_reason=reject_reason
        )
    
    # Step 3: Enhancements (soft fixes)
    # For now, only apply CLAHE by default
    # This can be made configurable in the future
    enhanced = enhance_face(
        aligned,
        use_clahe=True,
        use_gamma=False,
        use_bilateral=False,
        use_adaptive_brightness=False
    )
    flags["clahe"] = True
    
    # Step 4: Normalize to ArcFace tensor format
    try:
        tensor = to_arcface_tensor(enhanced)
        flags["normalized"] = True
    except Exception as e:
        return PreprocessResponse(
            usable=False,
            face_tensor=None,
            quality_metrics=metrics,
            flags=flags,
            reject_reason=f"NORMALIZATION_ERROR: {str(e)}"
        )
    
    # Success
    return PreprocessResponse(
        usable=True,
        face_tensor=tensor,
        quality_metrics=metrics,
        flags=flags,
        reject_reason=None
    )


def preprocess_batch(requests: list) -> list:
    """
    Preprocess multiple faces in batch
    
    Args:
        requests: List of PreprocessRequest objects
    
    Returns:
        List of PreprocessResponse objects
    """
    return [preprocess(req) for req in requests]
