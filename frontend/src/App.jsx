import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';

// Layout
import AppLayout from './components/layout/AppLayout';

// Main Components
import ClassroomMonitor from './components/ClassroomMonitor';
import SessionsPage from './components/SessionsPage';
import BookSessionPage from './components/BookSessionPage';
import SessionDetail from './components/SessionDetail';
import EnrollmentPage from './components/EnrollmentPage';

// Admin Components
import AdminPortal from './components/admin/AdminPortal';

// Environment Configuration
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_BACKEND_URL || BACKEND_URL;

// Configure Axios defaults
axios.defaults.baseURL = BACKEND_URL;

function App() {
  // Establish shared socket connection
  const socket = useMemo(() => {
    console.log(`Connecting to backend: ${WS_URL}`);
    return io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Default redirect to monitor */}
        <Route path="/" element={<Navigate to="/monitor" replace />} />

        {/* Main App Routes with Layout */}
        <Route path="/monitor" element={
          <AppLayout socket={socket}>
            <ClassroomMonitor socket={socket} />
          </AppLayout>
        } />

        <Route path="/sessions" element={
          <AppLayout socket={socket}>
            <SessionsPage socket={socket} />
          </AppLayout>
        } />

        <Route path="/sessions/book" element={
          <AppLayout socket={socket}>
            <BookSessionPage />
          </AppLayout>
        } />

        <Route path="/sessions/:session_id" element={
          <AppLayout socket={socket}>
            <SessionDetail socket={socket} />
          </AppLayout>
        } />

        <Route path="/enroll" element={
          <AppLayout socket={socket}>
            <EnrollmentPage />
          </AppLayout>
        } />

        <Route path="/admin/*" element={
          <AppLayout socket={socket}>
            <AdminPortal />
          </AppLayout>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
