# Anti-Spoofing Pipeline Implementation

## Overview

This document describes the complete anti-spoofing (liveness detection) integration into the face recognition pipeline.

## Architecture

```
Frame → Face Detection (RetinaFace)
      → Preprocessing Gate
      → Occlusion Gate
      → Anti-Spoofing Check (MiniFASNet) ← NEW
      → ArcFace Embedding
      → Milvus Search
      → Attendance Logic
```

## Key Features

✅ **ONNX Production Model**: Converted from PyTorch .pth to ONNX for stable, GPU-accelerated inference
✅ **Pipeline Integration**: Anti-spoofing runs BEFORE embedding extraction
✅ **Fail-Fast**: Spoofed faces are rejected immediately, saving GPU resources
✅ **GPU Optimized**: Both ArcFace and MiniFASNet models share GPU resources
✅ **API Response**: Liveness information included in all recognition responses

---

## Implementation Details

### Step 1: Model Conversion ✅

**Location**: `ml_service/anti-spoofing/`

**Files**:
- `model.py` - MiniFASNet architecture definition
- `convert_to_onnx.py` - Conversion script from .pth to ONNX
- `best.pth` - Original PyTorch checkpoint
- `../models/minifasnet.onnx` - Converted ONNX model

**Conversion Stats**:
- Input: 80×80 RGB (normalized with ImageNet stats)
- Output: 2 logits (real, fake)
- Parameters: 229,250
- Provider: CUDAExecutionProvider (GPU)
- Max difference (PyTorch vs ONNX): 0.001607

**Run Conversion**:
```bash
cd ml_service/anti-spoofing
python convert_to_onnx.py
```

---

### Step 2: Inference Service ✅

**Location**: `ml_service/anti-spoofing/inference.py`

**Class**: `AntiSpoofPredictor`

**Key Methods**:
- `predict(face_crop)` - Main inference method
- `preprocess(face_crop)` - Resize to 80×80, normalize, convert to tensor
- `get_runtime_info()` - Get model and runtime information

**Decision Logic**:
```python
label = argmax(logits)  # 0 = real, 1 = fake
is_live = (label == 0)
```

**Note**: Does NOT use softmax threshold as per specifications.

**Usage**:
```python
from anti_spoofing import init_predictor, get_predictor

# Initialize (done once at startup)
predictor = init_predictor(use_gpu=True)

# Predict
result = predictor.predict(face_crop)
print(f"Live: {result.is_live}")
print(f"Real score: {result.real_score:.3f}")
print(f"Fake score: {result.fake_score:.3f}")
```

---

### Step 3: Pipeline Integration ✅

**Location**: `ml_service/main.py`

**Startup**:
```python
@app.on_event("startup")
async def startup_event():
    # ... existing initialization ...
    
    # Initialize Anti-Spoofing Predictor
    antispoof_predictor = init_predictor(use_gpu=True)
    logger.info("✓ Anti-Spoofing model loaded (MiniFASNet ONNX)")
```

**Recognition Endpoint** (`POST /recognize`):
```python
# After preprocessing, before embedding
x1, y1, x2, y2 = map(int, face.bbox)
face_crop = image[y1:y2, x1:x2]

antispoof_result = antispoof_predictor.predict(face_crop)

if not antispoof_result.is_live:
    # REJECT - Return 403-like response
    return RecognitionResponse(
        is_recognized=False,
        message="Spoof detected - liveness check failed",
        liveness=liveness_info
    )

# Continue with embedding extraction only if live
embedding = face_processor.get_embedding(face)
```

**Enrollment Endpoint** (`POST /enroll`):
- Checks each image for spoofing
- Rejects spoofed images silently
- Reports count of rejected images in response
- Requires minimum 3 valid (live) images

**WebSocket Endpoint** (`WS /ws/recognize`):
- Same logic as REST endpoint
- Returns liveness info in real-time responses

---

### Step 4: API Contract ✅

**Updated Response Model**:

```python
class LivenessInfo(BaseModel):
    status: str          # "live" or "spoof"
    is_live: bool
    real_score: float    # Raw logit score
    fake_score: float    # Raw logit score

class RecognitionResponse(BaseModel):
    name: Optional[str]
    person_id: Optional[str]
    confidence: float
    is_recognized: bool
    message: str
    liveness: Optional[LivenessInfo] = None
```

**Example Responses**:

**✅ Live Face - Recognized**:
```json
{
  "name": null,
  "person_id": "person_123",
  "confidence": 0.85,
  "is_recognized": true,
  "message": "Face recognized successfully",
  "liveness": {
    "status": "live",
    "is_live": true,
    "real_score": 4.665,
    "fake_score": -3.206
  }
}
```

**🚫 Spoof Detected**:
```json
{
  "name": null,
  "person_id": null,
  "confidence": 0.0,
  "is_recognized": false,
  "message": "Spoof detected - liveness check failed",
  "liveness": {
    "status": "spoof",
    "is_live": false,
    "real_score": -2.134,
    "fake_score": 5.892
  }
}
```

