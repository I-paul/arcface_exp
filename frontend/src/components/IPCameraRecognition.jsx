import React, { useEffect, useRef, useState } from 'react';

/**
 * IPCameraRecognition Component (Pure Stream Consumer)
 * 
 * Subscribes to the backend's WebSocket connection and listens for the 'face-recognition-result' event.
 * Displays the incoming real-time camera frames (imageBase64) and draws bounding box overlays with 
 * employee names and matching confidence scores.
 * 
 * Features:
 * - No webcam capture or frame emission (Pure stream consumer)
 * - Renders base64 frames directly onto HTML5 Canvas
 * - Overlays bounding boxes, employee names, and confidence scores
 * - Displays "Unknown" for unmatched faces
 */
export default function IPCameraRecognition({ socket }) {
  const canvasRef = useRef(null);
  
  // Telemetry and UI states
  const [isConnected, setIsConnected] = useState(false);
  const [activeCamera, setActiveCamera] = useState('IP Camera Ingestor');
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Performance telemetry helpers
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    // Track connection state
    setIsConnected(socket.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    // Listen to the face-recognition-result socket event
    const onFaceRecognitionResult = (payload) => {
      if (isPaused) return;
      if (!payload) return;

      const { imageBase64, camera, faces, detected_faces, timestamp } = payload;
      const faceList = faces || detected_faces || [];
      
      // Update statistics
      setFaceCount(faceList.length);
      if (camera?.name) {
        setActiveCamera(camera.name);
      } else if (payload.camera_id) {
        setActiveCamera(payload.camera_id);
      }

      // Calculate latency
      if (timestamp) {
        setLatency(Date.now() - new Date(timestamp).getTime());
      } else if (payload.requestTime) {
        setLatency(Date.now() - new Date(payload.requestTime).getTime());
      }

      // Frame counting for FPS calculation
      frameCountRef.current += 1;

      // Draw the frame and face overlays on the canvas
      if (imageBase64 && canvasRef.current) {
        renderFrameAndOverlays(imageBase64, faceList);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('face-recognition-result', onFaceRecognitionResult);

    // Calculate FPS over 1-second intervals
    fpsTimerRef.current = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('face-recognition-result', onFaceRecognitionResult);
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    };
  }, [socket, isPaused]);

  // --- Render Frame & Face Overlays onto HTML5 Canvas ---
  const renderFrameAndOverlays = (base64Data, facesList) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    // Normalize base64 image data header
    img.src = base64Data.startsWith('data:') 
      ? base64Data 
      : `data:image/jpeg;base64,${base64Data}`;

    img.onload = () => {
      // Sync canvas dimensions with the incoming image size
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      // Clear canvas and draw base camera frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw each face overlay
      facesList.forEach((face) => {
        if (!face.bbox || face.bbox.length !== 4) return;
        const [x1, y1, x2, y2] = face.bbox;
        const w = x2 - x1;
        const h = y2 - y1;

        // Resolve name and check if matched
        const isUnknown = !face.name || face.name.toLowerCase() === 'unknown' || face.name.toLowerCase() === 'unrecognized';
        const displayName = isUnknown ? 'Unknown' : face.name;
        
        // Match score percentage representation
        let scoreText = '';
        if (face.score !== undefined) {
          const scoreVal = face.score <= 1.0 ? face.score * 100 : face.score;
          scoreText = ` (${Math.round(scoreVal)}%)`;
        } else if (face.confidence !== undefined) {
          const confidenceVal = face.confidence <= 1.0 ? face.confidence * 100 : face.confidence;
          scoreText = ` (${Math.round(confidenceVal)}%)`;
        }

        const color = isUnknown ? '#F43F5E' : '#10B981'; // Rose red for unknown, Emerald green for recognized
        
        // 1. Draw Bracket-style corners around face
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        const cornerLen = Math.min(15, w / 4);

        // Top-Left
        ctx.beginPath(); ctx.moveTo(x1 + cornerLen, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + cornerLen); ctx.stroke();
        // Top-Right
        ctx.beginPath(); ctx.moveTo(x2 - cornerLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cornerLen); ctx.stroke();
        // Bottom-Left
        ctx.beginPath(); ctx.moveTo(x1 + cornerLen, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - cornerLen); ctx.stroke();
        // Bottom-Right
        ctx.beginPath(); ctx.moveTo(x2 - cornerLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cornerLen); ctx.stroke();

        // 2. Draw Label Banner Background
        ctx.fillStyle = color;
        const bannerHeight = 22;
        ctx.fillRect(x1 - 1, y1 - bannerHeight, w + 2, bannerHeight);

        // 3. Draw Name Tag text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${displayName.toUpperCase()}${scoreText}`, x1 + 6, y1 - 7);

        // 4. Draw employee/track ID footer under bounding box
        const idTag = face.person_id || face.emp_id || (face.track_id !== undefined ? `Track-${face.track_id}` : null);
        if (idTag) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '9px monospace';
          ctx.fillText(`ID: ${idTag}`, x1, y2 + 12);
        }
      });
    };
  };

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `AuraFace-StreamFrame-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span>Real-time IP Camera Feed</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Active Stream Source: <span className="text-slate-300 font-semibold">{activeCamera}</span>
          </p>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button 
            onClick={() => setIsPaused(!isPaused)} 
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              isPaused 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20' 
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700'
            }`}
          >
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </button>
          
          <button 
            onClick={handleSnapshot}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <span>Snap image</span>
          </button>
        </div>
      </div>

      {/* CANVAS DISPLAY WORKSPACE */}
      <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative aspect-video flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full object-cover"></canvas>
        
        {/* Scanning laser line overlay */}
        {isConnected && !isPaused && (
          <div className="absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none animate-[scan-line_4s_infinite_linear]"></div>
        )}

        {/* Connection Offline Overlay */}
        {!isConnected && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full border border-dashed border-rose-500/30 flex items-center justify-center mb-3 bg-rose-500/5 text-rose-400">
              <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-3.536 4.978 4.978 0 011.414-3.536m0 0L4 4" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-200">Offline: Awaiting Stream WebSocket...</p>
            <p className="text-[10px] text-slate-500 mt-1">Make sure the ingestor adapter and backend are running</p>
          </div>
        )}
        
        {/* HUD Telemetry stats */}
        {isConnected && (
          <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none text-white font-mono text-[9px] bg-gradient-to-t from-slate-950/20 via-transparent to-slate-950/20">
            <div className="flex justify-between items-start">
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-cyan-400">
                ACTIVE FEED: {activeCamera}
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                LATENCY: {latency}ms
              </div>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                STREAM FPS: {fps}
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>FACES IN STREAM: {faceCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
