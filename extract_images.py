import zipfile
import os

# Define paths
zip_path = 'img_align_celeba.zip'
extract_dir = 'celeba_work'

# Create the output directory if it doesn't exist
os.makedirs(extract_dir, exist_ok=True)

# Extract the zip file
print(f"Extracting {zip_path} to {extract_dir}...")
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)

print("Extraction completed!")
print(f"Files extracted to: {os.path.abspath(extract_dir)}")
