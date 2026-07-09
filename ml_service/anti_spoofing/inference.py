"""
Anti-Spoofing Inference Service

Provides liveness detection using MiniFASNet ONNX model
Input: 80x80 RGB face crop
Output: Real/Fake classification
"""
import onnxruntime as ort
import numpy as np
import cv2
import logging
from pathlib import Path
from typing import Dict, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AntiSpoofResult:
    """Result from anti-spoofing inference"""
    is_live: bool
    real_score: float
    fake_score: float
    label: int  # 0 = real, 1 = fake


class AntiSpoofPredictor:
    """
    Anti-spoofing predictor using ONNX model
    
    Architecture:
    - Input: 80x80x3 RGB image (normalized)
    - Output: 2 logits (real, fake)
    - Decision: argmax(logits)
    """
    
    # Model configuration
    INPUT_SIZE = (80, 80)
    MEAN = [0.485, 0.456, 0.406]
    STD = [0.229, 0.224, 0.225]
    
    def __init__(self, model_path: Optional[str] = None, use_gpu: bool = True):
        """
        Initialize anti-spoof predictor
        
        Args:
            model_path: Path to ONNX model (default: models/minifasnet.onnx)
            use_gpu: Whether to use GPU acceleration
        """
        if model_path is None:
            # Default to models/minifasnet.onnx relative to this file
            current_dir = Path(__file__).parent
            model_path = str(current_dir.parent / "models" / "minifasnet.onnx")
        
        self.model_path = model_path
        self.use_gpu = use_gpu
        
        # Initialize ONNX session
        self._init_session()
        
        logger.info(f"AntiSpoofPredictor initialized with model: {model_path}")
        logger.info(f"   GPU: {'Enabled' if use_gpu else 'Disabled'}")
    
    def _init_session(self):
        """Initialize ONNX Runtime session"""
        available = ort.get_available_providers()

        # Set execution providers
        providers = []
        if self.use_gpu and 'CUDAExecutionProvider' in available:
            providers.append('CUDAExecutionProvider')
        elif self.use_gpu:
            logger.warning(
                "CUDAExecutionProvider requested for anti-spoofing but not available. "
                f"Available providers: {available}. Falling back to CPUExecutionProvider."
            )
        providers.append('CPUExecutionProvider')
        
        # Session options
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # Create session
        try:
            self.session = ort.InferenceSession(
                self.model_path,
                sess_options=sess_options,
                providers=providers
            )
            
            # Get active provider
            active_provider = self.session.get_providers()[0]
            logger.info(f"   Active provider: {active_provider}")
            
            # Get input/output info
            self.input_name = self.session.get_inputs()[0].name
            self.output_name = self.session.get_outputs()[0].name
            
        except Exception as e:
            logger.error(f"Failed to initialize ONNX session: {e}")
            raise
    
    def preprocess(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Preprocess face crop for anti-spoofing model
        
        Args:
            face_crop: BGR image (any size)
            
        Returns:
            Preprocessed tensor (1, 3, 80, 80)
            
        Raises:
            ValueError: If input is invalid
        """
        # Validate input
        if face_crop is None:
            raise ValueError("face_crop is None")
        
        if not isinstance(face_crop, np.ndarray):
            raise ValueError(f"face_crop must be numpy array, got {type(face_crop)}")
        
        if face_crop.size == 0:
            raise ValueError(f"face_crop is empty with shape {face_crop.shape}")
        
        if len(face_crop.shape) != 3:
            raise ValueError(f"face_crop must be 3D array (H,W,C), got shape {face_crop.shape}")
        
        h, w, c = face_crop.shape
        if c != 3:
            raise ValueError(f"face_crop must have 3 channels (BGR), got {c} channels")
        
        if h < 1 or w < 1:
            raise ValueError(f"face_crop invalid dimensions: {h}x{w} (must be >= 1x1)")
        
        logger.debug(f"Preprocessing input: shape={face_crop.shape}, dtype={face_crop.dtype}")
        
        # Resize to 80x80
        try:
            face_resized = cv2.resize(face_crop, self.INPUT_SIZE, interpolation=cv2.INTER_LINEAR)
        except Exception as e:
            raise ValueError(f"cv2.resize failed: {e}")
        
        # BGR to RGB
        try:
            face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)
        except Exception as e:
            raise ValueError(f"cv2.cvtColor failed: {e}")
        
        # Normalize to [0, 1]
        face_float = face_rgb.astype(np.float32) / 255.0
        
        # Standardize using ImageNet stats
        for i in range(3):
            face_float[:, :, i] = (face_float[:, :, i] - self.MEAN[i]) / self.STD[i]
        
        # HWC to CHW
        face_chw = np.transpose(face_float, (2, 0, 1))
        
        # Add batch dimension
        face_batch = np.expand_dims(face_chw, axis=0)
        
        return face_batch.astype(np.float32)
    
    def predict(self, face_crop: np.ndarray) -> AntiSpoofResult:
        """
        Predict liveness for a face crop
        
        Args:
            face_crop: BGR face image (any size, will be resized to 80x80)
            
        Returns:
            AntiSpoofResult with is_live, scores, and label
            
        Raises:
            ValueError: If input validation fails
            RuntimeError: If inference fails
        """
        # Preprocess (with validation)
        try:
            input_tensor = self.preprocess(face_crop)
        except ValueError as ve:
            logger.error(f"Input validation failed: {ve}")
            raise
        except Exception as e:
            logger.error(f"Preprocessing failed: {type(e).__name__}: {e}")
            raise ValueError(f"Preprocessing failed: {e}")
        
        # Run inference
        try:
            logits = self.session.run(
                [self.output_name],
                {self.input_name: input_tensor}
            )[0]
        except Exception as e:
            logger.error(f"ONNX inference failed: {type(e).__name__}: {e}")
            raise RuntimeError(f"Anti-spoof inference failed: {e}")
        
        # logits shape: (1, 2) -> [real_logit, fake_logit]
        # DO NOT use softmax - use argmax on raw logits as per instructions
        
        label = int(np.argmax(logits[0]))  # 0 = real, 1 = fake
        is_live = (label == 0)
        
        # Calculate raw scores (not softmax)
        real_score = float(logits[0][0])
        fake_score = float(logits[0][1])
        
        return AntiSpoofResult(
            is_live=is_live,
            real_score=real_score,
            fake_score=fake_score,
            label=label
        )
    
    def predict_from_aligned(self, aligned_face: np.ndarray) -> AntiSpoofResult:
        """
        Predict from an already aligned 112x112 face (from InsightFace)
        
        Args:
            aligned_face: BGR aligned face image (typically 112x112)
            
        Returns:
            AntiSpoofResult
        """
        # MiniFASNet expects 80x80, so we just resize
        return self.predict(aligned_face)
    
    def get_runtime_info(self) -> Dict:
        """Get runtime information"""
        return {
            "model_path": self.model_path,
            "input_size": self.INPUT_SIZE,
            "providers": self.session.get_providers(),
            "input_name": self.input_name,
            "output_name": self.output_name
        }


# Singleton instance (will be initialized by main.py)
_predictor_instance: Optional[AntiSpoofPredictor] = None


def init_predictor(model_path: Optional[str] = None, use_gpu: bool = True) -> AntiSpoofPredictor:
    """
    Initialize global predictor instance
    
    Args:
        model_path: Path to ONNX model
        use_gpu: Whether to use GPU
        
    Returns:
        Initialized predictor
    """
    global _predictor_instance
    _predictor_instance = AntiSpoofPredictor(model_path=model_path, use_gpu=use_gpu)
    return _predictor_instance


def get_predictor() -> AntiSpoofPredictor:
    """
    Get global predictor instance
    
    Returns:
        Initialized predictor
        
    Raises:
        RuntimeError: If predictor not initialized
    """
    if _predictor_instance is None:
        raise RuntimeError("AntiSpoofPredictor not initialized. Call init_predictor() first.")
    return _predictor_instance


def check_liveness(face_crop: np.ndarray) -> Dict:
    """
    Convenience function to check liveness
    
    Args:
        face_crop: BGR face image
        
    Returns:
        Dictionary with liveness result:
        {
            "is_live": bool,
            "real_score": float,
            "fake_score": float,
            "label": int
        }
    """
    predictor = get_predictor()
    result = predictor.predict(face_crop)
    
    return {
        "is_live": result.is_live,
        "status": "live" if result.is_live else "spoof",
        "real_score": result.real_score,
        "fake_score": result.fake_score,
        "label": result.label
    }
