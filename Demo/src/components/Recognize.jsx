import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const POLL_MS = 1200;
const USE_IP_WEBCAM = false; // Set to true to use IP camera
const IP_WEBCAM_URL = 'http://10.1.31.201:8080/video'; // Change to your IP webcam URL

export default function Recognize() {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const inFlight = useRef(false);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [ipUrl, setIpUrl] = useState(IP_WEBCAM_URL);
  const [useIpWebcam, setUseIpWebcam] = useState(USE_IP_WEBCAM);

  useEffect(() => {
    if (useIpWebcam) {
      setReady(true);
      return;
    }
    let stream;
    const startVideo = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setReady(true);
          };
        }
      } catch (err) {
        setError('Could not access camera');
      }
    };
    startVideo();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [useIpWebcam]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        let frame;
        if (useIpWebcam) {
          const img = imgRef.current;
          if (!img) return;
          frame = grabFrameFromImage(img);
        } else {
          frame = grabFrame(videoRef.current);
        }
        if (!frame) return;
        const blob = await new Promise((resolve) => frame.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) return;
        const form = new FormData();
        form.append('file', blob, 'frame.jpg');
        const { data } = await axios.post('/api/recognize', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setResult(data);
        setError('');
      } catch (err) {
        const detail = err.response?.data?.message || err.response?.data?.detail || 'Recognition failed';
        setError(detail);
      } finally {
        inFlight.current = false;
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [ready, useIpWebcam]);

  return (
    <div className="card">
      <h2>Recognize</h2>
      <p className="muted">Live recognition of the closest face.</p>
      
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
          <video ref={videoRef} className="video" playsInline muted />
        )}
      </div>

      {result && (
        <div className="result">
          <div><strong>Name:</strong> {result.name || 'Unknown'}</div>
          <div><strong>Confidence:</strong> {result.confidence?.toFixed?.(3) ?? 'n/a'}</div>
          <div><strong>Recognized:</strong> {result.is_recognized ? 'Yes' : 'No'}</div>
          <div><strong>Message:</strong> {result.message}</div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}

function grabFrame(video) {
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function grabFrameFromImage(img) {
  if (!img || !img.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
