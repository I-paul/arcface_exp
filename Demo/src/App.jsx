import React, { useState } from 'react';
import Enroll from './components/Enroll';
import Recognize from './components/Recognize';

const NAV = {
  ENROLL: 'enroll',
  RECOGNIZE: 'recognize',
};

export default function App() {
  const [tab, setTab] = useState(NAV.ENROLL);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Face Demo</h1>
        <nav className="nav">
          <button
            className={tab === NAV.ENROLL ? 'active' : ''}
            onClick={() => setTab(NAV.ENROLL)}
          >
            Enroll
          </button>
          <button
            className={tab === NAV.RECOGNIZE ? 'active' : ''}
            onClick={() => setTab(NAV.RECOGNIZE)}
          >
            Recognize
          </button>
        </nav>
      </header>

      <main className="content">
        {tab === NAV.ENROLL ? <Enroll /> : <Recognize />}
      </main>
    </div>
  );
}
