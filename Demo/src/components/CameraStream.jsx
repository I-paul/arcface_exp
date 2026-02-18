import React from 'react';

export default function CameraStream({
  camera,
  availableDeviceOptions,
  videoRef,
  imgRef,
  onDeviceChange,
  onUpdateCamera,
  onStart,
  onStop,
  onRemove
}) {
  return (
    <div className="camera-stream">
      <div className="camera-header">
        <h3>{camera.label}</h3>
        <div className="camera-controls">
          <span className={`badge ${camera.type === 'local' ? 'local-badge' : 'ip-badge'}`}>
            {camera.type === 'local' ? 'Local' : 'IP'}
          </span>
          <span className={`running-badge ${camera.isRunning ? 'active' : 'inactive'}`}>
            {camera.isRunning ? '● Recording' : '○ Idle'}
          </span>
          <button
            className="close-btn"
            onClick={onRemove}
            title="Remove camera"
          >
            X
          </button>
        </div>
      </div>

      <div className="video-container">
        {camera.type === 'local' ? (
          <video
            ref={videoRef}
            className="video-feed"
            muted
            playsInline
          />
        ) : (
          <img
            ref={imgRef}
            src={camera.ipUrl}
            alt={camera.label}
            className="video-feed"
            crossOrigin="anonymous"
          />
        )}
      </div>

      <div className="camera-settings">
        {camera.type === 'local' ? (
          <label className="field">
            <span>Camera Device</span>
            <select
              value={camera.deviceId}
              onChange={(e) => onDeviceChange(e.target.value)}
              disabled={camera.isRunning}
            >
              {availableDeviceOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>IP Camera URL</span>
            <input
              type="text"
              value={camera.ipUrl}
              onChange={(e) => onUpdateCamera({ ipUrl: e.target.value })}
              placeholder="http://192.168.x.x:8080/video"
              disabled={camera.isRunning}
            />
          </label>
        )}

        <label className="field">
          <span>Interval (ms)</span>
          <input
            type="number"
            min="300"
            value={camera.intervalMs}
            onChange={(e) => onUpdateCamera({ intervalMs: Number(e.target.value) })}
            disabled={camera.isRunning}
          />
        </label>
      </div>

      <div className="camera-actions">
        <button
          onClick={onStart}
          disabled={camera.isRunning}
          className="primary-small"
        >
          Start
        </button>
        <button
          onClick={onStop}
          disabled={!camera.isRunning}
          className="secondary-small"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
