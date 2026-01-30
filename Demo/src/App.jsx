import React, { useState } from 'react';
import Enroll from './components/Enroll';
import Recognize from './components/Recognize';
import EnrollSocket from './components/EnrollSocket';
import RecognizeSocket from './components/RecognizeSocket';

const NAV = {
  ENROLL: 'enroll',
  RECOGNIZE: 'recognize',
  ENROLL_SOCKET: 'enroll-socket',
  RECOGNIZE_SOCKET: 'recognize-socket',
};

export default function App() {
  const [tab, setTab] = useState(NAV.RECOGNIZE_SOCKET);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Face Recognition System</h1>
        <nav className="nav">
          <button
            className={tab === NAV.RECOGNIZE_SOCKET ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNIZE_SOCKET)}
          >
            🎥 Live Recognition
          </button>
          <button
            className={tab === NAV.ENROLL_SOCKET ? 'active' : ''}
            onClick={() => setTab(NAV.ENROLL_SOCKET)}
          >
            ➕ Enroll (Live)
          </button>
          <button
            className={tab === NAV.RECOGNIZE ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNIZE)}
          >
            Recognize (Legacy)
          </button>
          <button
            className={tab === NAV.ENROLL ? 'active' : ''}
            onClick={() => setTab(NAV.ENROLL)}
          >
            Enroll (Legacy)
          </button>
        </nav>
      </header>

      <main className="content">
        {tab === NAV.ENROLL && <Enroll />}
        {tab === NAV.RECOGNIZE && <Recognize />}
        {tab === NAV.ENROLL_SOCKET && <EnrollSocket />}
        {tab === NAV.RECOGNIZE_SOCKET && <RecognizeSocket />}
      </main>
    </div>
  );
}
