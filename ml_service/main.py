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
import os

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

# Decision Engine Configuration
ENABLE_TRACK_AGGREGATION = os.getenv("ENABLE_TRACK_AGGREGATION", "True").lower() in ("true", "1")
ENABLE_TEMPORAL_VOTING = os.getenv("ENABLE_TEMPORAL_VOTING", "True").lower() in ("true", "1")
TEMPORAL_VOTING_WINDOW = int(os.getenv("TEMPORAL_VOTING_WINDOW", "5"))
TEMPORAL_VOTING_THRESHOLD = int(os.getenv("TEMPORAL_VOTING_THRESHOLD", "3"))
UNKNOWN_SUPPRESSION_SECONDS = float(os.getenv("UNKNOWN_SUPPRESSION_SECONDS", "1.5"))
RECOGNITION_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.5"))

# Rolling latency stats
LATENCY_STATS = {
    "detection": [],
    "embedding": [],
    "search": [],
    "voting": [],
    "total": []
}

def record_latency(name: str, value_ms: float):
    stats = LATENCY_STATS.get(name)
    if stats is not None:
        stats.append(value_ms)
        if len(stats) > 500:
            stats.pop(0)
        if len(stats) % 50 == 0:  # Log summary every 50 frames
            arr = np.array(stats)
            logger.info(
                f"[LATENCY STATS - {name.upper()}] "
                f"Avg: {np.mean(arr):.1f}ms | "
                f"P95: {np.percentile(arr, 95):.1f}ms | "
                f"Max: {np.max(arr):.1f}ms (over last {len(arr)} frames)"
            )

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

# STARTUP & SHUTDOWN
@app.on_event("startup")
async def startup_event():
    """Initialize ML models and connections on startup"""
    global face_processor, embedding_manager, milvus_client, recognition_pipeline, antispoof_predictor
    
    logger.info("="*60)
    logger.info("Starting ML Service...")
    logger.info("="*60)
    
    try:
        force_gpu = os.getenv("FORCE_GPU", "true").strip().lower() in ("1", "true", "yes", "on")

        # Initialize Face Processor (InsightFace)
        logger.info(f"Initializing Face Processor (FORCE_GPU={force_gpu})...")
        face_processor = FaceProcessor(force_gpu=force_gpu)
        
        if face_processor.is_gpu_available():
            logger.info("GPU ENABLED - Recognition and Enrollment will run on GPU")
        else:
            logger.error("GPU NOT AVAILABLE - Service may not start correctly")
        
        # Initialize Anti-Spoofing Predictor
        logger.info("Initializing Anti-Spoofing Predictor...")
        antispoof_predictor = init_predictor(use_gpu=face_processor.is_gpu_available())
        logger.info("Anti-Spoofing model loaded (MiniFASNet ONNX)")
        
        # Initialize Embedding Manager
        logger.info("Initializing Embedding Manager...")
        embedding_manager = EmbeddingManager()

        # Initialize Recognition Pipeline (tracking + gating + batching)
        logger.info("Initializing Recognition Pipeline...")
        recognition_pipeline = RecognitionPipeline(max_stale_seconds=5.0)
        
        # Initialize Milvus Client
        logger.info("Connecting to Milvus Vector Database...")
        milvus_client = MilvusClient()
        
        logger.info("="*60)
        logger.info("ML Service started successfully!")
        logger.info(f"  - GPU Status: {'ENABLED' if face_processor.is_gpu_available() else 'DISABLED'}")
        logger.info(f"  - Anti-Spoofing: ENABLED")
        logger.info(f"  - Milvus Status: {'CONNECTED' if milvus_client.is_connected() else 'DISCONNECTED'}")
        logger.info("="*60)
        
    except Exception as e:
        logger.error("="*60)
        logger.error(f"Failed to start ML Service: {str(e)}")
        logger.error("="*60)
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down ML Service...")
    if milvus_client:
        milvus_client.disconnect()

# HEALTH & STATUS
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

# ENROLLMENT
@app.post("/enroll", response_model=EnrollmentResponse)
async def enroll_person(
    name: str = Form(...),
    emp_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Enroll a new person with multiple face images
    
    Args:
        name: Person's name
        emp_id: Optional employee ID (if not provided, a unique legacy ID is generated)
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

            # Preprocess + embed (strict enrollment profile)
            result = face_processor.process_for_enrollment(image)
            if not result.get("success"):
                continue
            
            embeddings.append(result["embedding"])
        
        if len(embeddings) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Only {len(embeddings)} valid faces found. Need at least 3."
            )
        
        # Compute centroid embedding
        centroid = embedding_manager.compute_centroid(embeddings)
        
        # Resolve emp_id for version 2 schema compatibility
        resolved_emp_id = emp_id if emp_id else f"legacy_{int(time.time())}"
        
        # Store in Milvus
        person_id = milvus_client.insert_face(emp_id=resolved_emp_id, embedding=centroid, template_version=1)
        
        success_msg = f"Successfully enrolled {name} (emp_id={resolved_emp_id}) with {len(embeddings)} images"
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

