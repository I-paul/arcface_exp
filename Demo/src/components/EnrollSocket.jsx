import React, { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const REQUIRED_FRAMES = 5;

export default function EnrollSocket() {
  // Socket state
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Enrollment state
  const [name, setName] = useState('');
  const [useIpWebcam, setUseIpWebcam] = useState(false);
  const [ipUrl, setIpUrl] = useState('http://10.1.31.201:8080/video');
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  
  // Messages
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  // Refs
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const streamRef = useRef(null);

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

    // Listen for enrollment progress
    socketInstance.on('enrollment-progress', (data) => {
      setProgress(`Captured ${data.captured} of ${data.total} frames`);
    });

    // Listen for enrollment success
    socketInstance.on('enrollment-success', (data) => {
      setMessage(data.message || 'Enrollment successful!');
      setError('');
      setIsSubmitting(false);
      // Reset form
      setName('');
      setCapturedFrames([]);
      setProgress('');
    });

    // Listen for enrollment errors
    socketInstance.on('enrollment-error', (data) => {
      setError(data.message || 'Enrollment failed');
      setIsSubmitting(false);
      setProgress('');
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
      stopCamera();
    };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    setError('');
    setMessage('');

    if (useIpWebcam) {
      setVideoReady(true);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setVideoReady(true);
          };
        }
      } catch (err) {
        setError('Could not access camera. Please grant permissions.');
      }
    }
  }, [useIpWebcam]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setVideoReady(false);
  }, []);

  // Capture frame from video element
  const captureFromVideo = (videoEl) => {
    if (!videoEl || !videoEl.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Capture frame from image element (IP camera)
  const captureFromImage = (imgEl) => {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Capture single frame
  const captureFrame = useCallback(() => {
    if (isCapturing || capturedFrames.length >= REQUIRED_FRAMES) return;

    setError('');
    setMessage('');
    setIsCapturing(true);

    try {
      let imageData;
      if (useIpWebcam) {
        imageData = captureFromImage(imgRef.current);
      } else {
        imageData = captureFromVideo(videoRef.current);
      }

      if (!imageData) {
        setError('Failed to capture frame. Camera not ready.');
        setIsCapturing(false);
        return;
      }

      setCapturedFrames(prev => [...prev, imageData]);
      setProgress(`Captured ${capturedFrames.length + 1} of ${REQUIRED_FRAMES} frames`);
    } catch (err) {
      setError('Failed to capture frame');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, capturedFrames, useIpWebcam]);

  // Auto-capture frames
  const startAutoCapture = useCallback(() => {
    if (capturedFrames.length >= REQUIRED_FRAMES) {
      setError('Already captured all required frames');
      return;
    }

    setError('');
    setMessage('');
    setProgress('Auto-capturing frames...');

    let count = capturedFrames.length;
    const interval = setInterval(() => {
      if (count >= REQUIRED_FRAMES) {
        clearInterval(interval);
        setProgress(`Captured ${REQUIRED_FRAMES} frames. Ready to submit!`);
        return;
      }

      let imageData;
      if (useIpWebcam) {
        imageData = captureFromImage(imgRef.current);
      } else {
        imageData = captureFromVideo(videoRef.current);
      }

      if (imageData) {
        setCapturedFrames(prev => [...prev, imageData]);
        count++;
        setProgress(`Auto-capturing... ${count} of ${REQUIRED_FRAMES} frames`);
      }
    }, 800); // Capture every 800ms

    // Stop after reasonable time
    setTimeout(() => clearInterval(interval), REQUIRED_FRAMES * 1000);
  }, [capturedFrames, useIpWebcam]);

  // Submit enrollment
  const handleSubmit = useCallback(() => {
    if (!socket || !isConnected) {
      setError('Not connected to server');
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (capturedFrames.length < REQUIRED_FRAMES) {
      setError(`Need ${REQUIRED_FRAMES} frames, currently have ${capturedFrames.length}`);
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');
    setProgress('Submitting enrollment...');

    // Send enrollment data to backend
    socket.emit('enroll-submit', {
      name: name.trim(),
      images: capturedFrames
    });
  }, [socket, isConnected, name, capturedFrames]);

  // Clear captured frames
  const clearFrames = useCallback(() => {
    setCapturedFrames([]);
    setProgress('');
    setError('');
    setMessage('');
  }, []);

  return (
    <div className="card">
      <h2>Face Enrollment (Socket.IO)</h2>
      <p className="muted">
        Capture {REQUIRED_FRAMES} frames from different angles for enrollment
      </p>

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

      {/* Camera Type Selection */}
      <label className="field" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={useIpWebcam}
          onChange={(e) => setUseIpWebcam(e.target.checked)}
          disabled={videoReady || isSubmitting}
        />
        <span>Use IP Camera</span>
      </label>

      {useIpWebcam && (
        <label className="field">
          <span>IP Camera URL</span>
          <input
            type="text"
            value={ipUrl}
            onChange={(e) => setIpUrl(e.target.value)}
            placeholder="http://192.168.x.x:8080/video"
            disabled={videoReady || isSubmitting}
          />
        </label>
      )}

      {/* Video Feed */}
      <div className="video-box enroll-video">
        {useIpWebcam ? (
          <img
            ref={imgRef}
            src={ipUrl}
            alt="IP Camera"
            className="video"
            crossOrigin="anonymous"
            onError={() => setError('Failed to load IP camera stream')}
          />
        ) : (
          <video
            ref={videoRef}
            className="video"
            muted
            playsInline
          />
        )}
      </div>

      {/* Camera Controls */}
      <div className="actions">
        {!videoReady ? (
          <button onClick={startCamera} disabled={isSubmitting}>
            Start Camera
          </button>
        ) : (
          <>
            <button onClick={stopCamera} className="secondary" disabled={isSubmitting}>
              Stop Camera
            </button>
            <button 
              onClick={captureFrame} 
              disabled={isCapturing || capturedFrames.length >= REQUIRED_FRAMES || isSubmitting}
            >
              Capture Frame ({capturedFrames.length}/{REQUIRED_FRAMES})
            </button>
            <button 
              onClick={startAutoCapture}
              className="secondary"
              disabled={capturedFrames.length >= REQUIRED_FRAMES || isSubmitting}
            >
              Auto-Capture All
            </button>
          </>
        )}
      </div>

      {/* Progress */}
      {progress && (
        <div style={{ marginTop: '12px', color: '#38bdf8', fontSize: '14px' }}>
          {progress}
        </div>
      )}

      {/* Captured Frames Preview */}
      {capturedFrames.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>Captured Frames: {capturedFrames.length}/{REQUIRED_FRAMES}</strong>
            <button onClick={clearFrames} className="ghost" disabled={isSubmitting}>
              Clear All
            </button>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
            gap: '8px' 
          }}>
            {capturedFrames.map((frame, idx) => (
              <div key={idx} style={{ 
                position: 'relative',
                aspectRatio: '1',
                border: '1px solid #334155',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <img 
                  src={frame} 
                  alt={`Frame ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: '#000',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px'
                }}>
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="actions" style={{ marginTop: '16px' }}>
        <button
          onClick={handleSubmit}
          disabled={!isConnected || isSubmitting || capturedFrames.length < REQUIRED_FRAMES || !name.trim()}
          className="primary"
        >
          {isSubmitting ? 'Enrolling...' : 'Submit Enrollment'}
        </button>
      </div>

      {/* Messages */}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {/* Instructions */}
      <div style={{ marginTop: '16px', padding: '12px', background: '#0b1222', borderRadius: '8px', fontSize: '13px' }}>
        <strong>Instructions:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#94a3b8' }}>
          <li>Start the camera and ensure face is clearly visible</li>
          <li>Capture {REQUIRED_FRAMES} frames from different angles (front, left, right)</li>
          <li>Use "Auto-Capture All" to capture frames automatically</li>
          <li>Review captured frames before submitting</li>
          <li>Submit enrollment when ready</li>
        </ul>
      </div>
    </div>
  );
}
