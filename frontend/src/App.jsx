import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

// Import local components
import IPCameraRecognition from './components/IPCameraRecognition';
import RecognitionLogs from './components/RecognitionLogs';
import EnrollmentForm from './components/EnrollmentForm';
import WebcamEnrollment from './components/testing/WebcamEnrollment';
import DirectWebcamRecognition from './components/testing/DirectWebcamRecognition';

// --- Unified Environment Configuration ---
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://backend:3000';

// Configure Axios defaults
axios.defaults.baseURL = BACKEND_URL;

// Shared WebSocket Connection Target
const WS_URL = BACKEND_URL;

function App() {
  // Establish shared socket connection to pass down to camera stream and logging feeds
  const socket = useMemo(() => {
    console.log(`Connecting shared WebSocket to: ${WS_URL}`);
    return io(WS_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });
  }, []);

  // Live Clock states
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isLiveOnline, setIsLiveOnline] = useState(false);

  useEffect(() => {
    // Clock updates
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    };
    
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    // Socket state observer
    socket.on('connect', () => setIsLiveOnline(true));
    socket.on('disconnect', () => setIsLiveOnline(false));

    return () => {
      clearInterval(clockInterval);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [socket]);

  return (
    <Router>
      <div className="min-h-screen flex flex-col md:flex-row antialiased bg-[#070a13] text-[#f3f4f6]">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 shrink-0 bg-[#0f1422]/90 backdrop-blur-md border-r border-slate-800 flex flex-col z-20">
          
          {/* Logo Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                {/* Scan Eye Icon */}
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <span className="font-sans font-extrabold text-sm tracking-wider bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">AURAFACE</span>
            </div>
            
            <div className="flex items-center space-x-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLiveOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLiveOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </span>
              <span className="text-[9px] font-semibold text-slate-500 tracking-wider">SOCKET</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">Primary Views</div>
            
            {/* NavLink - Real-time Feed */}
            <NavLink 
              to="/feed" 
              className={({ isActive }) => 
                `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/10' 
                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
                }`
              }
            >
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Real-time Feed</span>
              </div>
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
              </span>
            </NavLink>
            
            {/* NavLink - Enrollment Hub */}
            <NavLink 
              to="/enroll" 
              className={({ isActive }) => 
                `w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/10' 
                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
                }`
              }
            >
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>File Enrollment</span>
              </div>
            </NavLink>

            {/* LOCAL WEB TESTING SECTION */}
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mt-6 mb-2">Local Web Testing</div>

            {/* Webcam Enrollment Link */}
            <NavLink 
              to="/test/enroll" 
              className={({ isActive }) => 
                `w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/10' 
                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
                }`
              }
            >
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>Webcam Enrollment</span>
              </div>
            </NavLink>

            {/* Direct Webcam Recognition Link */}
            <NavLink 
              to="/test/recognize" 
              className={({ isActive }) => 
                `w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/10' 
                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
                }`
              }
            >
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Direct Recognition</span>
              </div>
            </NavLink>

          </nav>

          {/* Sidebar System Stats */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/20">
            <div className="flex items-center space-x-3 bg-slate-950/50 p-2 rounded-xl border border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop" 
                  className="w-full h-full object-cover" 
                  alt="Admin"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[11px] font-bold text-slate-350 truncate">Agent Admin</h4>
                <p className="text-[9px] text-slate-500 truncate">System Operator</p>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN PANEL CONTENT */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* Main Top Header Navbar */}
          <header className="h-16 shrink-0 bg-[#0f1422]/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex items-center space-x-3">
              <h1 className="font-sans font-bold text-slate-100 text-base">AuraFace Attendance Suite</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-100 font-mono tracking-wide">{timeStr}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">{dateStr}</div>
              </div>
              <div className="h-6 w-[1px] bg-slate-800 hidden sm:block"></div>
              
              <div className="bg-slate-900 border border-slate-800 text-[10px] text-slate-400 px-3 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>API Gateway: Online</span>
              </div>
            </div>
          </header>

          {/* Routes Content viewports */}
          <main className="flex-1 p-6 relative">
            <Routes>
              {/* Default redirect to Real-time feed */}
              <Route path="/" element={<Navigate to="/feed" replace />} />
              
              {/* Route: Real-time Feed (contains stream & logs panel side-by-side) */}
              <Route 
                path="/feed" 
                element={
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2">
                      <IPCameraRecognition socket={socket} />
                    </div>
                    <div className="xl:col-span-1">
                      <RecognitionLogs socket={socket} />
                    </div>
                  </div>
                } 
              />
              
              {/* Route: File Enrollment Form */}
              <Route path="/enroll" element={<EnrollmentForm />} />

              {/* Route: Webcam Enrollment (Local Testing) */}
              <Route path="/test/enroll" element={<WebcamEnrollment />} />

              {/* Route: Direct Webcam Recognition (Local Testing) */}
              <Route path="/test/recognize" element={<DirectWebcamRecognition socket={socket} />} />
              
              {/* Fallback routing */}
              <Route path="*" element={<Navigate to="/feed" replace />} />
            </Routes>
          </main>
        </div>

      </div>
    </Router>
  );
}

export default App;
