import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const DEFAULT_INTERVAL = 1200;

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function MultiCamQueueTest() {
  const [devices, setDevices] = useState([]);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ sent: 0, queued: 0, failed: 0 });

  const videoRefs = useRef({});
  const imgRefs = useRef({});
  const timersRef = useRef({});
  const streamsRef = useRef({});
  const inFlightRef = useRef({});

  useEffect(() => {
    let active = true;
    const loadDevices = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        const cams = list.filter((d) => d.kind === 'videoinput');
        setDevices(cams);
      } catch (err) {
        setError('Unable to enumerate cameras. Check permissions.');
      }
    };
    loadDevices();

    return () => {
      active = false;
      stopAll();
    };
  }, []);

  const deviceOptions = useMemo(() => {
    return devices.map((d, idx) => ({
      id: d.deviceId,
      label: d.label || `Camera ${idx + 1}`,
    }));
  }, [devices]);

  const addLocalSource = () => {
    if (!deviceOptions.length) {
      setError('No local cameras found.');
      return;
    }
    const option = deviceOptions[0];
    setSources((prev) => [
      ...prev,
      {
        id: makeId(),
        type: 'local',
        deviceId: option.id,
        label: option.label,
        intervalMs: DEFAULT_INTERVAL,
        isRunning: false,
        lastStatus: 'idle',
      },
    ]);
  };

  const addIpSource = () => {
    setSources((prev) => [
      ...prev,
      {
        id: makeId(),
        type: 'ip',
        ipUrl: 'http://192.168.1.3:8080/video',
        label: 'IP Camera',
        intervalMs: DEFAULT_INTERVAL,
        isRunning: false,
        lastStatus: 'idle',
      },
    ]);
  };

  const updateSource = (id, patch) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSource = (id) => {
    stopSource(id);
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const captureFrameFromVideo = (video) => {
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const captureFrameFromImage = (img) => {
    if (!img || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const sendFrame = async (source) => {
    if (inFlightRef.current[source.id]) return;
    inFlightRef.current[source.id] = true;
    try {
      const videoEl = videoRefs.current[source.id];
      const imgEl = imgRefs.current[source.id];
      const canvas = source.type === 'local'
        ? captureFrameFromVideo(videoEl)
        : captureFrameFromImage(imgEl);

      if (!canvas) {
        updateSource(source.id, { lastStatus: 'no-frame' });
        return;
      }

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) return;

      const form = new FormData();
      form.append('file', blob, 'frame.jpg');

      setStats((prev) => ({ ...prev, sent: prev.sent + 1 }));

      await axios.post(`${BACKEND_URL}/api/recognize`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20000,
      });

      setStats((prev) => ({ ...prev, queued: prev.queued + 1 }));
      updateSource(source.id, { lastStatus: 'queued' });
    } catch (err) {
      setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
      updateSource(source.id, { lastStatus: 'error' });
    } finally {
      inFlightRef.current[source.id] = false;
    }
  };

  const startSource = async (id) => {
    const source = sources.find((s) => s.id === id);
    if (!source || source.isRunning) return;

    if (source.type === 'local') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: source.deviceId } },
          audio: false,
        });
        streamsRef.current[id] = stream;
        if (videoRefs.current[id]) {
          videoRefs.current[id].srcObject = stream;
          await videoRefs.current[id].play();
        }
      } catch (err) {
        updateSource(id, { lastStatus: 'permission-error' });
        return;
      }
    }

    updateSource(id, { isRunning: true, lastStatus: 'running' });

    timersRef.current[id] = setInterval(() => {
      sendFrame({ ...source, isRunning: true });
    }, source.intervalMs);
  };

  const stopSource = (id) => {
    if (timersRef.current[id]) {
      clearInterval(timersRef.current[id]);
      delete timersRef.current[id];
    }
    if (streamsRef.current[id]) {
      streamsRef.current[id].getTracks().forEach((t) => t.stop());
      delete streamsRef.current[id];
    }
    updateSource(id, { isRunning: false, lastStatus: 'stopped' });
  };

  const startAll = () => {
    sources.forEach((s) => startSource(s.id));
  };

  const stopAll = () => {
    Object.keys(timersRef.current).forEach((id) => stopSource(id));
  };

  const onDeviceChange = (id, deviceId) => {
    const device = deviceOptions.find((d) => d.id === deviceId);
    updateSource(id, { deviceId, label: device?.label || 'Camera' });
  };

  return (
    <div className="card wide">
      <div className="header-row">
        <div>
          <h2>Multi-Camera Queue Tester</h2>
          <p className="muted">Push frames from multiple cameras to the backend queue to stress-test GPU throughput.</p>
        </div>
        <div className="stats">
          <div><strong>Sent:</strong> {stats.sent}</div>
          <div><strong>Queued:</strong> {stats.queued}</div>
          <div><strong>Failed:</strong> {stats.failed}</div>
        </div>
      </div>

      <div className="actions">
        <button onClick={addLocalSource}>+ Add Local Camera</button>
        <button onClick={addIpSource} className="secondary">+ Add IP Camera</button>
        <button onClick={startAll} className="secondary">Start All</button>
        <button onClick={stopAll} className="secondary">Stop All</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid">
        {sources.map((source) => (
          <div key={source.id} className="camera-card">
            <div className="camera-head">
              <span className="badge">{source.type === 'local' ? 'Local' : 'IP'}</span>
              <span className={`status ${source.lastStatus}`}>{source.lastStatus}</span>
              <button className="ghost" onClick={() => removeSource(source.id)}>✕</button>
            </div>

            {source.type === 'local' ? (
              <label className="field">
                <span>Camera Device</span>
                <select
                  value={source.deviceId}
                  onChange={(e) => onDeviceChange(source.id, e.target.value)}
                  disabled={source.isRunning}
                >
                  {deviceOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>IP Camera URL</span>
                <input
                  type="text"
                  value={source.ipUrl}
                  onChange={(e) => updateSource(source.id, { ipUrl: e.target.value })}
                  placeholder="http://192.168.x.x:8080/video"
                  disabled={source.isRunning}
                />
              </label>
            )}

            <label className="field">
              <span>Interval (ms)</span>
              <input
                type="number"
                min={300}
                value={source.intervalMs}
                onChange={(e) => updateSource(source.id, { intervalMs: Number(e.target.value) })}
                disabled={source.isRunning}
              />
            </label>

            <div className="video-box compact">
              {source.type === 'local' ? (
                <video
                  ref={(el) => (videoRefs.current[source.id] = el)}
                  className="video"
                  muted
                  playsInline
                />
              ) : (
                <img
                  ref={(el) => (imgRefs.current[source.id] = el)}
                  src={source.ipUrl}
                  className="video"
                  alt="IP Camera"
                  crossOrigin="anonymous"
                />
              )}
            </div>

            <div className="actions">
              <button
                onClick={() => startSource(source.id)}
                disabled={source.isRunning}
              >
                Start
              </button>
              <button
                onClick={() => stopSource(source.id)}
                disabled={!source.isRunning}
                className="secondary"
              >
                Stop
              </button>
              <button
                onClick={() => sendFrame(source)}
                className="secondary"
              >
                Send Once
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
