# Face Preprocessing Module - Quick Reference

##  Import

```python
from preprocessing import preprocess, PreprocessRequest, PreprocessResponse
```

## 🚀 Basic Usage

```python
# Create request
req = PreprocessRequest(
    image=frame,              # numpy array (H, W, 3) BGR
    bbox=[x1, y1, x2, y2],   # face bounding box
    landmarks={
        'left_eye': [x, y],
        'right_eye': [x, y],
        'nose': [x, y],
        'left_mouth': [x, y],
        'right_mouth': [x, y],
    },
    mode="recognize"  # or "enroll"
)

# Process
result = preprocess(req)

# Check result
if result.usable:
    tensor = result.face_tensor  # Shape: (1, 3, 112, 112)
    # Ready for embedding model
else:
    print(f"Rejected: {result.reject_reason}")
```

## 🎯 Modes

| Mode | Blur Min | Purpose | Use Case |
|------|----------|---------|----------|
| `enroll` | 100.0 | Strict quality | Adding to database |
| `recognize` | 80.0 | Lenient quality | Real-time matching |

## ❌ Reject Reasons

```python
BLUR_TOO_HIGH        # Image is blurry
POSE_OUT_OF_RANGE    # Face not frontal
FACE_TOO_SMALL       # Face too small
LOW_BRIGHTNESS       # Too dark
HIGH_BRIGHTNESS      # Overexposed
ALIGNMENT_FAILED     # Can't align landmarks
INVALID_LANDMARKS    # Bad landmark data
```

## 📊 Response Structure

```python
PreprocessResponse(
    usable=True,               # bool
    face_tensor=np.ndarray,    # (1, 3, 112, 112) or None
    quality_metrics={
        "blur": 125.3,         # Laplacian variance
        "brightness": 142.5,   # Mean brightness (0-255)
    },
    flags={
        "aligned": True,       # Alignment successful
        "clahe": True,         # CLAHE applied
        "normalized": True,    # Tensor normalized
    },
    reject_reason=None         # str or None
)
```

## 🔧 Configuration

Edit `preprocessing/config.py`:

```python
PROFILES = {
    "enroll": {
        "blur_min": 100.0,         # Increase for stricter
        "pose_max": 20.0,          # Decrease for frontal only
        "brightness_min": 30.0,
        "brightness_max": 225.0,
        "face_min_size": 50,
    },
    "recognize": {
        # More lenient...
    }
}
```

## 🧪 Testing

```bash
cd ml_service
python test_preprocessing.py
```

## 🔗 Integration with FaceProcessor

```python
from inference.face_processor import FaceProcessor

processor = FaceProcessor()

# Enrollment
result = processor.process_for_enrollment(image)

# Recognition
result = processor.process_for_recognition(image)

if result["success"]:
    embedding = result["embedding"]
    quality = result["quality_metrics"]
```

## ⚡ Performance

- Alignment: ~5ms
- Quality checks: ~3ms
- Enhancement: ~8ms
- Normalization: ~2ms
- **Total: ~18ms** (CPU-only)

## 📁 Module Structure

```
preprocessing/
├── __init__.py         # Public API
├── schemas.py          # PreprocessRequest/Response
├── config.py           # Profiles & thresholds
├── preprocessor.py     # Main pipeline
├── aligner.py          # Geometric transform
├── quality.py          # Quality gates
├── photometric.py      # Enhancements
├── normalizer.py       # Model formatting
└── errors.py           # Reject reasons
```

## 💡 Tips

1. **Strict enrollment, lenient recognition** - Better user experience
2. **Log reject reasons** - Identify quality issues
3. **Monitor quality metrics** - Optimize thresholds
4. **Test with real data** - Synthetic tests are just the start
5. **Profile performance** - Ensure <20ms preprocessing time

## 🐛 Common Issues

### Face rejected with BLUR_TOO_HIGH
- Lower `blur_min` in config
- Check camera quality
- Improve lighting

### Face rejected with ALIGNMENT_FAILED
- Check landmark detection
- Verify InsightFace model
- Ensure face is visible

### Low brightness rejection
- Adjust `brightness_min` threshold
- Add lighting guidance in UI
- Use adaptive brightness enhancement

## 📚 Documentation

- Full docs: `preprocessing/README.md`
- Implementation summary: `PREPROCESSING_IMPLEMENTATION.md`
- Test suite: `test_preprocessing.py`

---

**Version**: 1.0.0
**Status**: Production Ready ✅
