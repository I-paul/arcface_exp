import React, { useState, useEffect } from 'react';
import IPCameraRecognition from './components/IPCameraRecognition';
import EnrollSocket from './components/EnrollSocket';
import CameraManagement from './components/CameraManagement';

const NAV = {
  CAMERAS: 'cameras',
  RECOGNITION: 'recognition',
  ENROLL: 'enroll',
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function App() {
  const [tab, setTab] = useState(NAV.CAMERAS);
  const [cameras, setCameras] = useState([]);
  const [camerasLoaded, setCamerasLoaded] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Fetch cameras on app load
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        setCameraError('');
        const response = await fetch(`${BACKEND_URL}/api/cameras`);
        if (response.ok) {
          const data = await response.json();
          setCameras(data);
        } else {
          setCameraError('Unable to load cameras from server.');
        }
      } catch (error) {
        console.error('Failed to fetch cameras:', error);
        setCameraError('Failed to connect to server.');
      } finally {
        setCamerasLoaded(true);
      }
    };

    fetchCameras();
  }, []);

  const handleCameraAdded = (newCamera) => {
    setCameras([...cameras, newCamera]);
  };

  const handleCameraDeleted = (cam_id) => {
    setCameras(cameras.filter(cam => cam.cam_id !== cam_id));
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Face Recognition System</h1>
        <nav className="nav">
          <button
            className={tab === NAV.CAMERAS ? 'active' : ''}
            onClick={() => setTab(NAV.CAMERAS)}
          >
            Camera Management
          </button>
          <button
            className={tab === NAV.RECOGNITION ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNITION)}
          >
            Live Recognition
          </button>
          <button
            className={tab === NAV.ENROLL ? 'active' : ''}
            onClick={() => setTab(NAV.ENROLL)}
          >
            Face Enrollment
          </button>
        </nav>
      </header>

      <main className="content">
        {tab === NAV.CAMERAS && (
          <CameraManagement
            cameras={cameras}
            onCameraAdded={handleCameraAdded}
            onCameraDeleted={handleCameraDeleted}
            isLoading={!camerasLoaded}
            loadError={cameraError}
          />
        )}
        {tab === NAV.RECOGNITION && (
          <IPCameraRecognition cameras={cameras} isCamerasLoaded={camerasLoaded} />
        )}
        {tab === NAV.ENROLL && <EnrollSocket />}
      </main>
    </div>
  );
}
