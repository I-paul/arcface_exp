import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const CAPTURE_STEPS = [
  { label: 'Front Face', count: 1 },
  { label: 'Turn Right', count: 2 },
  { label: 'Turn Left', count: 2 }
];

export default function EnrollSocket() {
  const webcamRef = useRef(null);
  const imgRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('');
  const [captures, setCaptures] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useIpWebcam, setUseIpWebcam] = useState(false);
  const [ipUrl, setIpUrl] = useState('http://192.168.1.3:8080/video');

  const totalRequired = CAPTURE_STEPS.reduce((sum, step) => sum + step.count, 0);

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

    // Listen for enrollment success
    socketInstance.on('enrollment-success', (data) => {
      setMessage(data.message || 'Enrollment successful!');
      setError('');
      setIsSubmitting(false);
      // Reset form
      setCaptures([]);
      setCurrentStep(0);
      setName('');
    });

    // Listen for enrollment errors
    socketInstance.on('enrollment-error', (data) => {
      setError(data.message || 'Enrollment failed');
      setIsSubmitting(false);
    });

    // Listen for enrollment progress
    socketInstance.on('enrollment-progress', (data) => {
      console.log('Progress:', data.message);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  const captureImage = useCallback(() => {
    let imageSrc;

    if (useIpWebcam) {
      // Capture from IP webcam
      const img = imgRef.current;
      if (!img || !img.complete || !img.naturalWidth) {
        setError('IP webcam not ready. Check URL and connection.');
        return;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      imageSrc = canvas.toDataURL('image/jpeg', 0.9);
    } else {
      // Capture from regular webcam
      if (!webcamRef.current) {
        setError('Webcam not ready');
        return;
      }
      imageSrc = webcamRef.current.getScreenshot();
    }

    if (!imageSrc) {
      setError('Failed to capture image');
      return;
    }

    setCaptures((prev) => [...prev, imageSrc]);
    setError('');
    setMessage('');

    // Check if we need to move to next step
    const currentStepCaptures = captures.filter((_, idx) => {
      let count = 0;
      for (let i = 0; i <= currentStep; i++) {
        if (i === currentStep) {
          return idx >= count && idx < count + CAPTURE_STEPS[currentStep].count;
        }
        count += CAPTURE_STEPS[i].count;
      }
      return false;
    }).length;

    if (currentStepCaptures + 1 >= CAPTURE_STEPS[currentStep].count) {
      if (currentStep < CAPTURE_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  }, [captures, currentStep, useIpWebcam]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }

    if (captures.length < totalRequired) {
      setError(`Need ${totalRequired} images, currently have ${captures.length}`);
      return;
    }

    if (!socket) {
      setError('Not connected to server');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    // Send enrollment data via Socket.IO
    socket.emit('enroll-submit', {
      name: name.trim(),
      images: captures
    });
  }, [name, captures, socket, totalRequired]);

  const resetCaptures = () => {
    setCaptures([]);
    setCurrentStep(0);
    setMessage('');
    setError('');
  };

  return (
    <div className="card">
      <h2>Enroll New Person (Socket.IO)</h2>
      <p className="muted">Capture {totalRequired} images: 1 front, 2 right, 2 left</p>

      {/* Connection Status */}
      <div style={{ marginBottom: '1rem' }}>
        <strong>Connection: </strong>
        <span style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>

      {/* Name Input */}
      <label className="field">
        <span>Full Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter person's full name"
          disabled={isSubmitting}
        />
      </label>

      {/* IP Webcam Toggle */}
      <label className="field">
        <input
          type="checkbox"
          checked={useIpWebcam}
          onChange={(e) => setUseIpWebcam(e.target.checked)}
        />
        {' '} Use IP Webcam
      </label>
      
      {/* IP Webcam URL Input */}
      {useIpWebcam && (
        <label className="field">
          <span>IP Camera URL</span>
          <input
            type="text"
            value={ipUrl}
            onChange={(e) => setIpUrl(e.target.value)}
            placeholder="http://192.168.x.x:8080/video"
          />
        </label>
      )}

      {/* Webcam */}
      <div className="video-box">
        {useIpWebcam ? (
          <img
            ref={imgRef}
            src={ipUrl}
            className="video"
            alt="IP Webcam"
            crossOrigin="anonymous"
            onError={() => setError('Failed to load IP webcam. Check URL.')}
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              width: 1280,
              height: 720,
              facingMode: 'user'
            }}
            className="video"
          />
        )}
      </div>

      {/* Current Step Indicator */}
      <div className="prompt">
        <strong>Step {currentStep + 1} of {CAPTURE_STEPS.length}:</strong> {CAPTURE_STEPS[currentStep].label}
        <br />
        <span style={{ fontSize: '0.9rem' }}>
          Captured: {captures.length} / {totalRequired}
        </span>
      </div>

      {/* Capture Preview */}
      {captures.length > 0 && (
        <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <strong>Captured Images:</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {captures.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`Capture ${idx + 1}`}
                style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="actions">
        <button
          onClick={captureImage}
          disabled={!isConnected || isSubmitting || captures.length >= totalRequired}
        >
          📸 Capture Image
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isConnected || isSubmitting || captures.length < totalRequired || !name.trim()}
        >
          {isSubmitting ? 'Enrolling...' : '✓ Submit Enrollment'}
        </button>
        <button
          onClick={resetCaptures}
          disabled={isSubmitting || captures.length === 0}
          className="secondary"
        >
          🔄 Reset
        </button>
      </div>

      {/* Success Message */}
      {message && <div className="success">{message}</div>}

      {/* Error Display */}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
