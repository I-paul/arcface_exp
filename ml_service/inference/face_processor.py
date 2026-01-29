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
from typing import List, Tuple
import gc

logger = logging.getLogger(__name__)

class FaceProcessor:
    """
    Handles face detection and embedding extraction using InsightFace
    GPU-optimized with batch processing support
    """
    
    # Configuration
    EMBEDDING_DIM = 512
    OCCLUSION_THRESHOLD = 0.6
    BATCH_SIZE = 8  # Optimal for most GPUs
    
    def __init__(self):
        """Initialize InsightFace model with GPU support"""
        logger.info("Initializing FaceProcessor...")
        
        # Check GPU availability
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {self.device}")
        
        if self.device == "cuda":
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
            gpu_props = torch.cuda.get_device_properties(0)
            logger.info(f"GPU Memory: {gpu_props.total_memory / 1e9:.2f} GB")
            logger.info(f"GPU Compute Capability: {gpu_props.major}.{gpu_props.minor}")
            
            # Set GPU memory management
            torch.cuda.empty_cache()
        
        # Configure ONNX Runtime providers with GPU optimization
        providers = [
            (
                "CUDAExecutionProvider",
                {
                    "device_id": 0,
                    "arena_extend_strategy": "kNextPowerOfTwo",
                    "gpu_mem_limit": 2 * 1024 * 1024 * 1024,  # 2GB
                    "cudnn_conv_algo_search": "EXHAUSTIVE",
                    "do_copy_in_default_stream": True,
                }
            ),
            "CPUExecutionProvider"
        ]
        
        # Initialize FaceAnalysis
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=providers,
            allowed_modules=None
        )
        
        # Prepare with GPU context (ctx_id=0 is GPU 0)
        ctx_id = 0 if self.device == "cuda" else -1
        self.app.prepare(ctx_id=ctx_id, det_size=(640, 640))
        
        # Warmup GPU
        self._warmup_model()
        
        logger.info(f"FaceProcessor initialized successfully")
    
    def _warmup_model(self):
        """Warmup GPU with dummy inference"""
        if self.device == "cuda":
            logger.info("Warming up GPU...")
            try:
                # Create dummy image
                dummy_img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
                
                # Run inference 3 times to warm up
                for _ in range(3):
                    self.app.get(dummy_img)
                
                torch.cuda.synchronize()
                logger.info("GPU warmup completed")
            except Exception as e:
                logger.warning(f"GPU warmup failed: {e}")
    
    def is_gpu_available(self) -> bool:
        """Check if GPU is available"""
        return self.device == "cuda"
    
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
        yaw_deg = yaw_ratio * 60.0  # empirical scaling
        
        return yaw_deg
    
    def is_frontal_face(self, face, threshold: float = 50.0) -> bool:
        """
        Check if face is frontal (not turned)
        
        Args:
            face: Face object
            threshold: Maximum yaw angle for frontal classification (default: 50 degrees)
            
        Returns:
            True if face is frontal
        """
        yaw = abs(self.estimate_yaw(face))
        logger.debug(f"Face yaw angle: {yaw:.2f}°, threshold: {threshold}°, frontal: {yaw < threshold}")
        return yaw < threshold
    
    def detect_faces_batch(self, images: List[np.ndarray]) -> List[list]:
        """
        Detect faces in multiple images with GPU batch processing
        
        Args:
            images: List of input images (BGR format)
            
        Returns:
            List of face lists for each image
        """
        try:
            results = []
            for image in images:
                faces = self.app.get(image)
                results.append(faces)
            return results
        except Exception as e:
            logger.error(f"Batch face detection error: {str(e)}")
            return [[] for _ in images]
    
    def get_embeddings_batch(self, faces: List) -> List[np.ndarray]:
        """
        Extract embeddings from multiple faces efficiently
        
        Args:
            faces: List of face objects
            
        Returns:
            List of normalized embeddings
        """
        embeddings = []
        for face in faces:
            embedding = face.normed_embedding
            embeddings.append(self.normalize(embedding))
        return embeddings
    
    def process_images_batch(
        self, 
        images: List[np.ndarray],
        check_quality: bool = True
    ) -> List[Tuple[bool, np.ndarray, str]]:
        """
        Process multiple images in batch for optimal GPU utilization
        
        Args:
            images: List of input images
            check_quality: Whether to check face quality (occlusion, frontal)
            
        Returns:
            List of tuples: (success, embedding, message)
        """
        results = []
        
        # Batch detect faces
        faces_list = self.detect_faces_batch(images)
        
        for idx, faces in enumerate(faces_list):
            if not faces:
                logger.warning(f"Image {idx}: No face detected")
                results.append((False, None, "No face detected"))
                continue
            
            # Select largest face
            face = self.select_largest_face(faces)
            logger.debug(f"Image {idx}: Detected {len(faces)} face(s), using largest")
            
            # Quality checks
            if check_quality:
                if self.has_occlusion(face):
                    occlusion_score = self.occlusion_score(face)
                    logger.warning(f"Image {idx}: Face occluded (score: {occlusion_score:.2f})")
                    results.append((False, None, "Face occluded"))
                    continue
                
                if not self.is_frontal_face(face):
                    yaw = abs(self.estimate_yaw(face))
                    logger.warning(f"Image {idx}: Face not frontal (yaw: {yaw:.2f}°)")
                    results.append((False, None, "Face not frontal"))
                    continue
            
            # Get embedding
            embedding = self.get_embedding(face)
            logger.info(f"Image {idx}: Face processed successfully")
            results.append((True, embedding, "Success"))
        
        return results
    
    def get_gpu_memory_info(self) -> dict:
        """
        Get GPU memory usage information
        
        Returns:
            Dictionary with memory stats
        """
        if self.device != "cuda":
            return {"available": False}
        
        try:
            allocated = torch.cuda.memory_allocated(0) / 1e9
            reserved = torch.cuda.memory_reserved(0) / 1e9
            total = torch.cuda.get_device_properties(0).total_memory / 1e9
            
            return {
                "available": True,
                "allocated_gb": round(allocated, 2),
                "reserved_gb": round(reserved, 2),
                "total_gb": round(total, 2),
                "free_gb": round(total - allocated, 2),
                "utilization_percent": round((allocated / total) * 100, 1)
            }
        except Exception as e:
            logger.error(f"Failed to get GPU memory info: {e}")
            return {"available": True, "error": str(e)}
    
    def clear_gpu_cache(self):
        """Clear GPU cache to free memory"""
        if self.device == "cuda":
            torch.cuda.empty_cache()
            gc.collect()
            logger.info("GPU cache cleared")
