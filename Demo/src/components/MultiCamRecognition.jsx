import React, { useRef, useState, useCallback, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';
const RECOGNITION_INTERVAL = 2000; // ms

export default function MultiCamRecognition({ cameras: dbCameras = [] }) {
  const [availableDevices, setAvailableDevices] = useState([]);
  const [recognitionResults, setRecognitionResults] = useState({});
  const [selectedDbCamera, setSelectedDbCamera] = useState(null);
  const [activeLocalCamera, setActiveLocalCamera] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Load available devices
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setActiveLocalCamera(deviceId);
        setStatus('Camera started');
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
    setActiveLocalCamera(null);
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus('Camera stopped');
  }, []);

  // Capture frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current) return null;
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
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>🎥 Live Face Recognition</h2>

      {error && <div style={{ ...styles.alert, backgroundColor: '#f8d7da', color: '#721c24' }}>{error}</div>}
      {status && <div style={{ ...styles.alert, backgroundColor: '#d1ecf1', color: '#0c5460' }}>{status}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Camera Selection */}
        <div>
          <h3>Local Camera</h3>
          <select
            value={activeLocalCamera || ''}
            onChange={(e) => {
              if (e.target.value && !isRunning) {
                startCamera(e.target.value);
              }
            }}
            style={styles.select}
          >
            <option value="">Select a camera</option>
            {availableDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        {/* Database Camera Selection */}
        <div>
          <h3>Associated Database Camera</h3>
          <select
            value={selectedDbCamera?.cam_id || ''}
            onChange={(e) => {
              const cam = dbCameras.find(c => c.cam_id === e.target.value);
              setSelectedDbCamera(cam || null);
            }}
            style={styles.select}
          >
            <option value="">Select database camera</option>
            {dbCameras.map((camera) => (
              <option key={camera.cam_id} value={camera.cam_id}>
                {camera.camera_label} ({camera.site_name || camera.site_id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Video Feed */}
      <div style={styles.videoContainer}>
        <video
          ref={videoRef}
          style={styles.video}
          autoPlay
          playsInline
          muted
        />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={toggleRecognition}
          disabled={!activeLocalCamera || !selectedDbCamera}
          style={{
            ...styles.button,
            backgroundColor: isRunning ? '#dc3545' : '#28a745',
            opacity: (!activeLocalCamera || !selectedDbCamera) ? 0.5 : 1
          }}
        >
          {isRunning ? 'Stop Recognition' : 'Start Recognition'}
        </button>
        <button
          onClick={stopCamera}
          style={styles.button}
        >
          Stop Camera
        </button>
      </div>

      {/* Recognition Results */}
      {Object.entries(recognitionResults).map(([camId, result]) => (
        <div key={camId} style={{ marginTop: '20px', ...styles.resultCard }}>
          <RecognitionResultBox result={result} />
        </div>
      ))}
    </div>
  );
}

function RecognitionResultBox({ result }) {
  return (
    <div>
      <p><strong>Timestamp:</strong> {result.timestamp}</p>
      {result.status === 'success' && (
        <>
          <p><strong>Name:</strong> {result.name || 'Unknown'}</p>
          <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(2)}%</p>
          <p style={{ color: result.is_recognized ? '#28a745' : '#dc3545' }}>
            <strong>Status:</strong> {result.is_recognized ? '✓ Recognized' : '✗ Not Recognized'}
          </p>
        </>
      )}
      {result.status === 'error' && (
        <p style={{ color: '#dc3545' }}><strong>Error:</strong> {result.message}</p>
      )}
    </div>
  );
}

const styles = {
  alert: {
    padding: '15px',
    marginBottom: '20px',
    borderRadius: '4px',
    border: '1px solid #dee2e6'
  },
  select: {
    width: '100%',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    marginTop: '5px'
  },
  videoContainer: {
    position: 'relative',
    aspectRatio: '16/9',
    backgroundColor: '#000',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  resultCard: {
    backgroundColor: '#f9f9f9',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #ddd'
  }
};
