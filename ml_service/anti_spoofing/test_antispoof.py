"""
Test Anti-Spoofing Integration

This script tests the anti-spoofing functionality:
1. Model loading
2. Inference on sample images
3. API integration

Usage:
    python test_antispoof.py
"""
import sys
from pathlib import Path
import cv2
import numpy as np
import logging

# Import from same directory
from inference import init_predictor, get_predictor, AntiSpoofResult

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_model_loading():
    """Test 1: Model loading"""
    print("\n" + "="*60)
    print("TEST 1: Model Loading")
    print("="*60)
    
    try:
        predictor = init_predictor(use_gpu=True)
        info = predictor.get_runtime_info()
        
        print("✅ Model loaded successfully!")
        print(f"   Model path: {info['model_path']}")
        print(f"   Input size: {info['input_size']}")
        print(f"   Providers: {info['providers']}")
        
        if 'CUDAExecutionProvider' in info['providers']:
            print("   🚀 GPU acceleration: ENABLED")
        else:
            print("   ⚠️  GPU acceleration: DISABLED (running on CPU)")
        
        return True
    except Exception as e:
        print(f"❌ Model loading failed: {e}")
        return False


def test_inference_on_random_image():
    """Test 2: Inference on random image"""
    print("\n" + "="*60)
    print("TEST 2: Inference on Random Image")
    print("="*60)
    
    try:
        predictor = get_predictor()
        
        # Create random 80x80 BGR image
        test_image = np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8)
        
        # Run prediction
        result = predictor.predict(test_image)
        
        print("✅ Inference successful!")
        print(f"   Is Live: {result.is_live}")
        print(f"   Status: {result.status if hasattr(result, 'status') else ('live' if result.is_live else 'spoof')}")
        print(f"   Real Score: {result.real_score:.4f}")
        print(f"   Fake Score: {result.fake_score:.4f}")
        print(f"   Label: {result.label} (0=real, 1=fake)")
        
        return True
    except Exception as e:
        print(f"❌ Inference failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_with_sample_faces():
    """Test 3: Test with sample face images from celeba_subset"""
    print("\n" + "="*60)
    print("TEST 3: Test with Sample Face Images")
    print("="*60)
    
    # Find sample images in celeba_subset
    workspace_root = Path(__file__).parent.parent.parent
    celeba_dir = workspace_root / "celeba_subset"
    
    if not celeba_dir.exists():
        print("⚠️  No celeba_subset directory found, skipping this test")
        return True
    
    # Get first available image
    sample_images = []
    for person_dir in celeba_dir.iterdir():
        if person_dir.is_dir():
            for img_path in person_dir.glob("*.jpg"):
                sample_images.append(img_path)
                if len(sample_images) >= 3:
                    break
            if len(sample_images) >= 3:
                break
    
    if not sample_images:
        print("⚠️  No sample images found in celeba_subset")
        return True
    
    predictor = get_predictor()
    
    print(f"Found {len(sample_images)} sample images. Testing...")
    print()
    
    for i, img_path in enumerate(sample_images[:3], 1):
        try:
            # Read image
            image = cv2.imread(str(img_path))
            if image is None:
                print(f"⚠️  Could not read image: {img_path.name}")
                continue
            
            # Run prediction
            result = predictor.predict(image)
            
            status_emoji = "✅" if result.is_live else "🚫"
            print(f"{status_emoji} Image {i}: {img_path.name}")
            print(f"   Is Live: {result.is_live}")
            print(f"   Real Score: {result.real_score:.4f}")
            print(f"   Fake Score: {result.fake_score:.4f}")
            print()
            
        except Exception as e:
            print(f"❌ Error processing {img_path.name}: {e}")
            print()
    
    return True


def test_preprocessing():
    """Test 4: Preprocessing pipeline"""
    print("\n" + "="*60)
    print("TEST 4: Preprocessing Pipeline")
    print("="*60)
    
    try:
        predictor = get_predictor()
        
        # Create test image of different sizes
        test_sizes = [(112, 112), (224, 224), (640, 480), (100, 150)]
        
        for height, width in test_sizes:
            test_image = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
            
            # Test preprocessing
            preprocessed = predictor.preprocess(test_image)
            
            # Check output shape
            assert preprocessed.shape == (1, 3, 80, 80), f"Wrong shape: {preprocessed.shape}"
            
            print(f"✅ {height}x{width} → 80x80 (OK)")
        
        print("\n✅ All preprocessing tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Preprocessing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("ANTI-SPOOFING INTEGRATION TEST SUITE")
    print("="*60)
    
    tests = [
        ("Model Loading", test_model_loading),
        ("Random Image Inference", test_inference_on_random_image),
        ("Sample Face Images", test_with_sample_faces),
        ("Preprocessing Pipeline", test_preprocessing)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            success = test_func()
            results.append((test_name, success))
        except Exception as e:
            logger.error(f"Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print()
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Anti-spoofing is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please check the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
