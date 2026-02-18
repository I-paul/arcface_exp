import React, { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const emptyFeed = {
  label: '',
  streamUrl: '',
  cam_id: ''
};

export default function MultiCamRecognition({ cameras: dbCameras = [], isCamerasLoaded = true }) {
  const [feeds, setFeeds] = useState([]);
  const [draft, setDraft] = useState(emptyFeed);
  const [attendanceByCam, setAttendanceByCam] = useState({});
  const [employeeById, setEmployeeById] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchEmployees = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/employees`);
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted) return;
        const map = {};
        for (const emp of data || []) {
          if (emp.emp_id) {
            map[emp.emp_id] = emp.name || emp.emp_id;
          }
        }
        setEmployeeById(map);
      } catch (err) {
        console.error('Failed to fetch employees:', err);
      }
    };

    const fetchAttendance = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/attendance?limit=100`);
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted) return;
        const latest = {};
        for (const event of data || []) {
          if (!event.cam_id) continue;
          if (!latest[event.cam_id]) {
            latest[event.cam_id] = event;
          }
        }
        setAttendanceByCam(latest);
      } catch (err) {
        console.error('Failed to fetch attendance:', err);
      }
    };

    fetchEmployees();
    fetchAttendance();

    const attendanceTimer = setInterval(fetchAttendance, 2000);
    const employeeTimer = setInterval(fetchEmployees, 30000);

    return () => {
      isMounted = false;
      clearInterval(attendanceTimer);
      clearInterval(employeeTimer);
    };
  }, []);

  const addFeed = () => {
    if (!draft.streamUrl || !draft.cam_id) {
      setError('Stream URL and database camera are required.');
      return;
    }

    const label = draft.label || `Camera ${feeds.length + 1}`;
    setFeeds((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        label,
        streamUrl: draft.streamUrl,
        cam_id: draft.cam_id
      }
    ]);

    setDraft(emptyFeed);
    setError('');
  };

  const removeFeed = (id) => {
    setFeeds((prev) => prev.filter((feed) => feed.id !== id));
  };

  const renderResult = (camId) => {
    const event = attendanceByCam[camId];
    if (!event) {
      return <p className="muted">Waiting for attendance event...</p>;
    }

    const name = employeeById[event.emp_id] || event.emp_id || 'Unknown';
    const time = event.event_time ? new Date(event.event_time).toLocaleTimeString() : '--';
    const score = event.similarity_score !== null && event.similarity_score !== undefined
      ? `${(event.similarity_score * 100).toFixed(1)}%`
      : 'n/a';

    return (
      <div className="recognition-result success recognized">
        <div className="result-header">
          <span className="result-status recognized-status">Recognized</span>
          <span className="result-time">{time}</span>
        </div>
        <div className="result-content">
          <div className="result-row">
            <span className="result-label">Name:</span>
            <span className="result-value name-value">{name}</span>
          </div>
          <div className="result-row">
            <span className="result-label">Action:</span>
            <span className="result-value">{event.action}</span>
          </div>
          <div className="result-row">
            <span className="result-label">Confidence:</span>
            <span className="result-value confidence-value">{score}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card wide">
      <div className="header-row">
        <div>
          <h2>Live Camera Feeds</h2>
          <p className="muted">Add stream URLs locally to display feeds and latest recognition results.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!isCamerasLoaded && (
        <div className="empty-state">
          <p>Loading camera registry...</p>
          <p className="muted">Waiting for backend camera list.</p>
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span>Label</span>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Front Gate"
          />
        </label>
        <label className="field">
          <span>Stream URL</span>
          <input
            type="text"
            value={draft.streamUrl}
            onChange={(e) => setDraft((prev) => ({ ...prev, streamUrl: e.target.value }))}
            placeholder="http://192.168.x.x:8080/video"
          />
        </label>
        <label className="field">
          <span>Database Camera</span>
          <select
            value={draft.cam_id}
            onChange={(e) => setDraft((prev) => ({ ...prev, cam_id: e.target.value }))}
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
        <div className="controls">
          <button onClick={addFeed} className="primary">
            Add Feed
          </button>
        </div>
      </div>

      {feeds.length === 0 && (
        <div className="empty-state">
          <p>No camera feeds added yet.</p>
          <p className="muted">Add a stream URL and link it to a registered camera.</p>
        </div>
      )}

      <div className="cameras-grid">
        {feeds.map((feed) => (
          <div key={feed.id} className="camera-card">
            <div className="camera-card-header">
              <h3>{feed.label}</h3>
              <button className="close-btn" onClick={() => removeFeed(feed.id)}>
                X
              </button>
            </div>
            <div className="video-container">
              <img
                src={feed.streamUrl}
                alt={feed.label}
                className="video-feed"
                crossOrigin="anonymous"
              />
            </div>
            {renderResult(feed.cam_id)}
          </div>
        ))}
      </div>
    </div>
  );
}
