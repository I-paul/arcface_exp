import React, { useRef, useState, useCallback, useEffect } from 'react';
import RecognitionResult from './RecognitionResult';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const RECOGNITION_INTERVAL = 2000; // ms

export default function MultiCamRecognition({ cameras: dbCameras = [], isCamerasLoaded = true }) {
  const [availableDevices, setAvailableDevices] = useState([]);
  const [recognitionResults, setRecognitionResults] = useState({});
  const [selectedDbCamera, setSelectedDbCamera] = useState(null);
  const [activeLocalCamera, setActiveLocalCamera] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [videoReady, setVideoReady] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Load available devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setError('Camera access is not supported in this browser.');
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
      } catch (err) {
        setError('Unable to enumerate cameras. Check permissions.');
      }
    };
    loadDevices();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (deviceId) => {
    try {
      setError('');
      setStatus('Starting camera...');

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
        : { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setVideoReady(true);
            setStatus('Camera ready');
          } catch (playError) {
            setError('Unable to play camera stream. Please allow autoplay.');
          }
        };
        setActiveLocalCamera(deviceId);
        setStatus('Camera started');
      } else {
        setError('Video element not available. Please reload the page.');
      }
    } catch (err) {
      setError(`Failed to access camera: ${err.message}`);
      setStatus('');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActiveLocalCamera(null);
    setIsRunning(false);
    setVideoReady(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus('Camera stopped');
  }, []);

  // Capture frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current) return null;
    if (!videoRef.current.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  // Convert base64 to blob then to File
  const base64ToFile = (base64, filename = 'frame.jpg') => {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // Send frame for recognition
  const sendFrameForRecognition = useCallback(async () => {
    const imageData = captureFrame();
    if (!imageData || !selectedDbCamera) return;

    try {
      const file = base64ToFile(imageData);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('cam_id', selectedDbCamera.cam_id);
      formData.append('site_id', selectedDbCamera.site_id || '');

      const response = await fetch(`${BACKEND_URL}/api/recognize`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setStatus(`Job queued: ${result.job_id}`);
        
        // Poll for job result
        const pollJob = async () => {
          try {
            const statusResponse = await fetch(`${BACKEND_URL}/api/job/${result.job_id}`);
            const jobData = await statusResponse.json();

            if (jobData.status === 'completed') {
              const recognitionResult = jobData.result;
              setRecognitionResults(prev => ({
                ...prev,
                [selectedDbCamera.cam_id]: {
                  name: recognitionResult.name,
                  confidence: recognitionResult.confidence,
                  is_recognized: recognitionResult.is_recognized,
                  timestamp: new Date().toLocaleTimeString(),
                  status: 'success'
                }
              }));
            } else if (jobData.status === 'failed') {
              setRecognitionResults(prev => ({
                ...prev,
                [selectedDbCamera.cam_id]: {
                  message: jobData.error || 'Recognition failed',
                  timestamp: new Date().toLocaleTimeString(),
                  status: 'error'
                }
              }));
            } else {
              // Still processing, poll again
              setTimeout(pollJob, 1000);
            }
          } catch (err) {
            console.error('Error polling job status:', err);
          }
        };

        // Start polling after a short delay
        setTimeout(pollJob, 500);
      } else {
        setError('Failed to send frame for recognition');
      }
    } catch (err) {
      setError(`Recognition error: ${err.message}`);
    }
  }, [captureFrame, selectedDbCamera]);

  // Toggle recognition
  const toggleRecognition = useCallback(() => {
    if (!activeLocalCamera || !selectedDbCamera) {
      setError('Please select a camera and a database camera');
      return;
    }

    if (isRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRunning(false);
    } else {
      setIsRunning(true);
      timerRef.current = setInterval(() => {
        sendFrameForRecognition();
      }, RECOGNITION_INTERVAL);
      // Send first frame immediately
      sendFrameForRecognition();
    }
  }, [isRunning, activeLocalCamera, selectedDbCamera, sendFrameForRecognition]);

  return (
    <div className="card wide">
      <div className="header-row">
        <div>
          <h2>🎥 Live Face Recognition</h2>
          <p className="muted">Stream a local camera and match against registered cameras.</p>
        </div>
        <div className="status-info">
          <div className="status-item">
            <span className={`status-badge ${isRunning ? 'connected' : 'offline'}`}>
              {isRunning ? 'Running' : 'Idle'}
            </span>
            <span>{activeLocalCamera ? 'Camera active' : 'No active camera'}</span>
          </div>
          <div className="status-item">
            <span className={`status-badge ${selectedDbCamera ? 'healthy' : 'offline'}`}>
              {selectedDbCamera ? 'Linked' : 'Not linked'}
            </span>
            <span>{selectedDbCamera ? selectedDbCamera.camera_label : 'Select a DB camera'}</span>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {status && <div className="success">{status}</div>}

      {!isCamerasLoaded && (
        <div className="empty-state">
          <p>Loading camera registry...</p>
          <p className="muted">Waiting for backend camera list.</p>
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span>Local Camera</span>
          <select
            value={activeLocalCamera || ''}
            onChange={(e) => {
              if (e.target.value && !isRunning) {
                startCamera(e.target.value);
              }
            }}
            disabled={isRunning}
          >
            <option value="">Select a camera</option>
            {availableDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Associated Database Camera</span>
          <select
            value={selectedDbCamera?.cam_id || ''}
            onChange={(e) => {
              const cam = dbCameras.find(c => c.cam_id === e.target.value);
              setSelectedDbCamera(cam || null);
            }}
            disabled={!isCamerasLoaded}
          >
            <option value="">Select database camera</option>
            {dbCameras.map((camera) => (
              <option key={camera.cam_id} value={camera.cam_id}>
                {camera.camera_label} ({camera.site_name || camera.site_id})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="video-container">
        <video
          ref={videoRef}
          className="video-feed"
          autoPlay
          playsInline
          muted
        />
        {!videoReady && (
          <div className="video-placeholder">
            <p>Camera preview will appear here</p>
            <span>Select a local camera to start the feed.</span>
          </div>
        )}
      </div>

      <div className="controls">
        <button
          onClick={toggleRecognition}
          disabled={!activeLocalCamera || !selectedDbCamera}
          className="primary"
        >
          {isRunning ? 'Stop Recognition' : 'Start Recognition'}
        </button>
        <button onClick={stopCamera} className="secondary">
          Stop Camera
        </button>
      </div>

      <RecognitionResult
        result={selectedDbCamera ? recognitionResults[selectedDbCamera.cam_id] : null}
      />
    </div>
  );
}
