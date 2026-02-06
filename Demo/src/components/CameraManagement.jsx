import React, { useState } from 'react';

const BACKEND_URL = 'http://localhost:3000';

export default function CameraManagement({ cameras, onCameraAdded, onCameraDeleted }) {
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
    <div className="camera-management">
      <div className="header">
        <h2>📹 Camera Management</h2>
        <button 
          className="btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? '✕ Cancel' : '+ Add New Camera'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {showAddForm && (
        <form onSubmit={handleAddCamera} className="add-camera-form">
          <div className="form-group">
            <label>
              Site ID *
              <input
                type="text"
                name="site_id"
                value={formData.site_id}
                onChange={handleInputChange}
                placeholder="e.g., SITE-001"
                required
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Site Name
              <input
                type="text"
                name="site_name"
                value={formData.site_name}
                onChange={handleInputChange}
                placeholder="e.g., Main Entrance"
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Camera Label *
              <input
                type="text"
                name="camera_label"
                value={formData.camera_label}
                onChange={handleInputChange}
                placeholder="e.g., Front Door Camera"
                required
              />
            </label>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Adding...' : 'Add Camera'}
          </button>
        </form>
      )}

      <div className="cameras-grid">
        {cameras.length === 0 ? (
          <div className="no-cameras">
            <p>No cameras configured yet.</p>
            <p>Click "Add New Camera" to get started!</p>
          </div>
        ) : (
          cameras.map((camera) => (
            <div key={camera.cam_id} className="camera-card">
              <div className="camera-header">
                <h3>{camera.camera_label}</h3>
                <button
                  className="btn-delete"
                  onClick={() => handleDeleteCamera(camera.cam_id)}
                  title="Delete camera"
                >
                  🗑️
                </button>
              </div>
              <div className="camera-details">
                <p><strong>Site:</strong> {camera.site_name || camera.site_id}</p>
                <p><strong>Site ID:</strong> {camera.site_id}</p>
                <p><strong>Camera ID:</strong> <code>{camera.cam_id}</code></p>
                <p><strong>Created:</strong> {new Date(camera.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .camera-management {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .header h2 {
          margin: 0;
          color: #333;
        }

        .btn-primary {
          padding: 10px 20px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.3s;
        }

        .btn-primary:hover {
          background-color: #0056b3;
        }

        .btn-primary:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .alert {
          padding: 15px;
          margin-bottom: 20px;
          border-radius: 4px;
          animation: slideIn 0.3s ease-in-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .alert-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .alert-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .add-camera-form {
          background: #f9f9f9;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          border: 1px solid #ddd;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: flex;
          flex-direction: column;
          font-weight: 500;
          margin-bottom: 5px;
          color: #333;
        }

        .form-group input {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          margin-top: 5px;
        }

        .form-group input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 5px rgba(0, 123, 255, 0.3);
        }

        .cameras-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }

        .no-cameras {
          grid-column: 1 / -1;
          text-align: center;
          padding: 40px;
          color: #666;
          background: #f9f9f9;
          border-radius: 8px;
        }

        .camera-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition: transform 0.3s, box-shadow 0.3s;
        }

        .camera-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        .camera-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 15px;
          gap: 10px;
        }

        .camera-header h3 {
          margin: 0;
          color: #333;
          flex-grow: 1;
        }

        .btn-delete {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          opacity: 0.6;
          transition: opacity 0.3s;
        }

        .btn-delete:hover {
          opacity: 1;
        }

        .camera-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .camera-details p {
          margin: 0;
          font-size: 14px;
          color: #666;
        }

        .camera-details strong {
          color: #333;
        }

        .camera-details code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
