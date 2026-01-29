"""
ML Service API Entrypoint
Face Recognition and Enrollment Service
GPU-Optimized with Batch Processing
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import cv2
import logging
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor

from inference.face_processor import FaceProcessor
from embeddings.embedding_manager import EmbeddingManager
from milvus_client.client import MilvusClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Face Recognition ML Service",
    description="Production-ready face recognition and enrollment API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
face_processor = None
embedding_manager = None
milvus_client = None
executor = ThreadPoolExecutor(max_workers=2)  # For CPU-bound tasks

# Pydantic models
class RecognitionResponse(BaseModel):
    name: Optional[str]
    confidence: float
    is_recognized: bool
    message: str

class EnrollmentRequest(BaseModel):
    name: str

class EnrollmentResponse(BaseModel):
    success: bool
    message: str
    person_id: Optional[str]

class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    milvus_connected: bool
    gpu_memory: Optional[dict] = None

class BatchRecognitionResponse(BaseModel):
    results: List[RecognitionResponse]
    processing_time_ms: float

# ==========================
# STARTUP & SHUTDOWN
# ==========================
@app.on_event("startup")
async def startup_event():
    """Initialize ML models and connections on startup"""
    global face_processor, embedding_manager, milvus_client
    
    logger.info("Starting ML Service...")
    
    try:
        # Initialize Face Processor (InsightFace)
        logger.info("Initializing Face Processor...")
        face_processor = FaceProcessor()
        
        # Initialize Embedding Manager
        logger.info("Initializing Embedding Manager...")
        embedding_manager = EmbeddingManager()
        
        # Initialize Milvus Client
        logger.info("Connecting to Milvus...")
        milvus_client = MilvusClient()
        
        logger.info("ML Service started successfully!")
        
    except Exception as e:
        logger.error(f"Failed to start ML Service: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down ML Service...")
    if milvus_client:
        milvus_client.disconnect()

# ==========================
# HEALTH & STATUS
# ==========================
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with GPU memory info"""
    gpu_mem = None
    if face_processor and face_processor.is_gpu_available():
        gpu_mem = face_processor.get_gpu_memory_info()
    
    return {
        "status": "healthy",
        "gpu_available": face_processor.is_gpu_available() if face_processor else False,
        "milvus_connected": milvus_client.is_connected() if milvus_client else False,
        "gpu_memory": gpu_mem
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Face Recognition ML Service",
        "version": "1.0.0",
        "status": "running"
    }

