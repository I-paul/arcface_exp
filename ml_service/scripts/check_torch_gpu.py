import torch
import json

print('torch.__version__=', torch.__version__)
print('torch.version.cuda=', torch.version.cuda)
print('cuda_available=', torch.cuda.is_available())

if torch.cuda.is_available():
	print('gpu_name=', torch.cuda.get_device_name(0))
	props = torch.cuda.get_device_properties(0)
	capability = f"{props.major}.{props.minor}"
	print('compute_capability=', capability)

	arch_list = []
	if hasattr(torch.cuda, 'get_arch_list'):
		try:
			arch_list = torch.cuda.get_arch_list()
		except Exception:
			arch_list = []

	print('torch_supported_arches=', json.dumps(arch_list))
else:
	print('gpu_name= None')
	print('compute_capability= None')
	print('torch_supported_arches= []')
