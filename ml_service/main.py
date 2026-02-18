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
import traceback
from pathlib import Path

from inference.face_processor import FaceProcessor
from inference.recognition_pipeline import RecognitionPipeline
from embeddings.embedding_manager import EmbeddingManager
from milvus_client.client import MilvusClient
from anti_spoofing.inference import init_predictor, get_predictor, AntiSpoofResult

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
antispoof_predictor = None

# Pydantic models
class LivenessInfo(BaseModel):
    status: str  # "live" or "spoof"
    is_live: bool
    real_score: float
    fake_score: float

class RecognitionResponse(BaseModel):
    name: Optional[str]
    person_id: Optional[str]
    confidence: float
    is_recognized: bool
    message: str
    liveness: Optional[LivenessInfo] = None

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
    global face_processor, embedding_manager, milvus_client, recognition_pipeline, antispoof_predictor
    
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
        
        # Initialize Anti-Spoofing Predictor
        logger.info("Initializing Anti-Spoofing Predictor...")
        antispoof_predictor = init_predictor(use_gpu=True)
        logger.info("✓ Anti-Spoofing model loaded (MiniFASNet ONNX)")
        
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
        logger.info(f"  - Anti-Spoofing: ENABLED")
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
        # Diagnostic snapshot of array-like locals (for pinpointing ambiguous truth-value errors)
        logger.error("DEBUG TYPES SNAPSHOT:")
        for name, val in locals().items():
            if hasattr(val, "shape"):
                logger.error(f"{name}: type={type(val)}, shape={val.shape}")

        # Read and decode image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format")
        
        # Detect faces (GPU)
        faces = face_processor.detect_faces(image)
        
        if not faces:
            return RecognitionResponse(
                name=None,
                confidence=0.0,
                is_recognized=False,
                message="No face detected in image"
            )

        # Preprocess faces (CPU) and keep only usable ones
        usable_faces = []
        usable_bboxes = []

        for f in faces:
            preprocess_result = face_processor.preprocess_face(image, f, mode="recognize")
            if preprocess_result.usable:
                usable_faces.append(f)
                usable_bboxes.append((f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]))

        if not usable_faces:
            return RecognitionResponse(
                name=None,
                confidence=0.0,
                is_recognized=False,
                message="No usable face after preprocessing"
            )

        # Use the largest usable face (track index to avoid equality checks)
        largest_index = None
        largest_area = -1.0
        for i, f in enumerate(usable_faces):
            area = (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
            if area > largest_area:
                largest_area = area
                largest_index = i
        face = usable_faces[largest_index]

        # ========================================
        # ANTI-SPOOFING CHECK (BEFORE EMBEDDING)
        # ========================================
        # Extract aligned face for anti-spoofing
        # InsightFace provides aligned 112x112 face in face.normed_embedding attribute
        # But we need the actual aligned image, so we'll get it from the face object
        try:
            # Get aligned face crop from the largest face
            x1, y1, x2, y2 = map(int, face.bbox)
            face_crop = image[y1:y2, x1:x2]
            
            # Run anti-spoof check
            antispoof_result = antispoof_predictor.predict(face_crop)
            
            liveness_info = LivenessInfo(
                is_live=antispoof_result.is_live,
                real_score=antispoof_result.real_score,
                fake_score=antispoof_result.fake_score
            )
            
            # REJECT if spoof detected
            if not antispoof_result.is_live:
                logger.warning(f"🚫 SPOOF DETECTED - real_score: {antispoof_result.real_score:.3f}, fake_score: {antispoof_result.fake_score:.3f}")
                return RecognitionResponse(
                    name=None,
                    person_id=None,
                    confidence=0.0,
                    is_recognized=False,
                    message="Spoof detected - liveness check failed",
                    liveness=liveness_info
                )
            
            logger.info(f"✅ LIVENESS CHECK PASSED - real_score: {antispoof_result.real_score:.3f}")
            
        except Exception as e:
            logger.error(f"Anti-spoof check failed: {e}")
            # Optionally: fail open or fail closed
            # For now, we'll continue with recognition but log the error
            liveness_info = None
        
        # ========================================
        # EMBEDDING EXTRACTION (ONLY IF LIVE)
        # ========================================

        # Tracking + gating + batching
        now_ts = time.time()
        session_key = session_id or "default"

        track_ids = recognition_pipeline.update_tracks(session_key, usable_bboxes, now=now_ts)

        embeddings_to_search = []
        face_indices = []

        for idx, f in enumerate(usable_faces):
            track = recognition_pipeline.get_track(session_key, track_ids[idx])
            if recognition_pipeline.should_embed(track, usable_bboxes[idx], now_ts):
                embeddings_to_search.append(face_processor.get_embedding(f))
                face_indices.append(idx)

        results = []
        if len(embeddings_to_search) > 0:
            results = milvus_client.search_faces(embeddings_to_search)
            for r_idx, face_idx in enumerate(face_indices):
                recognition_pipeline.update_track_result(
                    session_key,
                    track_ids[face_idx],
                    usable_bboxes[face_idx],
                    results[r_idx] if r_idx < len(results) else None,
                    now_ts
                )

        # Use cached result for largest face if embedding not run
        track_for_largest = recognition_pipeline.get_track(session_key, track_ids[largest_index])
        result = None
        if track_for_largest and track_for_largest.last_result:
            result = track_for_largest.last_result
        elif len(embeddings_to_search) > 0:
            # If embedding ran for largest face but result wasn't cached yet
            if largest_index in face_indices:
                result = results[face_indices.index(largest_index)] if len(results) > 0 else None
        
        if result is not None and result.get('confidence', 0) >= 0.65:
            return RecognitionResponse(
                name=None,
                person_id=result.get('person_id'),
                confidence=float(result.get('confidence', 0)),
                is_recognized=True,
                message="Face recognized successfully",
                liveness=liveness_info
            )
        else:
            return RecognitionResponse(
                name=None,
                person_id=None,
                confidence=float(result.get('confidence', 0)) if result is not None else 0.0,
                is_recognized=False,
                message="Unknown face",
                liveness=liveness_info
            )
            
    except Exception as e:
        logger.error("Recognition crash traceback:\n" + traceback.format_exc())
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
        spoof_count = 0
        
        for file in files:
            # Read and decode image
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                continue

            # Preprocess + embed (strict enrollment profile)
            result = face_processor.process_for_enrollment(image)
            if not result.get("success"):
                continue
            
            # ANTI-SPOOFING CHECK FOR ENROLLMENT
            # Reject any spoofed images during enrollment
            try:
                faces = face_processor.detect_faces(image)
                if faces:
                    largest_face = face_processor.select_largest_face(faces)
                    x1, y1, x2, y2 = map(int, largest_face.bbox)
                    face_crop = image[y1:y2, x1:x2]
                    
                    antispoof_result = antispoof_predictor.predict(face_crop)
                    
                    if not antispoof_result.is_live:
                        logger.warning(f"🚫 Spoof detected in enrollment image - rejecting")
                        spoof_count += 1
                        continue
            except Exception as e:
                logger.error(f"Anti-spoof check failed during enrollment: {e}")
                # For enrollment, we skip images that fail anti-spoof check
                continue
            
            embeddings.append(result["embedding"])
        
        if len(embeddings) < 3:
            rejection_msg = f"Only {len(embeddings)} valid faces found. Need at least 3."
            if spoof_count > 0:
                rejection_msg += f" ({spoof_count} images rejected due to spoof detection)"
            raise HTTPException(
                status_code=400,
                detail=rejection_msg
            )
        
        # Compute centroid embedding
        centroid = embedding_manager.compute_centroid(embeddings)
        
        # Store in Milvus
        person_id = milvus_client.insert_face(centroid)
        
        success_msg = f"Successfully enrolled {name} with {len(embeddings)} images"
        if spoof_count > 0:
            success_msg += f" ({spoof_count} spoofed images rejected)"
        logger.info(success_msg)
        
        return EnrollmentResponse(
            success=True,
            message=success_msg,
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
                    
                    # Detect faces (GPU)
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

                    # Preprocess faces (CPU) and keep only usable ones
                    usable_faces = []
                    usable_bboxes = []

                    for f in faces:
                        preprocess_result = face_processor.preprocess_face(image, f, mode="recognize")
                        if preprocess_result.usable:
                            usable_faces.append(f)
                            usable_bboxes.append((f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]))

                    if not usable_faces:
                        await websocket.send_json({
                            "type": "result",
                            "name": None,
                            "confidence": 0.0,
                            "is_recognized": False,
                            "message": "No usable face after preprocessing"
                        })
                        continue

                    # Use largest usable face (track index to avoid equality checks)
                    largest_index = None
                    largest_area = -1.0
                    for i, f in enumerate(usable_faces):
                        area = (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
                        if area > largest_area:
                            largest_area = area
                            largest_index = i
                    face = usable_faces[largest_index]
                    
                    # ANTI-SPOOFING CHECK (WebSocket)
                    try:
                        x1, y1, x2, y2 = map(int, face.bbox)
                        face_crop = image[y1:y2, x1:x2]
                        antispoof_result = antispoof_predictor.predict(face_crop)
                        
                        if not antispoof_result.is_live:
                            await websocket.send_json({
                                "type": "result",
                                "name": None,
                                "confidence": 0.0,
                                "is_recognized": False,
                                "message": "Spoof detected",
                                "liveness": {
                                    "status": "spoof",
                                    "is_live": False,
                                    "real_score": float(antispoof_result.real_score),
                                    "fake_score": float(antispoof_result.fake_score)
                                }
                            })
                            continue
                    except Exception as e:
                        logger.error(f"Anti-spoof check failed in WebSocket: {e}")
                    
                    # Tracking + gating + batch search
                    now_ts = time.time()
                    session_key = f"ws:{id(websocket)}"

                    track_ids = recognition_pipeline.update_tracks(session_key, usable_bboxes, now=now_ts)

                    embeddings_to_search = []
                    face_indices = []

                    for idx, f in enumerate(usable_faces):
                        track = recognition_pipeline.get_track(session_key, track_ids[idx])
                        if recognition_pipeline.should_embed(track, usable_bboxes[idx], now_ts):
                            embeddings_to_search.append(face_processor.get_embedding(f))
                            face_indices.append(idx)

                    results = []
                    if len(embeddings_to_search) > 0:
                        results = milvus_client.search_faces(embeddings_to_search)
                        for r_idx, face_idx in enumerate(face_indices):
                            recognition_pipeline.update_track_result(
                                session_key,
                                track_ids[face_idx],
                                usable_bboxes[face_idx],
                                results[r_idx] if r_idx < len(results) else None,
                                now_ts
                            )

                    # largest_index already computed above
                    track_for_largest = recognition_pipeline.get_track(session_key, track_ids[largest_index])
                    result = None
                    if track_for_largest and track_for_largest.last_result:
                        result = track_for_largest.last_result
                    elif len(embeddings_to_search) > 0 and largest_index in face_indices:
                        result = results[face_indices.index(largest_index)] if len(results) > 0 else None
                    
                    if result is not None and result.get('confidence', 0) >= 0.65:
                        await websocket.send_json({
                            "type": "result",
                            "name": result.get('name'),
                            "confidence": float(result.get('confidence', 0)),
                            "is_recognized": True,
                            "message": "Face recognized",
                            "liveness": {
                                "status": "live",
                                "is_live": True,
                                "real_score": float(antispoof_result.real_score) if 'antispoof_result' in locals() else 0.0,
                                "fake_score": float(antispoof_result.fake_score) if 'antispoof_result' in locals() else 0.0
                            }
                        })
                    else:
                        await websocket.send_json({
                            "type": "result",
                            "name": None,
                            "confidence": float(result.get('confidence', 0)) if result is not None else 0.0,
                            "is_recognized": False,
                            "message": "Unknown face",
                            "liveness": {
                                "status": "live",
                                "is_live": True,
                                "real_score": float(antispoof_result.real_score) if 'antispoof_result' in locals() else 0.0,
                                "fake_score": float(antispoof_result.fake_score) if 'antispoof_result' in locals() else 0.0
                            }
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