# ==========================
# RECOGNITION
# ==========================
@app.post("/recognize", response_model=RecognitionResponse)
async def recognize_face(file: UploadFile = File(...)):
    """
    Recognize a face from an uploaded image
    
    Args:
        file: Image file containing a face
        
    Returns:
        Recognition result with name and confidence
    """
    try:
        # Read and decode image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format")
        
        # Process face
        faces = face_processor.detect_faces(image)
        
        if not faces:
            return RecognitionResponse(
                name=None,
                confidence=0.0,
                is_recognized=False,
                message="No face detected in image"
            )
        
        # Use the largest face
        face = face_processor.select_largest_face(faces)
        
        # Check occlusion
        if face_processor.has_occlusion(face):
            return RecognitionResponse(
                name=None,
                confidence=0.0,
                is_recognized=False,
                message="Face is occluded (mask/obstruction detected)"
            )
        
        # Get embedding
        embedding = face_processor.get_embedding(face)
        
        # Search in Milvus
        result = milvus_client.search_face(embedding)
        
        if result and result['confidence'] >= 0.65:
            return RecognitionResponse(
                name=result['name'],
                confidence=result['confidence'],
                is_recognized=True,
                message="Face recognized successfully"
            )
        else:
            return RecognitionResponse(
                name=None,
                confidence=result['confidence'] if result else 0.0,
                is_recognized=False,
                message="Unknown face"
            )
            
    except Exception as e:
        logger.error(f"Recognition error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# BATCH RECOGNITION
# ==========================
@app.post("/recognize/batch", response_model=BatchRecognitionResponse)
async def recognize_faces_batch(files: List[UploadFile] = File(...)):
    """
    Recognize multiple faces in batch for optimal GPU utilization
    
    Args:
        files: List of image files containing faces
        
    Returns:
        Batch recognition results with processing time
    """
    import time
    start_time = time.time()
    
    try:
        if len(files) > 32:
            raise HTTPException(
                status_code=400,
                detail="Maximum 32 images per batch"
            )
        
        # Decode all images in parallel
        async def decode_image(file: UploadFile):
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        images = await asyncio.gather(*[decode_image(f) for f in files])
        
        # Filter invalid images
        valid_images = [(i, img) for i, img in enumerate(images) if img is not None]
        
        if not valid_images:
            raise HTTPException(status_code=400, detail="No valid images provided")
        
        indices, valid_imgs = zip(*valid_images)
        
        # Process batch on GPU
        loop = asyncio.get_event_loop()
        batch_results = await loop.run_in_executor(
            executor,
            face_processor.process_images_batch,
            list(valid_imgs),
            True  # check_quality
        )
        
        # Build responses
        results = []
        result_idx = 0
        
        for i in range(len(files)):
            if i not in indices:
                results.append(RecognitionResponse(
                    name=None,
                    confidence=0.0,
                    is_recognized=False,
                    message="Invalid image format"
                ))
            else:
                success, embedding, message = batch_results[result_idx]
                result_idx += 1
                
                if not success:
                    results.append(RecognitionResponse(
                        name=None,
                        confidence=0.0,
                        is_recognized=False,
                        message=message
                    ))
                else:
                    # Search in Milvus
                    result = milvus_client.search_face(embedding)
                    
                    if result and result['confidence'] >= 0.65:
                        results.append(RecognitionResponse(
                            name=result['name'],
                            confidence=result['confidence'],
                            is_recognized=True,
                            message="Face recognized successfully"
                        ))
                    else:
                        results.append(RecognitionResponse(
                            name=None,
                            confidence=result['confidence'] if result else 0.0,
                            is_recognized=False,
                            message="Unknown face"
                        ))
        
        processing_time = (time.time() - start_time) * 1000
        
        return BatchRecognitionResponse(
            results=results,
            processing_time_ms=round(processing_time, 2)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch recognition error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# ENROLLMENT
# ==========================
@app.post("/enroll", response_model=EnrollmentResponse)
async def enroll_person(
    name: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    Enroll a new person with multiple face images (GPU-optimized batch processing)
    
    Args:
        name: Person's name
        files: List of image files (minimum 3, recommended 5)
        
    Returns:
        Enrollment result
    """
    try:
        if len(files) < 3:
            raise HTTPException(
                status_code=400,
                detail="At least 3 images required for enrollment"
            )
        
        # Decode all images in parallel
        async def decode_image(file: UploadFile):
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        images = await asyncio.gather(*[decode_image(f) for f in files])
        valid_images = [img for img in images if img is not None]
        
        if len(valid_images) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Only {len(valid_images)} valid images. Need at least 3."
            )
        
        # Batch process on GPU
        loop = asyncio.get_event_loop()
        batch_results = await loop.run_in_executor(
            executor,
            face_processor.process_images_batch,
            valid_images,
            True  # check_quality
        )
        
        # Extract valid embeddings
        embeddings = []
        for success, embedding, message in batch_results:
            if success:
                embeddings.append(embedding)
        
        if len(embeddings) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Only {len(embeddings)} valid faces found. Need at least 3."
            )
        
        # Compute centroid embedding
        centroid = embedding_manager.compute_centroid(embeddings)
        
        # Store in Milvus
        person_id = milvus_client.insert_face(name, centroid)
        
        logger.info(f"Successfully enrolled {name} with {len(embeddings)} images")
        
        return EnrollmentResponse(
            success=True,
            message=f"Successfully enrolled {name} with {len(embeddings)} images",
            person_id=person_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enrollment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# COLLECTION MANAGEMENT
# ==========================
@app.get("/collection/stats")
async def get_collection_stats():
    """Get statistics about the face collection"""
    try:
        stats = milvus_client.get_stats()
        return JSONResponse(content=stats)
    except Exception as e:
        logger.error(f"Stats error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/person/{person_id}")
async def delete_person(person_id: str):
    """Delete a person from the collection"""
    try:
        success = milvus_client.delete_face(person_id)
        if success:
            return {"success": True, "message": f"Deleted person {person_id}"}
        else:
            raise HTTPException(status_code=404, detail="Person not found")
    except Exception as e:
        logger.error(f"Delete error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# GPU MANAGEMENT
# ==========================
@app.post("/gpu/clear-cache")
async def clear_gpu_cache():
    """Clear GPU cache to free memory"""
    try:
        if face_processor:
            face_processor.clear_gpu_cache()
            return {"success": True, "message": "GPU cache cleared"}
        return {"success": False, "message": "Face processor not initialized"}
    except Exception as e:
        logger.error(f"GPU clear error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/gpu/stats")
async def get_gpu_stats():
    """Get GPU memory statistics"""
    try:
        if face_processor and face_processor.is_gpu_available():
            stats = face_processor.get_gpu_memory_info()
            return JSONResponse(content=stats)
        return {"available": False, "message": "GPU not available"}
    except Exception as e:
        logger.error(f"GPU stats error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# RUN SERVER
# ==========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Set to True for development
        log_level="info"
    )
