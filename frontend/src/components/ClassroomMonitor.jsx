import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export default function ClassroomMonitor({ socket }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState(null);
  const [lastOverlay, setLastOverlay] = useState({ faces: [] });
  const [fps, setFps] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [lastDetectionTime, setLastDetectionTime] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [detectionLog, setDetectionLog] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [connected, setConnected] = useState(false);

  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const fpsCounterRef = useRef({ lastTime: Date.now(), frameCount: 0 });
  const overlayRef = useRef({ faces: [] });

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
      if (sessRes.data) {
        setTodaySessions(sessRes.data);
      }
    })
    .catch(err => console.error('Failed to fetch initial data:', err));

    const sessionInterval = setInterval(async () => {
      try {
        const { data } = await axios.get('/api/sessions/today');
        setTodaySessions(data || []);
      } catch {}
    }, 30000);

    return () => clearInterval(sessionInterval);
  }, []);

  useEffect(() => {
    if (!selectedCamId || todaySessions.length === 0) {
      setActiveSession(null);
      return;
    }
    const cam = cameras.find(c => c.cam_id === selectedCamId);
    if (!cam) { setActiveSession(null); return; }

    const active = todaySessions.find(s => s.room_id === cam.room_id && s.status === 'ACTIVE');
    setActiveSession(active || null);
  }, [selectedCamId, cameras, todaySessions]);

  useEffect(() => {
    if (!socket || !selectedCamId) return;
    socket.emit('watch-camera', selectedCamId);
    setFps(0);
    setFaceCount(0);
    setLastOverlay({ faces: [] });
    overlayRef.current = { faces: [] };
    setDetectionLog([]);
    setConnected(false);
    fpsCounterRef.current = { lastTime: Date.now(), frameCount: 0 };

    return () => socket.emit('watch-camera', null);
  }, [socket, selectedCamId]);

  useEffect(() => {
    if (!socket || !selectedCamId) return;

    const handleCameraFrame = (payload) => {
      if (payload.cam_id !== selectedCamId) return;
      if (!connected) setConnected(true);
      drawFrame(payload.imageBase64);
      updateFps();
    };

    const handleRecognitionResult = (payload) => {
      if (payload.cam_id !== selectedCamId) return;

      const faces = payload.faces || [];
      overlayRef.current = { faces };
      setLastOverlay({ faces });
      setFaceCount(faces.length);

      if (faces.length > 0) {
        setLastDetectionTime(new Date());
        setDetectionLog(prev => {
          const newLogs = faces.map(f => ({
            id: Date.now() + Math.random(),
            name: f.name || 'Unknown',
            confidence: f.confidence,
            isUnknown: !f.student_id,
            time: new Date()
          }));
          return [...newLogs, ...prev].slice(0, 30);
        });
      }
    };

    socket.on('camera-frame', handleCameraFrame);
    socket.on('face-recognition-result', handleRecognitionResult);

    return () => {
      socket.off('camera-frame', handleCameraFrame);
      socket.off('face-recognition-result', handleRecognitionResult);
    };
  }, [socket, selectedCamId, connected]);

  const drawFrame = useCallback((imageBase64) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = imgRef.current;

    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, overlayRef.current.faces);
    };

    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  }, []);

  const drawOverlay = (ctx, faces) => {
    if (!faces || faces.length === 0) return;
    ctx.font = '500 14px Inter, sans-serif';

    faces.forEach(face => {
      if (!face.bbox) return;
      const [x1, y1, x2, y2] = face.bbox;
      const isUnknown = !face.student_id;

      ctx.strokeStyle = isUnknown ? '#EF4444' : '#10B981';
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const label = face.name || 'Unknown';
      const confidence = face.confidence ? ` (${(face.confidence * 100).toFixed(0)}%)` : '';
      const text = label + confidence;
      const textWidth = ctx.measureText(text).width;
      const padding = 6;

      ctx.fillStyle = isUnknown ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)';
      ctx.fillRect(x1, y1 - 28, textWidth + padding * 2, 28);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x1 + padding, y1 - 8);
    });
  };

  const updateFps = () => {
    const now = Date.now();
    fpsCounterRef.current.frameCount++;
    if (now - fpsCounterRef.current.lastTime >= 1000) {
      setFps(fpsCounterRef.current.frameCount);
      fpsCounterRef.current.frameCount = 0;
      fpsCounterRef.current.lastTime = now;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasImage = Array.from(imageData.data).some(val => val !== 0);
    if (hasImage) {
      drawOverlay(ctx, lastOverlay.faces);
    }
  }, [lastOverlay]);

  const selectedCamera = cameras.find(c => c.cam_id === selectedCamId);

  const switchRoom = (camId) => {
    if (camId === selectedCamId) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSelectedCamId(camId);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Room Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
        {cameras.map(cam => {
          const isSelected = cam.cam_id === selectedCamId;
          const roomSession = todaySessions.find(s => s.room_id === cam.room_id && s.status === 'ACTIVE');
          return (
            <button
              key={cam.cam_id}
              onClick={() => switchRoom(cam.cam_id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all shrink-0 ${
                isSelected
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-raised border border-transparent'
              }`}
            >
              {roomSession && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              )}
              <span className="truncate max-w-[160px]">{cam.room_name || `Camera ${cam.cam_id.slice(0, 8)}`}</span>
            </button>
          );
        })}
        {cameras.length === 0 && (
          <div className="text-sm text-slate-500 font-medium">No cameras configured</div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left: Camera Feed */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Session Banner */}
          <div className="mb-3">
            {activeSession ? (
              <div className="flex items-center justify-between px-4 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-400 font-medium min-w-0">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <span className="truncate">
                    SESSION ACTIVE — {activeSession.period_name}
                  </span>
                </div>
                <span className="text-xs text-green-500/70 font-mono shrink-0 ml-3">
                  {activeSession.start_time} – {activeSession.end_time}
                </span>
              </div>
            ) : (
              <div className="flex items-center px-4 py-2.5 bg-surface border border-subtle rounded-lg">
                <svg className="w-4 h-4 text-slate-500 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-slate-500 font-medium">Monitoring — No active session</span>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="relative bg-black border border-blue-900/40 rounded-xl overflow-hidden shadow-xl aspect-video flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="w-full h-full object-contain"
            />

            {!connected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-slate-500 font-mono text-sm tracking-widest uppercase">
                  {selectedCamId ? 'Connecting to feed...' : 'Select a room'}
                </span>
              </div>
            )}

            {/* HUD */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pt-10 pb-3 px-4 flex items-center justify-between text-xs font-mono text-slate-300">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_5px_#22c55e] animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-white">{fps}</span> <span>FPS</span>
                </div>
                {faceCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-400">FACES</span>
                    <span className="text-white">{faceCount}</span>
                  </div>
                )}
                {activeSession && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-400">REC</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  </div>
                )}
              </div>
              {selectedCamera && (
                <div className="text-slate-500 truncate max-w-[200px]">
                  {selectedCamera.room_name}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Detection Sidebar */}
        <div className="w-full lg:w-72 flex flex-col bg-surface border border-subtle rounded-xl overflow-hidden shadow-lg max-h-[500px] lg:max-h-none">
          <div className="px-4 py-3 border-b border-subtle bg-raised flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Detection Log</h3>
            {activeSession ? (
              <span className="text-[10px] font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                MARKING
              </span>
            ) : (
              <span className="text-[10px] font-mono text-slate-500 bg-subtle px-2 py-0.5 rounded">
                WATCH ONLY
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {detectionLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center min-h-[200px]">
                <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3 opacity-50" />
                <span className="text-sm">Monitoring feed...</span>
                <span className="text-xs text-slate-600 mt-1">
                  {activeSession ? 'Attendance will be marked automatically' : 'Face detections will appear here'}
                </span>
              </div>
            ) : (
              detectionLog.map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-raised border border-subtle slide-in-bottom"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${log.isUnknown ? 'bg-red-500' : 'bg-green-500'}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${log.isUnknown ? 'text-red-400' : 'text-slate-200'}`}>
                        {log.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {(log.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
                    {log.time.toLocaleTimeString([], { hour12: false })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
