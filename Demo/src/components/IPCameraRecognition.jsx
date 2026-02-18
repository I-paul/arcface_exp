import React, { useState, useEffect, useRef } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Predefined IP camera URLs
const IP_CAMERA_URLS = [
  { label: 'Front Entrance', url: 'http://192.168.1.3:8080/video' },
  { label: 'Main Gate', url: 'http://192.168.1.101:8080/video' },
];

export default function IPCameraRecognition({ cameras: dbCameras = [], isCamerasLoaded = true }) {
  const [cameraFeeds, setCameraFeeds] = useState([]);
  const [draft, setDraft] = useState({ cam_id: '', ipUrl: '', label: '', customUrl: '' });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({}); // { cam_id: { lastRecognition, isLoading, lastFrame } }
  const [employees, setEmployees] = useState({});
  const [continuousRecognition, setContinuousRecognition] = useState({}); // { feedId: true/false }
  const captureIntervals = useRef({});

  // Fetch employees for name lookup
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/employees`);
        if (response.ok) {
          const data = await response.json();
          const map = {};
          data.forEach(emp => {
            if (emp.emp_id) {
              map[emp.emp_id] = emp.name || emp.emp_id;
            }
          });
          setEmployees(map);
        }
      } catch (err) {
        console.error('Failed to fetch employees:', err);
      }
    };
    fetchEmployees();
  }, []);

  // Initialize results state for existing cameras
  useEffect(() => {
    const newResults = {};
    dbCameras.forEach(cam => {
      newResults[cam.cam_id] = { lastRecognition: null, isLoading: false, lastFrame: null, timestamp: null };
    });
    setResults(newResults);
  }, [dbCameras]);

  const addCameraFeed = () => {
    if (!draft.cam_id || !draft.label) {
      alert('Please fill in all fields');
      return;
    }

    // Determine which URL to use
    const selectedUrl = draft.ipUrl === 'custom' ? draft.customUrl : draft.ipUrl;

    if (!selectedUrl) {
      alert('Please select or enter a camera URL');
      return;
    }

    const newFeed = {
      id: Date.now(),
      cam_id: draft.cam_id,
      ipUrl: selectedUrl,
      label: draft.label,
      createdAt: new Date().toLocaleTimeString()
    };

    setCameraFeeds([...cameraFeeds, newFeed]);
    setResults(prev => ({
      ...prev,
      [draft.cam_id]: { lastRecognition: null, isLoading: false, lastFrame: null }
    }));
    setDraft({ cam_id: '', ipUrl: '', label: '', customUrl: '' });
  };

  const removeCameraFeed = (id) => {
    // Stop continuous recognition if active
    if (captureIntervals.current[id]) {
      clearInterval(captureIntervals.current[id]);
      delete captureIntervals.current[id];
    }
    setContinuousRecognition(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    setCameraFeeds(cameraFeeds.filter(feed => feed.id !== id));
  };

  // Single frame capture and recognition
  const captureFrame = async (feed) => {
    try {
      setResults(prev => ({
        ...prev,
        [feed.cam_id]: { ...prev[feed.cam_id], isLoading: true }
      }));

      // Find the img element for this camera
      const imgElement = document.querySelector(`img[data-camera-id="${feed.cam_id}"]`);
      if (!imgElement) {
        setResults(prev => ({
          ...prev,
          [feed.cam_id]: {
            ...prev[feed.cam_id],
            isLoading: false,
            lastRecognition: { error: 'Image element not found' }
          }
        }));
        return;
      }

      // Wait for image to be loaded
      if (!imgElement.complete) {
        await new Promise((resolve) => {
          imgElement.onload = resolve;
          imgElement.onerror = () => {
            throw new Error('Image failed to load');
          };
        });
      }

      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = imgElement.naturalWidth || imgElement.width || 640;
      canvas.height = imgElement.naturalHeight || imgElement.height || 480;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0);

      // Convert canvas to blob
      const frameBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          },
          'image/jpeg',
          0.95
        );
      });

      // Create FormData same way as edge service
      const formData = new FormData();
      formData.append('file', frameBlob, 'frame.jpg');
      formData.append('cam_id', feed.cam_id);

      // Send to backend for recognition
      let recognitionResponse;
      try {
        recognitionResponse = await fetch(`${BACKEND_URL}/api/recognize`, {
          method: 'POST',
          body: formData
        });
      } catch (submitErr) {
        setResults(prev => ({
          ...prev,
          [feed.cam_id]: {
            ...prev[feed.cam_id],
            isLoading: false,
            lastRecognition: { error: `Backend connection failed: ${submitErr.message}` }
          }
        }));

        return;
      }

      if (!recognitionResponse.ok) {
        const errorText = await recognitionResponse.text();
        setResults(prev => ({
          ...prev,
          [feed.cam_id]: {
            ...prev[feed.cam_id],
            isLoading: false,
            lastRecognition: { error: `Backend error ${recognitionResponse.status}: ${errorText}` }
          }
        }));
        return;
      }

      const queueResp = await recognitionResponse.json();
      const jobId = queueResp.job_id;

      if (!jobId) {
        setResults(prev => ({
          ...prev,
          [feed.cam_id]: {
            ...prev[feed.cam_id],
            isLoading: false,
            lastRecognition: { error: 'No job ID received from backend' }
          }
        }));
        return;
      }

      // Poll for job completion
      let pollCount = 0;
      const maxPolls = 40;
      const pollInterval = 500;

      const pollJob = async () => {
        try {
          const jobResponse = await fetch(`${BACKEND_URL}/api/job/${jobId}`);
          if (!jobResponse.ok) {
            throw new Error(`Job fetch failed: ${jobResponse.statusText}`);
          }

          const jobData = await jobResponse.json();

          if (jobData.status === 'completed') {
            // Try multiple possible data structures from backend response
            const result = jobData.data || jobData.result || jobData;
            setResults(prev => ({
              ...prev,
              [feed.cam_id]: {
                lastRecognition: result,
                isLoading: false,
                lastFrame: feed.ipUrl,
                timestamp: new Date().toLocaleTimeString()
              }
            }));
            return;
          } else if (jobData.status === 'failed') {
            throw new Error(jobData.data?.message || jobData.message || 'Job failed');
          }

          // Still processing
          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(pollJob, pollInterval);
          } else {
            throw new Error('Job processing timeout (20 seconds)');
          }
        } catch (pollErr) {
          setResults(prev => ({
            ...prev,
            [feed.cam_id]: {
              ...prev[feed.cam_id],
              isLoading: false,
              lastRecognition: { error: pollErr.message }
            }
          }));
        }
      };

      pollJob();
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [feed.cam_id]: {
          ...prev[feed.cam_id],
          isLoading: false,
          lastRecognition: { error: err.message }
        }
      }));
    }
  };

  // Toggle auto-capture for a camera
  // Toggle continuous recognition
  const toggleContinuousRecognition = (feed) => {
    if (continuousRecognition[feed.id]) {
      // Stop continuous recognition
      if (captureIntervals.current[feed.id]) {
        clearInterval(captureIntervals.current[feed.id]);
        delete captureIntervals.current[feed.id];
      }
      setContinuousRecognition(prev => ({ ...prev, [feed.id]: false }));
    } else {
      // Start continuous recognition
      // Capture immediately
      captureFrame(feed);
      
      // Set up interval
      const interval = setInterval(() => {
        captureFrame(feed);
      }, 1500); // Capture every 1.5 seconds
      
      captureIntervals.current[feed.id] = interval;
      setContinuousRecognition(prev => ({ ...prev, [feed.id]: true }));
    }
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(captureIntervals.current).forEach(clearInterval);
    };
  }, []);

  const getResultDisplay = (camId, feed) => {
    const result = results[camId];
    if (!result) return null;

    // Don't show loading/waiting placeholders, only show actual results
    if (!result.lastRecognition) {
      return null;
    }

    if (result.lastRecognition.error) {
      return <div className="error-box">{result.lastRecognition.error}</div>;
    }

    const { is_recognized, person_id, confidence, liveness, name, message } = result.lastRecognition;
    const timeStr = result.timestamp ? `at ${result.timestamp}` : '';

    return (
      <div className="recognition-result">
        <div className="result-timestamp">{timeStr}</div>
        <div className={`status ${is_recognized ? 'recognized' : 'unrecognized'}`}>
          {is_recognized ? '✓ Recognized' : '✗ Not Recognized'}
        </div>
        {message && (
          <div className="detail">
            <strong>Message:</strong> {message}
          </div>
        )}
        {is_recognized && (
          <>
            <div className="detail name-display">
              <strong>Person:</strong> {name || person_id || 'Unknown'}
            </div>
            <div className="detail">
              <strong>Confidence:</strong> {(confidence * 100).toFixed(2)}%
            </div>
          </>
        )}
        {liveness && (
          <div className={`liveness ${liveness.is_live ? 'live' : 'spoof'}`}>
            <strong>Liveness:</strong> {liveness.status || (liveness.is_live ? 'Live' : 'Spoof')}
            {liveness.real_score && (
              <span> (Real: {(liveness.real_score * 100).toFixed(2)}%)</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ip-camera-recognition">
      <h2>IP Camera Live Recognition</h2>

      <div className="camera-add-section">
        <h3>Add IP Camera</h3>
        <div className="form-group">
          <label>
            Camera Label
            <input
              type="text"
              placeholder="e.g., Main Entrance"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>

          <label>
            IP Camera Stream
            <select
              value={draft.ipUrl}
              onChange={(e) => setDraft({ ...draft, ipUrl: e.target.value, customUrl: '' })}
            >
              <option value="">Select camera stream...</option>
              {IP_CAMERA_URLS.map((camera, idx) => (
                <option key={idx} value={camera.url || 'custom'}>
                  {camera.url}
                </option>
              ))}
            </select>
          </label>

          {draft.ipUrl === 'custom' && (
            <label>
              Custom Stream URL
              <input
                type="text"
                placeholder="http://192.168.1.x:8080/video"
                value={draft.customUrl}
                onChange={(e) => setDraft({ ...draft, customUrl: e.target.value })}
              />
            </label>
          )}

          <label>
            Database Camera
            <select
              value={draft.cam_id}
              onChange={(e) => setDraft({ ...draft, cam_id: e.target.value })}
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

          <button onClick={addCameraFeed} className="primary-btn" disabled={loading}>
            Add Camera Feed
          </button>
        </div>
      </div>

      <div className="feeds-grid">
        {cameraFeeds.map(feed => (
          <div key={feed.id} className="camera-feed-card">
            <div className="feed-header">
              <h3>{feed.label}</h3>
              <div className="feed-badges">
                <span className="badge-id">{feed.cam_id}</span>
                <span className={`auto-badge ${continuousRecognition[feed.id] ? 'active' : 'inactive'}`}>
                  {continuousRecognition[feed.id] ? '● Active' : '○ Idle'}
                </span>
              </div>
              <button
                className="close-btn"
                onClick={() => removeCameraFeed(feed.id)}
                title="Remove feed"
              >
                ✕
              </button>
            </div>

            <div className="feed-viewer">
              <img
                src={feed.ipUrl}
                alt={feed.label}
                className="camera-preview"
                crossOrigin="anonymous"
                data-camera-id={feed.cam_id}
              />
            </div>

            <div className="feed-controls">
              <button
                onClick={() => toggleContinuousRecognition(feed)}
                className={`capture-btn ${continuousRecognition[feed.id] ? 'active' : ''}`}
              >
                {continuousRecognition[feed.id] ? '● Stop Recognition' : '▶ Start Recognition'}
              </button>
            </div>

            <div className="feed-result">
              {getResultDisplay(feed.cam_id, feed)}
            </div>

            <div className="feed-info">
              <small>Added: {feed.createdAt}</small>
            </div>
          </div>
        ))}
      </div>

      {cameraFeeds.length === 0 && (
        <div className="empty-state">
          <p>No camera feeds added yet. Add an IP camera to get started.</p>
        </div>
      )}
    </div>
  );
}
