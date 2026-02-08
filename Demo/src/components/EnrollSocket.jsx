import React, { useRef, useState, useCallback, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const REQUIRED_FRAMES = 5;

export default function EnrollSocket() {
  // Enrollment state
  const [emp_id, setEmpId] = useState('');
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
  const autoCaptureRef = useRef(null);

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
    if (autoCaptureRef.current) {
      clearInterval(autoCaptureRef.current);
      autoCaptureRef.current = null;
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
    if (!videoReady) {
      setError('Start the camera before auto-capture.');
      return;
    }
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
    autoCaptureRef.current = interval;
    setTimeout(() => {
      clearInterval(interval);
      if (autoCaptureRef.current === interval) {
        autoCaptureRef.current = null;
      }
    }, REQUIRED_FRAMES * 1000);
  }, [capturedFrames, useIpWebcam, videoReady]);

  // Submit enrollment via REST API
  const handleSubmit = useCallback(async () => {
    if (!emp_id.trim()) {
      setError('Employee ID is required');
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

    try {
      // Convert base64 images to File objects
      const files = capturedFrames.map((base64, index) => {
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          u8arr[i] = bstr.charCodeAt(i);
        }
        return new File([u8arr], `frame-${index}.jpg`, { type: mime });
      });

      // Create FormData
      const formData = new FormData();
      formData.append('emp_id', emp_id.trim());
      formData.append('name', name.trim());
      files.forEach(file => {
        formData.append('files', file);
      });

      // Submit to backend
      const response = await fetch(`${BACKEND_URL}/api/enroll`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✓ ${result.message}`);
        setProgress('');
        // Reset form
        setEmpId('');
        setName('');
        setCapturedFrames([]);
        stopCamera();
        setTimeout(() => setMessage(''), 5000);
      } else {
        setError(result.message || 'Enrollment failed');
      }
    } catch (err) {
      setError('Failed to submit enrollment: ' + err.message);
      console.error('Enrollment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [emp_id, name, capturedFrames, stopCamera]);

  // Clear captured frames
  const clearFrames = useCallback(() => {
    setCapturedFrames([]);
    setProgress('');
    setError('');
    setMessage('');
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (useIpWebcam) {
      if (streamRef.current) {
        stopCamera();
      }
    }
  }, [useIpWebcam, stopCamera]);

  return (
    <div className="card">
      <h2>Face Enrollment</h2>
      <p className="muted">
        Capture {REQUIRED_FRAMES} frames from different angles for enrollment
      </p>

      {/* Employee ID Input */}
      <label className="field">
        <span>Employee ID *</span>
        <input
          type="text"
          value={emp_id}
          onChange={(e) => setEmpId(e.target.value)}
          placeholder="Enter employee ID (e.g., EMP-001)"
          disabled={isSubmitting}
        />
      </label>

      {/* Name Input */}
      <label className="field">
        <span>Full Name *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter person's full name"
          disabled={isSubmitting}
        />
      </label>

      {/* Camera Type Selection */}
      <label className="field inline-field">
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
            onError={() => {
              setError('Failed to load IP camera stream');
              setVideoReady(false);
            }}
            onLoad={() => setVideoReady(true)}
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
          <button onClick={startCamera} disabled={isSubmitting} className="primary">
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
      {progress && <div className="progress-text">{progress}</div>}

      {/* Captured Frames Preview */}
      {capturedFrames.length > 0 && (
        <div className="frame-preview">
          <div className="frame-header">
            <strong>Captured Frames: {capturedFrames.length}/{REQUIRED_FRAMES}</strong>
            <button onClick={clearFrames} className="ghost" disabled={isSubmitting}>
              Clear All
            </button>
          </div>
          <div className="frame-grid">
            {capturedFrames.map((frame, idx) => (
              <div key={idx} className="frame-item">
                <img src={frame} alt={`Frame ${idx + 1}`} />
                <span className="frame-index">{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="actions">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || capturedFrames.length < REQUIRED_FRAMES || !emp_id.trim() || !name.trim()}
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
          <li>Enter Employee ID and Full Name</li>
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
