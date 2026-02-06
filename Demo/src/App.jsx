import React, { useState, useEffect } from 'react';
import MultiCamRecognition from './components/MultiCamRecognition';
import EnrollSocket from './components/EnrollSocket';
import CameraManagement from './components/CameraManagement';

const NAV = {
  CAMERAS: 'cameras',
  RECOGNITION: 'recognition',
  ENROLL: 'enroll',
};

export default function App() {
  const [tab, setTab] = useState(NAV.CAMERAS);
  const [cameras, setCameras] = useState([]);
  const [camerasLoaded, setCamerasLoaded] = useState(false);

  // Fetch cameras on app load
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/cameras');
        if (response.ok) {
          const data = await response.json();
          setCameras(data);
        }
      } catch (error) {
        console.error('Failed to fetch cameras:', error);
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
            📹 Camera Management
          </button>
          <button
            className={tab === NAV.RECOGNITION ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNITION)}
          >
            🎥 Live Recognition
          </button>
          <button
            className={tab === NAV.ENROLL ? 'active' : ''}
            onClick={() => setTab(NAV.ENROLL)}
          >
            ➕ Face Enrollment
          </button>
        </nav>
      </header>

      <main className="content">
        {tab === NAV.CAMERAS && camerasLoaded && (
          <CameraManagement 
            cameras={cameras} 
            onCameraAdded={handleCameraAdded} 
            onCameraDeleted={handleCameraDeleted}
          />
        )}
        {tab === NAV.RECOGNITION && <MultiCamRecognition cameras={cameras} />}
        {tab === NAV.ENROLL && <EnrollSocket />}
      </main>
    </div>
  );
}
