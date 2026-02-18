import React, { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function CameraManagement({ cameras, onCameraAdded, onCameraDeleted, isLoading, loadError }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    site_id: '',
    site_name: '',
    camera_label: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddCamera = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!formData.site_id || !formData.camera_label) {
      setError('Site ID and Camera Label are required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/cameras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newCamera = await response.json();
        onCameraAdded(newCamera);
        setMessage(`Camera "${newCamera.camera_label}" added successfully!`);
        setFormData({
          site_id: '',
          site_name: '',
          camera_label: '',
        });
        setShowAddForm(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to add camera');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error adding camera:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCamera = async (cam_id) => {
    if (!window.confirm('Are you sure you want to delete this camera?')) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/cameras/${cam_id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onCameraDeleted(cam_id);
        setMessage('Camera deleted successfully');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError('Failed to delete camera');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error deleting camera:', err);
    }
  };

  return (
    <div className="card">
      <div className="header-row">
        <div>
          <h2>Camera Management</h2>
          <p className="muted">Manage camera locations used by recognition jobs.</p>
        </div>
        <div className="controls">
          <button
            className={showAddForm ? 'secondary' : 'primary'}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : '+ Add New Camera'}
          </button>
        </div>
      </div>

      {loadError && <div className="error">{loadError}</div>}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {isLoading && (
        <div className="empty-state">
          <p>Loading cameras...</p>
          <p className="muted">Fetching configured cameras from the backend.</p>
        </div>
      )}

      {!isLoading && showAddForm && (
        <form onSubmit={handleAddCamera} className="camera-form">
          <label className="field">
            <span>Site ID *</span>
            <input
              type="text"
              name="site_id"
              value={formData.site_id}
              onChange={handleInputChange}
              placeholder="e.g., SITE-001"
              required
            />
          </label>

          <label className="field">
            <span>Site Name</span>
            <input
              type="text"
              name="site_name"
              value={formData.site_name}
              onChange={handleInputChange}
              placeholder="e.g., Main Entrance"
            />
          </label>

          <label className="field">
            <span>Camera Label *</span>
            <input
              type="text"
              name="camera_label"
              value={formData.camera_label}
              onChange={handleInputChange}
              placeholder="e.g., Front Door Camera"
              required
            />
          </label>

          <div className="controls">
            <button type="submit" disabled={loading} className="primary">
              {loading ? 'Adding...' : 'Add Camera'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="secondary"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!isLoading && cameras.length === 0 && (
        <div className="empty-state">
          <p>No cameras configured yet.</p>
          <p className="muted">Click “Add New Camera” to get started.</p>
        </div>
      )}

      {!isLoading && cameras.length > 0 && (
        <div className="cameras-grid">
          {cameras.map((camera) => (
            <div key={camera.cam_id} className="camera-card">
              <div className="camera-card-header">
                <div>
                  <h3>{camera.camera_label}</h3>
                  <p className="muted">{camera.site_name || camera.site_id}</p>
                </div>
                <button
                  className="ghost"
                  onClick={() => handleDeleteCamera(camera.cam_id)}
                  title="Delete camera"
                >
                  Delete
                </button>
              </div>
              <div className="camera-details">
                <div className="camera-meta">
                  <span>Site ID</span>
                  <strong>{camera.site_id}</strong>
                </div>
                <div className="camera-meta">
                  <span>Camera ID</span>
                  <strong>{camera.cam_id}</strong>
                </div>
                <div className="camera-meta">
                  <span>Created</span>
                  <strong>{new Date(camera.created_at).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
