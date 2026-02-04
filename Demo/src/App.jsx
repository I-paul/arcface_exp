import React, { useState } from 'react';
import MultiCamRecognition from './components/MultiCamRecognition';
import EnrollSocket from './components/EnrollSocket';

const NAV = {
  RECOGNITION: 'recognition',
  ENROLL: 'enroll',
};

export default function App() {
  const [tab, setTab] = useState(NAV.RECOGNITION);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Face Recognition System</h1>
        <nav className="nav">
          <button
            className={tab === NAV.RECOGNITION ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNITION)}
          >
            🎥 Live Multi-Camera Recognition
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
        {tab === NAV.RECOGNITION && <MultiCamRecognition />}
        {tab === NAV.ENROLL && <EnrollSocket />}
      </main>
    </div>
  );
}