@app.post("/re-enroll", response_model=EnrollmentResponse)
async def re_enroll_person(
    emp_id: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    Re-enroll an employee using CCTV crops by generating a versioned centroid template
    
    Args:
        emp_id: Employee ID
        files: List of CCTV face crop files (minimum 3)
        
    Returns:
        Re-enrollment result
    """
    try:
        if len(files) < 3:
            raise HTTPException(
                status_code=400,
                detail="At least 3 images required for re-enrollment"
            )
        
        embeddings = []
        
        for file in files:
            # Read and decode image
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                continue

            # Preprocess + embed (lenient recognition profile for CCTV crops!)
            result = face_processor.process_for_recognition(image)
            if not result.get("success"):
                continue
            
            embeddings.append(result["embedding"])
        
        if len(embeddings) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Only {len(embeddings)} valid faces found after recognition quality checks. Need at least 3."
            )
        
        # Compute centroid embedding
        centroid = embedding_manager.compute_centroid(embeddings)
        
        # Query highest template version currently in Milvus for this emp_id
        current_max_ver = milvus_client.get_max_template_version(emp_id)
        new_ver = current_max_ver + 1
        
        # Store in Milvus (schema v2 keeps existing versions intact, templates are versioned)
        person_id = milvus_client.insert_face(emp_id=emp_id, embedding=centroid, template_version=new_ver)
        
        success_msg = f"Successfully re-enrolled employee {emp_id} with {len(embeddings)} crops. New template version: v{new_ver}"
        logger.info(success_msg)
        
        return EnrollmentResponse(
            success=True,
            message=success_msg,
            person_id=person_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Re-enrollment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# WEBSOCKET FOR STREAMING
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
            try:
                data = await websocket.receive_text()
                logger.debug(f"Received message: {data[:100]}...")
            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error(f"Failed to receive message: {type(e).__name__}: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to receive message"
                    })
                except:
                    pass
                continue
            
            # Parse JSON
            try:
                message = json.loads(data)
            except json.JSONDecodeError as e:
                logger.error(f"JSON parsing error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue
            
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
                    
                    # Check image size (max 10MB base64 = ~7.5MB binary)
                    if len(image_data) > 10 * 1024 * 1024:
                        logger.warning(f"Image too large: {len(image_data)} bytes")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Image too large (max 10MB)"
                        })
                        continue
                    
                    # Remove base64 header if present
                    if "base64," in image_data:
                        image_data = image_data.split("base64,")[1]
                    
                    # Decode image
                    try:
                        image_bytes = base64.b64decode(image_data)
                    except Exception as e:
                        logger.error(f"Base64 decoding error: {e}")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid base64 encoding"
                        })
                        continue
                    
                    nparr = np.frombuffer(image_bytes, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if image is None:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid image format"
                        })
                        continue
                    
                    # Start pipeline latency tracking
                    frame_start_time = time.time()
                    now_ts = frame_start_time
                    session_key = f"ws:{id(websocket)}"

                    # Resolve/Increment Frame ID
                    frame_id = message.get("frame_id")
                    if frame_id is None:
                        if not hasattr(websocket, "_frame_counter"):
                            websocket._frame_counter = 0
                        websocket._frame_counter += 1
                        frame_id = websocket._frame_counter

                    # Detect faces (GPU/CPU)
                    det_start = time.time()
                    faces = face_processor.detect_faces(image)
                    det_time = (time.time() - det_start) * 1000
                    record_latency("detection", det_time)
                    
                    response_faces = []

                    if faces:
                        # Extract raw bboxes for all detected faces
                        all_bboxes = [(f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]) for f in faces]
                        
                        # Update track IDs using SimpleTracker
                        track_ids = recognition_pipeline.update_tracks(session_key, all_bboxes, now=now_ts)

                        for idx, face in enumerate(faces):
                            track_id = track_ids[idx]
                            x1, y1, x2, y2 = map(int, face.bbox)

                            preprocess_result = face_processor.preprocess_face(image, face, mode="recognize")
                            if not preprocess_result.usable:
                                response_faces.append({
                                    "track_id": track_id,
                                    "bbox": [x1, y1, x2, y2],
                                    "label": f"Track-{track_id}",
                                    "confidence": float(face.det_score),
                                    "detected": False,
                                    "person_id": None,
                                    "reject_reason": preprocess_result.reject_reason,
                                })
                                continue

                            embedding = face_processor.get_embedding(face)
                            search_result = milvus_client.search_face(embedding, top_k=1)

                            recognized = False
                            person_id = None
                            confidence = float(face.det_score)
                            if search_result and search_result.get("person_id") is not None:
                                person_id = search_result["person_id"]
                                confidence = float(search_result.get("confidence", confidence))
                                recognized = confidence >= RECOGNITION_THRESHOLD

                            face_result = {
                                "track_id": track_id,
                                "bbox": [x1, y1, x2, y2],
                                "label": f"Track-{track_id}",
                                "confidence": confidence,
                                "detected": recognized,
                                "person_id": person_id if recognized else None,
                                "template_version": search_result.get("template_version") if search_result else None,
                            }

                            response_faces.append(face_result)
                            recognition_pipeline.update_track_result(session_key, track_id, (x1, y1, x2, y2), face_result, now_ts)

                    # Total pipeline latency
                    total_time = (time.time() - frame_start_time) * 1000
                    record_latency("total", total_time)

                    # Return the list of all faces and bounding boxes
                    await websocket.send_json({
                        "type": "result",
                        "frame_id": frame_id,
                        "faces": response_faces
                    })
                
                except WebSocketDisconnect:
                    raise
                except Exception as e:
                    logger.error(f"Recognition error in WebSocket: {str(e)}")
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })
                    except:
                        pass
            
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                logger.warning(f"Unknown message type: {message.get('type')}")
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message.get('type')}"
                })
    
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close()
        except:
            pass

# COLLECTION MANAGEMENT
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

# RUN SERVER
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Set to True for development
        log_level="info"
    )
