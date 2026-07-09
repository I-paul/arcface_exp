FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Install Python, build tools, and system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    cmake \
    git \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt && \
    (pip3 uninstall -y onnxruntime || true) && \
    pip3 install --no-cache-dir onnxruntime-gpu==1.17.1

# Copy application code
COPY . .

# Expose API port
EXPOSE 8000

# Run the application
CMD ["python3", "main.py"]
