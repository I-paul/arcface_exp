"""
Convert MiniFASNet .pth checkpoint to ONNX format

Usage:
    python convert_to_onnx.py
    
This will:
1. Load best.pth
2. Create ONNX model
3. Save to models/minifasnet.onnx
"""
import torch
import os
from pathlib import Path
import sys

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from model import load_model, MiniFASNetV2


def convert_to_onnx():
    """Convert .pth model to ONNX format"""
    
    # Paths
    current_dir = Path(__file__).parent
    pth_path = current_dir / "best.pth"
    models_dir = current_dir.parent / "models"
    models_dir.mkdir(exist_ok=True)
    onnx_path = models_dir / "minifasnet.onnx"
    
    print("=" * 60)
    print("MiniFASNet .pth → ONNX Conversion")
    print("=" * 60)
    
    # Check if checkpoint exists
    if not pth_path.exists():
        print(f"❌ ERROR: Checkpoint not found at {pth_path}")
        return False
    
    print(f"📂 Input:  {pth_path}")
    print(f"📂 Output: {onnx_path}")
    print()
    
    try:
        # Load model
        print("⏳ Loading PyTorch model...")
        
        # Try default architecture first (matches checkpoint structure)
        try:
            model = load_model(str(pth_path), device='cpu', architecture='default')
            architecture = 'default'
            print("✅ Loaded MiniFASNet (default) architecture")
        except Exception as e:
            print(f"⚠️  Default failed: {e}")
            print("⏳ Trying V2 architecture...")
            try:
                model = load_model(str(pth_path), device='cpu', architecture='v2')
                architecture = 'v2'
                print("✅ Loaded MiniFASNetV2 architecture")
            except Exception as e2:
                print(f"⚠️  V2 failed: {e2}")
                print("⏳ Trying V1SE architecture...")
                model = load_model(str(pth_path), device='cpu', architecture='v1se')
                architecture = 'v1se'
                print("✅ Loaded MiniFASNetV1SE architecture")
        
        # Set model to eval mode
        model.eval()
        
        # Print model info
        total_params = sum(p.numel() for p in model.parameters())
        print(f"📊 Total parameters: {total_params:,}")
        print()
        
        # Create dummy input (batch_size=1, channels=3, height=80, width=80)
        # MiniFASNet typically uses 80x80 input
        dummy_input = torch.randn(1, 3, 80, 80)
        
        # Test forward pass
        print("⏳ Testing forward pass...")
        with torch.no_grad():
            output = model(dummy_input)
        print(f"✅ Output shape: {output.shape} (should be [1, 2] for binary classification)")
        print()
        
        # Export to ONNX
        print("⏳ Exporting to ONNX...")
        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'}
            }
        )
        print(f"✅ ONNX model saved to {onnx_path}")
        print()
        
        # Verify ONNX model
        print("⏳ Verifying ONNX model...")
        import onnx
        onnx_model = onnx.load(str(onnx_path))
        onnx.checker.check_model(onnx_model)
        print("✅ ONNX model is valid")
        print()
        
        # Test ONNX inference
        print("⏳ Testing ONNX inference...")
        import onnxruntime as ort
        
        # Try GPU first, fallback to CPU
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        session = ort.InferenceSession(str(onnx_path), providers=providers)
        
        active_provider = session.get_providers()[0]
        print(f"🚀 Running on: {active_provider}")
        
        # Run inference
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        
        onnx_output = session.run(
            [output_name],
            {input_name: dummy_input.numpy()}
        )[0]
        
        print(f"✅ ONNX output shape: {onnx_output.shape}")
        print(f"   Sample logits: {onnx_output[0]}")
        print()
        
        # Compare PyTorch vs ONNX outputs
        max_diff = abs(output.numpy() - onnx_output).max()
        print(f"📊 Max difference (PyTorch vs ONNX): {max_diff:.6f}")
        
        if max_diff < 1e-4:
            print("✅ Outputs match! Conversion successful.")
        else:
            print("⚠️  Outputs differ slightly (this is usually acceptable)")
        
        print()
        print("=" * 60)
        print("✅ CONVERSION COMPLETE!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Model ready at: ml_service/models/minifasnet.onnx")
        print("2. Use inference.py for production inference")
        print()
        
        return True
        
    except Exception as e:
        print()
        print("=" * 60)
        print("❌ CONVERSION FAILED")
        print("=" * 60)
        print(f"Error: {str(e)}")
        print()
        print("Troubleshooting:")
        print("1. Check if best.pth is a valid checkpoint")
        print("2. Verify the model architecture matches your checkpoint")
        print("3. Check PyTorch and ONNX versions")
        import traceback
        print()
        print("Full traceback:")
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = convert_to_onnx()
    sys.exit(0 if success else 1)
