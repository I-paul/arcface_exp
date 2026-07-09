import onnxruntime as ort
print('onnxruntime version:', ort.__version__)
available = ort.get_available_providers()
print('available providers:', available)

if 'CUDAExecutionProvider' in available:
	so = ort.SessionOptions()
	try:
		# Create a tiny in-memory graph-free session probe by loading anti-spoof model if present.
		# This validates that CUDA EP can initialize, not just appear in available providers.
		import os
		model_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'minifasnet.onnx')
		model_path = os.path.abspath(model_path)
		if os.path.exists(model_path):
			sess = ort.InferenceSession(
				model_path,
				sess_options=so,
				providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
			)
			print('cuda session providers:', sess.get_providers())
		else:
			print('cuda probe skipped: model not found at', model_path)
	except Exception as e:
		print('cuda provider probe failed:', str(e))
else:
	print('CUDAExecutionProvider missing - ONNX GPU is not active')
