import React, { useMemo, useState, useRef } from 'react';
import axios from 'axios';

const steps = [
  { label: 'Look Front', captures: 1 },
  { label: 'Look Right', captures: 2 },
  { label: 'Look Left', captures: 2 },
];

const USE_IP_WEBCAM = false; // Set to true to use IP camera
const IP_WEBCAM_URL = 'http://10.1.31.201:8080/video'; // Change to your IP webcam URL

export default function Enroll() {
  const [name, setName] = useState('');
  const [stepIdx, setStepIdx] = useState(0);
  const [captures, setCaptures] = useState([]);
  const [captureCounts, setCaptureCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [ipUrl, setIpUrl] = useState(IP_WEBCAM_URL);
  const [useIpWebcam, setUseIpWebcam] = useState(USE_IP_WEBCAM);
  const imgRef = useRef(null);

  const step = steps[stepIdx];
  const totalNeeded = useMemo(
    () => steps.reduce((sum, s) => sum + s.captures, 0),
    []
  );

  const handleVideo = async () => {
    if (useIpWebcam) {
      setVideoReady(true);
      setError('');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.getElementById('enroll-video');
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            setVideoReady(true);
          };
        }
      } catch (err) {
        setError('Could not access camera');
      }
    }
  };

  const captureFrame = () => {
    const canvas = document.createElement('canvas');
    if (useIpWebcam) {
      const img = imgRef.current;
      if (!img) return null;
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      const video = document.getElementById('enroll-video');
      if (!video) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    return canvas;
  };

  const handleCapture = () => {
    setError('');
    setMessage('');
    const canvas = captureFrame();
    if (!canvas) {
      setError('Camera not ready');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Capture failed');
        return;
      }
      setCaptures((prev) => [...prev, { step: step.label, blob }]);
      setCaptureCounts((prev) => {
        const next = { ...prev, [step.label]: (prev[step.label] || 0) + 1 };
        const neededForStep = steps[stepIdx].captures;
        const takenForStep = next[step.label];
        if (takenForStep >= neededForStep) {
          setStepIdx((current) => (current < steps.length - 1 ? current + 1 : current));
        }
        return next;
      });
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (captures.length < totalNeeded) {
      setError(`Need ${totalNeeded} captures; currently ${captures.length}`);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('name', name.trim());
      captures.forEach((c, idx) => {
        form.append('files', c.blob, `capture-${idx + 1}.jpg`);
      });
      const { data } = await axios.post('/api/enroll', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(data.message || 'Enrollment complete');
      setCaptures([]);
      setCaptureCounts({});
      setStepIdx(0);
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.detail || 'Enrollment failed';
      setError(detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Enroll</h2>
      <p className="muted">Capture 1 front, 2 right, 2 left frames.</p>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter full name"
        />
      </label>

      <label className="field">
        <input
          type="checkbox"
          checked={useIpWebcam}
          onChange={(e) => setUseIpWebcam(e.target.checked)}
        />
        {' '} Use IP Webcam
      </label>
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

      <div className="video-box">
        {useIpWebcam ? (
          <img
            ref={imgRef}
            src={ipUrl}
            className="video"
            alt="IP Webcam"
            crossOrigin="anonymous"
          />
        ) : (
          <video id="enroll-video" className="video" playsInline muted />
        )}
        {!videoReady && (
          <button onClick={handleVideo} className="secondary">
            Enable Camera
          </button>
        )}
      </div>

      <div className="prompt">
        <strong>Current step:</strong> {step.label} ({captures.length}/{totalNeeded})
      </div>

      <div className="actions">
        <button onClick={handleCapture} disabled={!videoReady || busy}>
          Capture
        </button>
        <button onClick={handleSubmit} disabled={busy}>
          Submit
        </button>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
