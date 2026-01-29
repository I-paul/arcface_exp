"""
ML Service API Entrypoint
Face Recognition and Enrollment Service
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import cv2
import logging
import json
import base64
import time
from pathlib import Path

from inference.face_processor import FaceProcessor
from inference.recognition_pipeline import RecognitionPipeline
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
recognition_pipeline = None

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
    runtime_providers: Optional[dict] = None

# ==========================
# STARTUP & SHUTDOWN
# ==========================
@app.on_event("startup")
async def startup_event():
    """Initialize ML models and connections on startup"""
    global face_processor, embedding_manager, milvus_client, recognition_pipeline
    
    logger.info("="*60)
    logger.info("Starting ML Service...")
    logger.info("="*60)
    
    try:
        # Initialize Face Processor (InsightFace)
        logger.info("Initializing Face Processor with GPU optimization...")
        face_processor = FaceProcessor(force_gpu=True)  # Force GPU for production
        
        if face_processor.is_gpu_available():
            logger.info("✓ GPU ENABLED - Recognition and Enrollment will run on GPU")
        else:
            logger.error("✗ GPU NOT AVAILABLE - Service may not start correctly")
        
        # Initialize Embedding Manager
        logger.info("Initializing Embedding Manager...")
        embedding_manager = EmbeddingManager()

        # Initialize Recognition Pipeline (tracking + gating + batching)
        logger.info("Initializing Recognition Pipeline...")
        recognition_pipeline = RecognitionPipeline()
        
        # Initialize Milvus Client
        logger.info("Connecting to Milvus Vector Database...")
        milvus_client = MilvusClient()
        
        logger.info("="*60)
        logger.info("✓ ML Service started successfully!")
        logger.info(f"  - GPU Status: {'ENABLED' if face_processor.is_gpu_available() else 'DISABLED'}")
        logger.info(f"  - Milvus Status: {'CONNECTED' if milvus_client.is_connected() else 'DISCONNECTED'}")
        logger.info("="*60)
        
    except Exception as e:
        logger.error("="*60)
        logger.error(f"✗ Failed to start ML Service: {str(e)}")
        logger.error("="*60)
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
    """Health check endpoint"""
    return {
        "status": "healthy",
        "gpu_available": face_processor.is_gpu_available() if face_processor else False,
        "milvus_connected": milvus_client.is_connected() if milvus_client else False,
        "runtime_providers": face_processor.get_runtime_providers() if face_processor else None
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
async def recognize_face(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None)
):
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
        
        # Tracking + gating + batching
        now_ts = time.time()
        session_key = session_id or "default"

        bboxes = [(f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]) for f in faces]
        track_ids = recognition_pipeline.update_tracks(session_key, bboxes, now=now_ts)

        embeddings_to_search = []
        face_indices = []

        for idx, f in enumerate(faces):
            track = recognition_pipeline.get_track(session_key, track_ids[idx])
            if recognition_pipeline.should_embed(track, bboxes[idx], now_ts):
                embeddings_to_search.append(face_processor.get_embedding(f))
                face_indices.append(idx)

        results = []
        if embeddings_to_search:
            results = milvus_client.search_faces(embeddings_to_search)
            for r_idx, face_idx in enumerate(face_indices):
                recognition_pipeline.update_track_result(
                    session_key,
                    track_ids[face_idx],
                    bboxes[face_idx],
                    results[r_idx] if r_idx < len(results) else None,
                    now_ts
                )

        # Use cached result for largest face if embedding not run
        largest_index = faces.index(face)
        track_for_largest = recognition_pipeline.get_track(session_key, track_ids[largest_index])
        result = None
        if track_for_largest and track_for_largest.last_result:
            result = track_for_largest.last_result
        elif embeddings_to_search:
            # If embedding ran for largest face but result wasn't cached yet
            if largest_index in face_indices:
                result = results[face_indices.index(largest_index)] if results else None
        
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
# ENROLLMENT
# ==========================
@app.post("/enroll", response_model=EnrollmentResponse)
async def enroll_person(
    name: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    Enroll a new person with multiple face images
    
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
        
        embeddings = []
        
        for file in files:
            # Read and decode image
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                continue
            
            # Process face
            faces = face_processor.detect_faces(image)
            
            if not faces:
                continue
            
            face = face_processor.select_largest_face(faces)
            
            # Check quality
            if face_processor.has_occlusion(face):
                continue
            
            # Get embedding
            embedding = face_processor.get_embedding(face)
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
# WEBSOCKET FOR STREAMING
# ==========================
@app.websocket("/ws/recognize")
async def websocket_recognize(websocket: WebSocket):
    """
    WebSocket endpoint for real-time face recognition streaming
    Receives base64 encoded images and returns recognition results
    """
    await websocket.accept()
    logger.info(f"WebSocket client connected")
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "recognize":
                try:
                    # Decode base64 image
                    image_data = message.get("image", "")
                    if not image_data:
                        await websocket.send_json({
                            "type": "error",
                            "message": "No image data provided"
                        })
                        continue
                    
                    # Remove base64 header if present
                    if "base64," in image_data:
                        image_data = image_data.split("base64,")[1]
                    
                    # Decode image
                    image_bytes = base64.b64decode(image_data)
                    nparr = np.frombuffer(image_bytes, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if image is None:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid image format"
                        })
                        continue
                    
                    # Process face (GPU accelerated)
                    faces = face_processor.detect_faces(image)
                    
                    if not faces:
                        await websocket.send_json({
                            "type": "result",
                            "name": None,
                            "confidence": 0.0,
                            "is_recognized": False,
                            "message": "No face detected"
                        })
                        continue
                    
                    # Use largest face
                    face = face_processor.select_largest_face(faces)
                    
                    # Check occlusion
                    if face_processor.has_occlusion(face):
                        await websocket.send_json({
                            "type": "result",
                            "name": None,
                            "confidence": 0.0,
                            "is_recognized": False,
                            "message": "Face is occluded"
                        })
                        continue
                    
                    # Tracking + gating + batch search
                    now_ts = time.time()
                    session_key = f"ws:{id(websocket)}"

                    bboxes = [(f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]) for f in faces]
                    track_ids = recognition_pipeline.update_tracks(session_key, bboxes, now=now_ts)

                    embeddings_to_search = []
                    face_indices = []

                    for idx, f in enumerate(faces):
                        track = recognition_pipeline.get_track(session_key, track_ids[idx])
                        if recognition_pipeline.should_embed(track, bboxes[idx], now_ts):
                            embeddings_to_search.append(face_processor.get_embedding(f))
                            face_indices.append(idx)

                    results = []
                    if embeddings_to_search:
                        results = milvus_client.search_faces(embeddings_to_search)
                        for r_idx, face_idx in enumerate(face_indices):
                            recognition_pipeline.update_track_result(
                                session_key,
                                track_ids[face_idx],
                                bboxes[face_idx],
                                results[r_idx] if r_idx < len(results) else None,
                                now_ts
                            )

                    largest_index = faces.index(face)
                    track_for_largest = recognition_pipeline.get_track(session_key, track_ids[largest_index])
                    result = None
                    if track_for_largest and track_for_largest.last_result:
                        result = track_for_largest.last_result
                    elif embeddings_to_search and largest_index in face_indices:
                        result = results[face_indices.index(largest_index)] if results else None
                    
                    if result and result['confidence'] >= 0.65:
                        await websocket.send_json({
                            "type": "result",
                            "name": result['name'],
                            "confidence": float(result['confidence']),
                            "is_recognized": True,
                            "message": "Face recognized"
                        })
                    else:
                        await websocket.send_json({
                            "type": "result",
                            "name": None,
                            "confidence": float(result['confidence']) if result else 0.0,
                            "is_recognized": False,
                            "message": "Unknown face"
                        })
                
                except Exception as e:
                    logger.error(f"Recognition error in WebSocket: {str(e)}")
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close()
        except:
            pass

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
