import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import CameraStream from './CameraStream';
import RecognitionResult from './RecognitionResult';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const DEFAULT_RECOGNITION_INTERVAL = 1500; // ms

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function MultiCamRecognition() {
  // Socket and connection state
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [mlServiceStatus, setMlServiceStatus] = useState(null);

  // Camera and recognition state
  const [cameras, setCameras] = useState([]);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [recognitionResults, setRecognitionResults] = useState({}); // { cameraId: result }
  const [error, setError] = useState('');

  // References for streaming
  const videoRefs = useRef({});
  const imgRefs = useRef({});
  const timerRefs = useRef({});
  const streamsRef = useRef({});
  const inFlightRef = useRef({});

  // Initialize Socket.IO connection
  useEffect(() => {
    const socketInstance = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setError('');
      socketInstance.emit('check-ml-service');
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to server');
      setIsConnected(false);
    });

    // Listen for recognition results with camera ID
    socketInstance.on('recognition-result', (data) => {
      const { camera_id, name, confidence, is_recognized, message } = data;
      setRecognitionResults((prev) => ({
        ...prev,
        [camera_id]: {
          name,
          confidence,
          is_recognized,
          message,
          timestamp: new Date().toLocaleTimeString(),
          status: 'success'
        }
      }));
    });

    // Listen for recognition errors
    socketInstance.on('recognition-error', (data) => {
      const { camera_id, message } = data;
      setRecognitionResults((prev) => ({
        ...prev,
        [camera_id]: {
          message,
          timestamp: new Date().toLocaleTimeString(),
          status: 'error'
        }
      }));
    });

    // Listen for ML service status
    socketInstance.on('ml-service-status', (data) => {
      setMlServiceStatus(data);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  // Enumerate available cameras on mount
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
      } catch (err) {
        setError('Unable to enumerate cameras. Check permissions.');
      }
    };

    loadDevices();

    return () => {
      // Cleanup all streams on unmount
      stopAllCameras();
    };
  }, []);

  const availableDeviceOptions = useMemo(() => {
    return availableDevices.map((d, idx) => ({
      id: d.deviceId,
      label: d.label || `Camera ${idx + 1}`
    }));
  }, [availableDevices]);

  // Add a new local camera
  const addLocalCamera = useCallback(() => {
    if (availableDeviceOptions.length === 0) {
      setError('No local cameras found.');
      return;
    }
    const firstDevice = availableDeviceOptions[0];
    const newCamera = {
      id: generateId(),
      type: 'local',
      deviceId: firstDevice.id,
      label: firstDevice.label,
      isRunning: false,
      intervalMs: DEFAULT_RECOGNITION_INTERVAL
    };
    setCameras((prev) => [...prev, newCamera]);
    setError('');
  }, [availableDeviceOptions]);

  // Add a new IP camera
  const addIpCamera = useCallback(() => {
    const newCamera = {
      id: generateId(),
      type: 'ip',
      ipUrl: 'http://10.1.31.201:8080/video',
      label: 'IP Camera',
      isRunning: false,
      intervalMs: DEFAULT_RECOGNITION_INTERVAL
    };
    setCameras((prev) => [...prev, newCamera]);
    setError('');
  }, []);

  // Update camera configuration
  const updateCamera = useCallback((cameraId, updates) => {
    setCameras((prev) =>
      prev.map((cam) =>
        cam.id === cameraId ? { ...cam, ...updates } : cam
      )
    );
  }, []);

  // Remove camera
  const removeCamera = useCallback((cameraId) => {
    stopCamera(cameraId);
    setCameras((prev) => prev.filter((cam) => cam.id !== cameraId));
    setRecognitionResults((prev) => {
      const updated = { ...prev };
      delete updated[cameraId];
      return updated;
    });
  }, []);

  // Capture frame from video element
  const captureFromVideo = (videoEl) => {
    if (!videoEl || !videoEl.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    return canvas;
  };

  // Capture frame from image element (IP camera)
  const captureFromImage = (imgEl) => {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas;
  };

  // Send frame for recognition
  const sendFrameForRecognition = useCallback(async (camera) => {
    if (!socket || inFlightRef.current[camera.id]) return;

    inFlightRef.current[camera.id] = true;

    try {
      let canvas;
      if (camera.type === 'local') {
        const videoEl = videoRefs.current[camera.id];
        canvas = captureFromVideo(videoEl);
      } else {
        const imgEl = imgRefs.current[camera.id];
        canvas = captureFromImage(imgEl);
      }

      if (!canvas) return;

      // Convert canvas to blob
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      
      // Emit recognition request with camera ID
      socket.emit('recognize-face', {
        image: imageData,
        camera_id: camera.id
      });

    } catch (err) {
      console.error('Error sending frame:', err);
      setRecognitionResults((prev) => ({
        ...prev,
        [camera.id]: {
          message: 'Failed to capture frame',
          status: 'error',
          timestamp: new Date().toLocaleTimeString()
        }
      }));
    } finally {
      inFlightRef.current[camera.id] = false;
    }
  }, [socket]);

  // Start recognition for a camera
  const startCamera = useCallback(async (cameraId) => {
    const camera = cameras.find((c) => c.id === cameraId);
    if (!camera || camera.isRunning) return;

    if (camera.type === 'local') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: camera.deviceId } },
          audio: false
        });
        streamsRef.current[cameraId] = stream;
        const videoEl = videoRefs.current[cameraId];
        if (videoEl) {
          videoEl.srcObject = stream;
          await new Promise((resolve) => {
            videoEl.onloadedmetadata = () => {
              videoEl.play();
              resolve();
            };
          });
        }
      } catch (err) {
        setError(`Camera ${camera.label} permission denied`);
        return;
      }
    }

    updateCamera(cameraId, { isRunning: true });

    // Start recognition interval
    timerRefs.current[cameraId] = setInterval(() => {
      sendFrameForRecognition({ ...camera, isRunning: true });
    }, camera.intervalMs);

    // Send first frame immediately
    sendFrameForRecognition(camera);
  }, [cameras, updateCamera, sendFrameForRecognition]);

  // Stop recognition for a camera
  const stopCamera = useCallback((cameraId) => {
    if (timerRefs.current[cameraId]) {
      clearInterval(timerRefs.current[cameraId]);
      delete timerRefs.current[cameraId];
    }
    if (streamsRef.current[cameraId]) {
      streamsRef.current[cameraId].getTracks().forEach((track) => track.stop());
      delete streamsRef.current[cameraId];
    }
    updateCamera(cameraId, { isRunning: false });
  }, [updateCamera]);

  // Start all cameras
  const startAllCameras = useCallback(() => {
    cameras.forEach((cam) => {
      if (!cam.isRunning) {
        startCamera(cam.id);
      }
    });
  }, [cameras, startCamera]);

  // Stop all cameras
  const stopAllCameras = useCallback(() => {
    cameras.forEach((cam) => {
      if (cam.isRunning) {
        stopCamera(cam.id);
      }
    });
  }, [cameras, stopCamera]);

  // Update device selection for local camera
  const onDeviceChange = useCallback((cameraId, deviceId) => {
    const device = availableDeviceOptions.find((d) => d.id === deviceId);
    updateCamera(cameraId, {
      deviceId,
      label: device?.label || 'Camera'
    });
  }, [availableDeviceOptions, updateCamera]);

  // Check ML service health
  const checkMLService = useCallback(() => {
    if (socket) {
      socket.emit('check-ml-service');
    }
  }, [socket]);

  return (
    <div className="card wide">
      <div className="header-row">
        <div>
          <h2>Multi-Camera Live Recognition</h2>
          <p className="muted">Connect multiple cameras (local or IP) and see real-time recognition results for each.</p>
        </div>
        <div className="status-info">
          <div className="status-item">
            <span>Backend:</span>
            <span className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
          {mlServiceStatus && (
            <div className="status-item">
              <span>ML Service:</span>
              <span className={`status-badge ${mlServiceStatus.status === 'healthy' ? 'healthy' : 'offline'}`}>
                {mlServiceStatus.status === 'healthy' ? '✓ Online' : '✗ Offline'}
              </span>
              {mlServiceStatus.gpu_available !== undefined && (
                <span style={{ marginLeft: '0.5rem' }}>
                  GPU: {mlServiceStatus.gpu_available ? '✓' : '✗'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="controls">
        <button onClick={addLocalCamera} className="primary">
          + Add Local Camera
        </button>
        <button onClick={addIpCamera} className="secondary">
          + Add IP Camera
        </button>
        <button onClick={startAllCameras} className="secondary">
          Start All
        </button>
        <button onClick={stopAllCameras} className="secondary">
          Stop All
        </button>
        <button onClick={checkMLService} className="secondary">
          Check ML Service
        </button>
      </div>

      {cameras.length === 0 ? (
        <div className="empty-state">
          <p>No cameras configured yet.</p>
          <p className="muted">Add a local or IP camera to start recognition.</p>
        </div>
      ) : (
        <div className="cameras-grid">
          {cameras.map((camera) => (
            <div key={camera.id} className="camera-panel">
              <CameraStream
                camera={camera}
                availableDeviceOptions={availableDeviceOptions}
                videoRef={(el) => (videoRefs.current[camera.id] = el)}
                imgRef={(el) => (imgRefs.current[camera.id] = el)}
                onDeviceChange={(deviceId) => onDeviceChange(camera.id, deviceId)}
                onUpdateCamera={(updates) => updateCamera(camera.id, updates)}
                onStart={() => startCamera(camera.id)}
                onStop={() => stopCamera(camera.id)}
                onRemove={() => removeCamera(camera.id)}
              />
              <RecognitionResult
                result={recognitionResults[camera.id]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
