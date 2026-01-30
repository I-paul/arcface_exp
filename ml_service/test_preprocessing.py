"""
Test script for the preprocessing module

Run this to verify the preprocessing pipeline works correctly.
"""
import numpy as np
import cv2
import logging
from preprocessing.schemas import PreprocessRequest
from preprocessing.preprocessor import preprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_test_face():
    """Create a synthetic test face image"""
    # Create a simple test image (112x112 gray face)
    face = np.ones((200, 200, 3), dtype=np.uint8) * 128
    
    # Add some structure (simulated face)
    cv2.circle(face, (75, 80), 15, (255, 255, 255), -1)  # Left eye
    cv2.circle(face, (125, 80), 15, (255, 255, 255), -1)  # Right eye
    cv2.ellipse(face, (100, 120), (30, 20), 0, 0, 180, (255, 255, 255), 2)  # Nose
    cv2.ellipse(face, (100, 150), (25, 10), 0, 0, 180, (255, 255, 255), 2)  # Mouth
    
    return face


def test_basic_preprocessing():
    """Test basic preprocessing with valid input"""
    logger.info("=" * 60)
    logger.info("Test 1: Basic preprocessing with valid face")
    logger.info("=" * 60)
    
    # Create test data
    image = create_test_face()
    bbox = [50, 50, 150, 150]
    landmarks = {
        'left_eye': [75, 80],
        'right_eye': [125, 80],
        'nose': [100, 120],
        'left_mouth': [85, 150],
        'right_mouth': [115, 150],
    }
    
    # Test enrollment mode
    req = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="enroll"
    )
    
    result = preprocess(req)
    
    logger.info(f"Usable: {result.usable}")
    logger.info(f"Reject Reason: {result.reject_reason}")
    logger.info(f"Quality Metrics: {result.quality_metrics}")
    logger.info(f"Flags: {result.flags}")
    
    if result.face_tensor is not None:
        logger.info(f"Tensor shape: {result.face_tensor.shape}")
        logger.info(f"Tensor dtype: {result.face_tensor.dtype}")
        logger.info(f"Tensor range: [{result.face_tensor.min():.3f}, {result.face_tensor.max():.3f}]")
    
    return result.usable


def test_blurry_face():
    """Test preprocessing with blurry face (should reject in enroll mode)"""
    logger.info("\n" + "=" * 60)
    logger.info("Test 2: Blurry face (should reject in enroll mode)")
    logger.info("=" * 60)
    
    # Create blurry face
    image = create_test_face()
    image = cv2.GaussianBlur(image, (15, 15), 0)  # Heavy blur
    
    bbox = [50, 50, 150, 150]
    landmarks = {
        'left_eye': [75, 80],
        'right_eye': [125, 80],
        'nose': [100, 120],
        'left_mouth': [85, 150],
        'right_mouth': [115, 150],
    }
    
    # Test enrollment mode (strict)
    req_enroll = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="enroll"
    )
    
    result_enroll = preprocess(req_enroll)
    logger.info(f"Enroll mode - Usable: {result_enroll.usable}")
    logger.info(f"Enroll mode - Reject Reason: {result_enroll.reject_reason}")
    logger.info(f"Enroll mode - Blur Score: {result_enroll.quality_metrics.get('blur', 0):.2f}")
    
    # Test recognition mode (lenient)
    req_recognize = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="recognize"
    )
    
    result_recognize = preprocess(req_recognize)
    logger.info(f"Recognize mode - Usable: {result_recognize.usable}")
    logger.info(f"Recognize mode - Reject Reason: {result_recognize.reject_reason}")
    logger.info(f"Recognize mode - Blur Score: {result_recognize.quality_metrics.get('blur', 0):.2f}")
    
    return not result_enroll.usable  # Should be rejected in enroll mode


def test_invalid_landmarks():
    """Test preprocessing with invalid landmarks"""
    logger.info("\n" + "=" * 60)
    logger.info("Test 3: Invalid landmarks (should reject)")
    logger.info("=" * 60)
    
    image = create_test_face()
    bbox = [50, 50, 150, 150]
    landmarks = {
        'left_eye': [0, 0],  # Invalid
        'right_eye': [0, 0],  # Invalid
        'nose': [0, 0],
        'left_mouth': [0, 0],
        'right_mouth': [0, 0],
    }
    
    req = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="enroll"
    )
    
    result = preprocess(req)
    
    logger.info(f"Usable: {result.usable}")
    logger.info(f"Reject Reason: {result.reject_reason}")
    
    return not result.usable  # Should be rejected


def test_mode_comparison():
    """Test difference between enroll and recognize modes"""
    logger.info("\n" + "=" * 60)
    logger.info("Test 4: Mode comparison (enroll vs recognize thresholds)")
    logger.info("=" * 60)
    
    # Create slightly blurry face (borderline quality)
    image = create_test_face()
    image = cv2.GaussianBlur(image, (5, 5), 0)
    
    bbox = [50, 50, 150, 150]
    landmarks = {
        'left_eye': [75, 80],
        'right_eye': [125, 80],
        'nose': [100, 120],
        'left_mouth': [85, 150],
        'right_mouth': [115, 150],
    }
    
    # Enroll mode
    req_enroll = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="enroll"
    )
    result_enroll = preprocess(req_enroll)
    
    # Recognize mode
    req_recognize = PreprocessRequest(
        image=image,
        bbox=bbox,
        landmarks=landmarks,
        mode="recognize"
    )
    result_recognize = preprocess(req_recognize)
    
    logger.info(f"Enroll mode:")
    logger.info(f"  Usable: {result_enroll.usable}")
    logger.info(f"  Blur threshold: 100.0")
    logger.info(f"  Blur score: {result_enroll.quality_metrics.get('blur', 0):.2f}")
    
    logger.info(f"Recognize mode:")
    logger.info(f"  Usable: {result_recognize.usable}")
    logger.info(f"  Blur threshold: 80.0")
    logger.info(f"  Blur score: {result_recognize.quality_metrics.get('blur', 0):.2f}")
    
    return True


def main():
    """Run all tests"""
    logger.info("Starting Preprocessing Module Tests")
    logger.info("=" * 60)
    
    tests = [
        ("Basic preprocessing", test_basic_preprocessing),
        ("Blurry face rejection", test_blurry_face),
        ("Invalid landmarks", test_invalid_landmarks),
        ("Mode comparison", test_mode_comparison),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            passed = test_func()
            results.append((test_name, passed))
        except Exception as e:
            logger.error(f"Test '{test_name}' failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("TEST SUMMARY")
    logger.info("=" * 60)
    
    for test_name, passed in results:
        status = "✓ PASSED" if passed else "✗ FAILED"
        logger.info(f"{status}: {test_name}")
    
    total = len(results)
    passed = sum(1 for _, p in results if p)
    logger.info(f"\nTotal: {passed}/{total} tests passed")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
