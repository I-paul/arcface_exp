import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function RecognizeSocket() {
  const webcamRef = useRef(null);
  const imgRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [mlServiceStatus, setMlServiceStatus] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [useIpWebcam, setUseIpWebcam] = useState(false);
  const [ipUrl, setIpUrl] = useState('http://192.168.1.3:8080/video');

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
      // Check ML service status
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

    // Listen for recognition results
    socketInstance.on('recognition-result', (data) => {
      setResult(data);
      setError('');
      setIsRecognizing(false);
    });

    // Listen for recognition errors
    socketInstance.on('recognition-error', (data) => {
      setError(data.message || 'Recognition failed');
      setIsRecognizing(false);
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

  const captureAndRecognize = useCallback(() => {
    if (!socket || isRecognizing) return;

    let imageSrc;
    
    if (useIpWebcam) {
      // Capture from IP webcam
      const img = imgRef.current;
      if (!img || !img.complete || !img.naturalWidth) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      imageSrc = canvas.toDataURL('image/jpeg', 0.9);
    } else {
      // Capture from regular webcam
      if (!webcamRef.current) return;
      imageSrc = webcamRef.current.getScreenshot();
    }
    
    if (!imageSrc) return;

    setIsRecognizing(true);
    socket.emit('recognize-face', { image: imageSrc });
  }, [socket, isRecognizing, useIpWebcam]);

  // Auto-recognize every 2 seconds
  useEffect(() => {
    if (!isConnected || !socket) return;

    const interval = setInterval(() => {
      captureAndRecognize();
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected, socket, captureAndRecognize]);

  const checkMLService = () => {
    if (socket) {
      socket.emit('check-ml-service');
    }
  };

  return (
    <div className="card">
      <h2>Live Face Recognition (Socket.IO)</h2>
      <p className="muted">Real-time face recognition using WebSocket connection</p>

      {/* Connection Status */}
      <div style={{ marginBottom: '1rem' }}>
        <strong>Connection: </strong>
        <span style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>

      {/* ML Service Status */}
      {mlServiceStatus && (
        <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
          <strong>ML Service: </strong>
          <span style={{ color: mlServiceStatus.status === 'healthy' ? '#10b981' : '#ef4444' }}>
            {mlServiceStatus.status === 'healthy' ? '✓ Online' : '✗ Offline'}
          </span>
          {mlServiceStatus.gpu_available !== undefined && (
            <span style={{ marginLeft: '1rem' }}>
              <strong>GPU: </strong>
              <span style={{ color: mlServiceStatus.gpu_available ? '#10b981' : '#ef4444' }}>
                {mlServiceStatus.gpu_available ? '✓ Available' : '✗ Not Available'}
              </span>
            </span>
          )}
          <button
            onClick={checkMLService}
            style={{ marginLeft: '1rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
            className="secondary"
          >
            Refresh Status
          </button>
        </div>
      )}

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

      {/* Manual Recognition Button */}
      <div style={{ marginTop: '1rem' }}>
        <button
          onClick={captureAndRecognize}
          disabled={!isConnected || isRecognizing}
        >
          {isRecognizing ? 'Recognizing...' : 'Recognize Now'}
        </button>
      </div>

      {/* Recognition Result */}
      {result && (
        <div className="result">
          <div><strong>Name:</strong> {result.name || 'Unknown'}</div>
          <div><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</div>
          <div><strong>Recognized:</strong> {result.is_recognized ? '✓ Yes' : '✗ No'}</div>
          <div><strong>Message:</strong> {result.message}</div>
        </div>
      )}

      {/* Error Display */}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
