import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Mock placeholder image (base64 PNG of a classroom)
const MOCK_CLASSROOM_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export default function ClassroomMonitor({ socket }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState(null);
  const [lastOverlay, setLastOverlay] = useState({ faces: [] });
  const [fps, setFps] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [lastDetectionTime, setLastDetectionTime] = useState(null);
  const [mockMode, setMockMode] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [detectionLog, setDetectionLog] = useState([]);

  const canvasRef = useRef(null);
  const fpsCounterRef = useRef({ lastTime: Date.now(), frameCount: 0 });
  const mockIntervalRef = useRef(null);

  // Fetch cameras and today's sessions on mount
  useEffect(() => {
    Promise.all([
      axios.get('/api/cameras'),
      axios.get('/api/sessions/today')
    ])
    .then(([camsRes, sessRes]) => {
      const activeCams = camsRes.data.filter(c => c.is_active);
      setCameras(activeCams);
      if (activeCams.length > 0 && !selectedCamId) {
        setSelectedCamId(activeCams[0].cam_id);
      }
      
      // We will match the active session based on the selected camera later
      if (sessRes.data) {
        // Just store all for now, filter dynamically
        window.__todaySessions = sessRes.data;
      }
    })
    .catch(err => console.error('Failed to fetch initial data:', err));
  }, []);

  // Determine active session for the selected camera
  useEffect(() => {
    if (!selectedCamId || !window.__todaySessions) return;
    const cam = cameras.find(c => c.cam_id === selectedCamId);
    if (!cam) return;
    
    const active = window.__todaySessions.find(s => s.room_id === cam.room_id && s.status === 'ACTIVE');
    setActiveSession(active || null);
  }, [selectedCamId, cameras]);

  // Socket listeners for camera frames and recognition results
  useEffect(() => {
    if (!socket || !selectedCamId) return;

    const handleCameraFrame = (payload) => {
      if (payload.cam_id !== selectedCamId) return;
      drawFrame(payload.imageBase64);
      updateFps();
    };

    const handleRecognitionResult = (payload) => {
      if (payload.cam_id !== selectedCamId) return;
      
      const faces = payload.faces || [];
      setLastOverlay({ faces });
      setFaceCount(faces.length);
      
      if (faces.length > 0) {
        setLastDetectionTime(new Date());
        
        // Add to detection log (keep last 20)
        setDetectionLog(prev => {
          const newLogs = faces.map(f => ({
            id: Date.now() + Math.random(),
            name: f.name || 'Unknown',
            confidence: f.confidence,
            isUnknown: !f.student_id,
            time: new Date()
          }));
          return [...newLogs, ...prev].slice(0, 20);
        });
      }
    };

    socket.on('camera-frame', handleCameraFrame);
    socket.on('face-recognition-result', handleRecognitionResult);

    return () => {
      socket.off('camera-frame', handleCameraFrame);
      socket.off('face-recognition-result', handleRecognitionResult);
    };
  }, [socket, selectedCamId]);

  // Mock mode simulator (dev only)
  useEffect(() => {
    if (!mockMode || import.meta.env.VITE_MOCK_MODE !== 'true') {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
        mockIntervalRef.current = null;
      }
      return;
    }

    let frameId = 0;
    mockIntervalRef.current = setInterval(() => {
      frameId++;
      drawFrame(MOCK_CLASSROOM_IMAGE);
      updateFps();

      setTimeout(() => {
        socket.emit('simulate-recognition', {
          cam_id: selectedCamId,
          faces: [
            { bbox: [100, 100, 200, 200], student_id: '312323247048', name: 'Mock Student A', confidence: 0.92 },
            { bbox: [300, 150, 400, 250], student_id: null, name: null, confidence: 0.65 }
          ]
        });
        
        // We'll directly call the handler for the mock mode here to reuse logic
        const faces = [
            { bbox: [100, 100, 200, 200], student_id: '312323247048', name: 'Mock Student A', confidence: 0.92 },
            { bbox: [300, 150, 400, 250], student_id: null, name: null, confidence: 0.65 }
        ];
        
        setLastOverlay({ faces });
        setFaceCount(faces.length);
        setLastDetectionTime(new Date());
        
        setDetectionLog(prev => {
          const newLogs = faces.map(f => ({
            id: Date.now() + Math.random(),
            name: f.name || 'Unknown',
            confidence: f.confidence,
            isUnknown: !f.student_id,
            time: new Date()
          }));
          return [...newLogs, ...prev].slice(0, 20);
        });
      }, 300);
    }, 1000);

    return () => {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
      }
    };
  }, [mockMode, selectedCamId]);

  // Draw frame to canvas
  const drawFrame = (imageBase64) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = new Image();

    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawOverlay(lastOverlay.faces);
    };

    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  };

  // Draw face overlays
  const drawOverlay = (faces) => {
    const canvas = canvasRef.current;
    if (!canvas || !faces || faces.length === 0) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Set Inter font for canvas
    ctx.font = '500 14px Inter, sans-serif';

    faces.forEach(face => {
      const [x1, y1, x2, y2] = face.bbox;
      const isUnknown = !face.student_id;

      // Draw bounding box
      ctx.strokeStyle = isUnknown ? '#EF4444' : '#10B981';
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw name label
      const label = face.name || 'Unknown';
      const confidence = face.confidence ? ` (${(face.confidence * 100).toFixed(0)}%)` : '';
      const text = label + confidence;

      const textWidth = ctx.measureText(text).width;
      const padding = 6;

      // Background
      ctx.fillStyle = isUnknown ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)';
      ctx.fillRect(x1, y1 - 28, textWidth + padding * 2, 28);

      // Text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x1 + padding, y1 - 8);
    });
  };

  // Update FPS counter
  const updateFps = () => {
    const now = Date.now();
    fpsCounterRef.current.frameCount++;

    if (now - fpsCounterRef.current.lastTime >= 1000) {
      setFps(fpsCounterRef.current.frameCount);
      fpsCounterRef.current.frameCount = 0;
      fpsCounterRef.current.lastTime = now;
    }
  };

  // Redraw overlay when it changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasImage = Array.from(imageData.data).some(val => val !== 0);

    if (hasImage) {
      drawOverlay(lastOverlay.faces);
    }
  }, [lastOverlay]);

  const selectedCamera = cameras.find(c => c.cam_id === selectedCamId);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left Column - Camera Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Top Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-3">
            {activeSession ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>ACTIVE — {activeSession.room_name} · {activeSession.period_name}</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-surface border border-subtle rounded-lg text-sm text-slate-500 font-medium uppercase tracking-wider">
                No Active Session — Monitoring Only
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {import.meta.env.VITE_MOCK_MODE === 'true' && (
              <button
                onClick={() => setMockMode(!mockMode)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  mockMode
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-surface text-slate-400 border border-subtle hover:bg-raised'
                }`}
              >
                {mockMode ? 'Mock Mode ON' : 'Mock Mode'}
              </button>
            )}
            <select
              value={selectedCamId || ''}
              onChange={(e) => setSelectedCamId(e.target.value)}
              className="bg-surface border border-subtle text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none"
            >
              <option value="">Select Camera</option>
              {cameras.map(cam => (
                <option key={cam.cam_id} value={cam.cam_id}>
                  {cam.room_name || `Camera ${cam.cam_id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative bg-black border border-blue-900/40 rounded-xl overflow-hidden shadow-xl aspect-video flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain"
          />
          
          {/* Fallback / No signal overlay */}
          {!fps && !mockMode && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
               <div className="absolute inset-0 w-full h-[2px] bg-blue-500/30 opacity-50 blur-[2px] shadow-[0_0_15px_#3b82f6] animate-[scan-line_4s_linear_infinite]" />
               <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
               </svg>
               <span className="text-slate-500 font-mono text-sm tracking-widest uppercase">Waiting for feed</span>
             </div>
          )}

          {/* HUD Bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pt-12 pb-3 px-4 flex items-center justify-between text-xs font-mono text-slate-300">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e] animate-pulse" />
                <span className="text-white">{fps}</span> <span>FPS</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-400">FACES</span>
                <span className="text-white">{faceCount}</span>
              </div>
            </div>
            {selectedCamera && (
              <div className="text-slate-500 uppercase">
                {selectedCamera.camera_ip}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Detection Log */}
      <div className="w-full lg:w-80 flex flex-col bg-surface border border-subtle rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-subtle bg-raised">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Detection Log</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {detectionLog.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3 opacity-50" />
              <span className="text-sm">Monitoring feed...</span>
            </div>
          ) : (
            detectionLog.map(log => (
              <div 
                key={log.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-raised border border-subtle slide-in-bottom"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${log.isUnknown ? 'bg-red-500' : 'bg-green-500'}`} />
                  <div>
                    <div className={`text-sm font-medium ${log.isUnknown ? 'text-red-400' : 'text-slate-200'}`}>
                      {log.name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {(log.confidence * 100).toFixed(1)}% Conf
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-500 font-mono text-right">
                  {log.time.toLocaleTimeString([], { hour12: false })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
