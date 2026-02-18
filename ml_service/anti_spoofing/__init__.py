"""
Anti-Spoofing Module

Face liveness detection using MiniFASNet
"""

from .inference import (
    AntiSpoofPredictor,
    AntiSpoofResult,
    init_predictor,
    get_predictor,
    check_liveness
)

__all__ = [
    'AntiSpoofPredictor',
    'AntiSpoofResult',
    'init_predictor',
    'get_predictor',
    'check_liveness'
]
