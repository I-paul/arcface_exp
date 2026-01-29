"""
Face Processing Module
Handles face detection, embedding extraction, and quality checks
"""
import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
import torch
import logging

logger = logging.getLogger(__name__)

class FaceProcessor:
    """
    Handles face detection and embedding extraction using InsightFace
    """
    
    # Configuration
    EMBEDDING_DIM = 512
    OCCLUSION_THRESHOLD = 0.6
    
    def __init__(self, force_gpu: bool = True):
        """Initialize InsightFace model with GPU support
        
        Args:
            force_gpu: If True, raises exception if GPU is not available
        """
        logger.info("Initializing FaceProcessor...")
        
        # Check GPU availability
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {self.device}")
        
        # Force GPU for recognition and enrollment tasks
        if force_gpu and self.device != "cuda":
            raise RuntimeError(
                "GPU is required for face recognition and enrollment tasks. "
                "CUDA is not available. Please check your GPU setup and CUDA installation."
            )
        
        if self.device == "cuda":
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
            logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
            
            # CUDA optimizations for better performance
            torch.backends.cudnn.enabled = True
            torch.backends.cudnn.benchmark = True
            logger.info("CUDA optimizations enabled (cuDNN benchmark mode)")
        
        # Configure ONNX Runtime providers - GPU ONLY for production
        if self.device == "cuda":
            providers = [
                ("CUDAExecutionProvider", {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 2 * 1024 * 1024 * 1024,  # 2GB limit
                    'cudnn_conv_algo_search': 'EXHAUSTIVE',
                    'do_copy_in_default_stream': True,
                })
            ]
            logger.info("Using CUDAExecutionProvider with optimized settings")
        else:
            providers = ["CPUExecutionProvider"]  # Fallback
            logger.warning("Running on CPU - Performance will be degraded")
        
        # Initialize FaceAnalysis
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=providers,
            allowed_modules=None
        )
        
        # Prepare with GPU context (ctx_id=0 is GPU 0)
        ctx_id = 0 if self.device == "cuda" else -1
        self.app.prepare(ctx_id=ctx_id, det_size=(640, 640))

        # Log actual runtime providers to verify GPU execution
        providers_info = self.get_runtime_providers()
        if providers_info:
            logger.info(f"Runtime providers: {providers_info}")
        else:
            logger.warning("Could not determine runtime providers from InsightFace models")
        
        logger.info(f"FaceProcessor initialized successfully on {self.device.upper()}")
    
    def is_gpu_available(self) -> bool:
        """Check if GPU is available"""
        return self.device == "cuda"

    def get_runtime_providers(self) -> dict:
        """
        Get ONNX Runtime providers used by InsightFace models.

        Returns:
            Dict of model name -> list of providers
        """
        providers = {}
        try:
            if hasattr(self.app, "models") and isinstance(self.app.models, dict):
                for name, model in self.app.models.items():
                    if hasattr(model, "sess") and model.sess is not None:
                        try:
                            providers[name] = model.sess.get_providers()
                        except Exception as e:
                            logger.warning(f"Failed to read providers for model {name}: {str(e)}")
            return providers
        except Exception as e:
            logger.warning(f"Failed to collect runtime providers: {str(e)}")
            return {}
    
    def detect_faces(self, image: np.ndarray) -> list:
        """
        Detect faces in an image
        
        Args:
            image: Input image (BGR format)
            
        Returns:
            List of detected face objects
        """
        try:
            faces = self.app.get(image)
            return faces
        except Exception as e:
            logger.error(f"Face detection error: {str(e)}")
            return []
    
    def select_largest_face(self, faces: list):
        """
        Select the largest face from detected faces
        
        Args:
            faces: List of detected faces
            
        Returns:
            Largest face object or None
        """
        if not faces:
            return None
        
        return max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
        )
    
    def get_embedding(self, face) -> np.ndarray:
        """
        Extract normalized embedding from face
        
        Args:
            face: Face object from detection
            
        Returns:
            Normalized embedding vector
        """
        embedding = face.normed_embedding
        return self.normalize(embedding)
    
    @staticmethod
    def normalize(vector: np.ndarray) -> np.ndarray:
        """
        Normalize a vector to unit length
        
        Args:
            vector: Input vector
            
        Returns:
            Normalized vector
        """
        return vector / (np.linalg.norm(vector) + 1e-8)
    
    def occlusion_score(self, face) -> float:
        """
        Calculate occlusion score based on visible landmarks
        
        Args:
            face: Face object with keypoints
            
        Returns:
            Score between 0-1 (1 = fully visible)
        """
        if face.kps is None:
            return 1.0
        
        visible = np.count_nonzero(face.kps[:, 0] > 0)
        return visible / face.kps.shape[0]
    
    def has_occlusion(self, face) -> bool:
        """
        Check if face has significant occlusion
        
        Args:
            face: Face object
            
        Returns:
            True if face is occluded
        """
        return self.occlusion_score(face) < self.OCCLUSION_THRESHOLD
    
    def estimate_yaw(self, face) -> float:
        """
        Estimate face yaw angle using landmarks
        
        Args:
            face: Face object with keypoints
            
        Returns:
            Yaw angle in degrees
        """
        if face.kps is None:
            return 0.0
        
        kps = face.kps
        
        left_eye = kps[0]
        right_eye = kps[1]
        nose = kps[2]
        
        eye_center_x = (left_eye[0] + right_eye[0]) / 2.0
        face_width = abs(right_eye[0] - left_eye[0]) + 1e-6
        
        yaw_ratio = (nose[0] - eye_center_x) / face_width
        yaw_deg = yaw_ratio * 90.0  # empirical scaling
        
        return yaw_deg
    
    def is_frontal_face(self, face, threshold: float = 30.0) -> bool:
        """
        Check if face is frontal (not turned)
        
        Args:
            face: Face object
            threshold: Maximum yaw angle for frontal classification
            
        Returns:
            True if face is frontal
        """
        yaw = abs(self.estimate_yaw(face))
        return yaw < threshold