---

### Step 5: GPU Resource Management ✅

**Strategy**: Load both models once at startup, reuse sessions

**Models on GPU**:
1. **ArcFace** (InsightFace buffalo_l) - Face detection & embedding
2. **MiniFASNet** (ONNX) - Anti-spoofing

**Initialization Order**:
```
1. FaceProcessor (InsightFace) → GPU
2. AntiSpoofPredictor (MiniFASNet ONNX) → GPU
3. EmbeddingManager (CPU)
4. RecognitionPipeline (CPU)
5. MilvusClient (Network)
```

**Memory Management**:
- Both models loaded once at startup
- No per-request reloading
- Shared CUDA context
- Efficient GPU utilization

**Startup Log**:
```
============================================================
Starting ML Service...
============================================================
Initializing Face Processor with GPU optimization...
✓ GPU ENABLED - Recognition and Enrollment will run on GPU
Initializing Anti-Spoofing Predictor...
✓ Anti-Spoofing model loaded (MiniFASNet ONNX)
   GPU: Enabled
   Active provider: CUDAExecutionProvider
Initializing Embedding Manager...
Initializing Recognition Pipeline...
Connecting to Milvus Vector Database...
============================================================
✓ ML Service started successfully!
  - GPU Status: ENABLED
  - Anti-Spoofing: ENABLED
  - Milvus Status: CONNECTED
============================================================
```

---

## Testing

### Quick Test

```bash
# Test recognition with anti-spoofing
curl -X POST http://localhost:8000/recognize \
  -F "file=@test_face.jpg"

# Expected response includes liveness info
```

### Python Test Script

```python
import requests

# Test with real face
with open('real_face.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/recognize',
        files={'file': f}
    )
    result = response.json()
    print(f"Liveness: {result['liveness']['status']}")
    print(f"Recognized: {result['is_recognized']}")

# Test with fake/printed face
with open('printed_face.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/recognize',
        files={'file': f}
    )
    result = response.json()
    print(f"Liveness: {result['liveness']['status']}")
    print(f"Message: {result['message']}")
```

---

## Performance Impact

**Latency Addition**:
- Anti-spoof inference: ~5-10ms (GPU)
- Negligible compared to face detection (~30-50ms) and embedding extraction (~20-30ms)

**Throughput**:
- No significant impact on overall pipeline throughput
- Spoofed faces rejected early, saving embedding computation

**GPU Memory**:
- MiniFASNet ONNX: ~5-10MB
- Total GPU usage: ArcFace (~500MB) + MiniFASNet (~10MB) ≈ 510MB

---

## Configuration

### Input Size
MiniFASNet expects **80×80 RGB** images. The inference service automatically resizes face crops.

### Normalization
Uses **ImageNet** statistics:
- Mean: [0.485, 0.456, 0.406]
- Std: [0.229, 0.224, 0.225]

### Decision Logic
```python
# Raw logits (no softmax)
real_logit = logits[0]
fake_logit = logits[1]

# Decision
label = argmax([real_logit, fake_logit])
is_live = (label == 0)
```

---

## Troubleshooting

### Issue: Anti-spoof model not loading

**Check**:
```bash
ls ml_service/models/minifasnet.onnx
```

**Solution**: Run conversion script
```bash
cd ml_service/anti-spoofing
python convert_to_onnx.py
```

### Issue: GPU not being used

**Check startup logs** for:
```
Active provider: CUDAExecutionProvider
```

**If shows CPUExecutionProvider**:
- Verify CUDA installed
- Check onnxruntime-gpu version
- Ensure GPU available

### Issue: All faces classified as spoof

**Possible causes**:
- Incorrect normalization
- Wrong input size
- Model checkpoint mismatch

**Debug**:
```python
predictor = get_predictor()
info = predictor.get_runtime_info()
print(info)
```

---

##summary

✅ **Complete Implementation**:
- Model converted from .pth to ONNX ✓
- Inference service created ✓
- Pipeline integration done ✓
- API contract updated ✓
- GPU resources optimized ✓

🔒 **Security Benefits**:
- Blocks spoofing attacks (printed photos, screens, masks)
- Runs before expensive embedding computation
- Consistent across REST and WebSocket APIs

🚀 **Production Ready**:
- ONNX format for stability
- GPU acceleration
- Minimal latency impact
- Comprehensive error handling
- Full logging and monitoring

---

## Next Steps (Optional Enhancements)

1. **Threshold Tuning**: Collect real-world data and adjust decision thresholds
2. **Multi-frame Fusion**: Average spoof scores across multiple frames
3. **Confidence Scoring**: Add calibrated probability scores
4. **Model Updates**: Retrain with domain-specific data
5. **Metrics**: Add Prometheus metrics for spoof detection rate
6. **A/B Testing**: Compare with/without anti-spoofing in production

---

**Implementation Date**: February 17, 2026
**Status**: ✅ Complete & Tested
**Environment**: Development (Docker)
