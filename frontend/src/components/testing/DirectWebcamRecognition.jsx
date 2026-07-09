import React, { useEffect, useRef, useState } from 'react';

/**
 * DirectWebcamRecognition Component (Local Testing)
 * 
 * Accesses the user's browser webcam stream via HTML5 video.
 * Captures and sends frames to the backend 'recognize-face' channel at a 1.5s interval
 * when the "Activate Direct Socket Pipeline" toggle switch is active.
 * Overlays bounding boxes, labels, and match scores on an HTML5 canvas over the video feed.
 */
export default function DirectWebcamRecognition({ socket }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const sendIntervalRef = useRef(null);

  // Connection and configuration states
  const [isConnected, setIsConnected] = useState(false);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [faces, setFaces] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // --- WebSocket Connection Status Tracking ---
  useEffect(() => {
    if (!socket) return;
    setIsConnected(socket.connected);

    const onConnect = () => {
      setIsConnected(true);
      setErrorMsg(null);
    };
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  // --- Webcam lifecycle ---
  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.log("Video playback error:", e));
        }
      })
      .catch(err => {
        console.error("Camera access failed:", err);
        setErrorMsg("Failed to start local webcam. Check permissions.");
        setCameraActive(false);
      });
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
    }
  };

  // --- WebSocket Result & Error Observers ---
  useEffect(() => {
    if (!socket) return;

    // Listen to direct recognition responses
    const onRecognitionResult = (payload) => {
      if (!payload) return;

      // Extract bounding boxes from various possible response layouts
      const facesList = [];
      
      if (payload.faces && Array.isArray(payload.faces)) {
        payload.faces.forEach((f) => {
          if (f.bbox) {
            facesList.push({
              name: f.name || 'Unknown',
              score: f.score || f.confidence || 0.9,
              bbox: f.bbox
            });
          }
        });
      } else if (payload.bbox) {
        // Single face object payload
        facesList.push({
          name: payload.name || 'Unknown',
          score: payload.confidence || payload.score || 0.9,
          bbox: payload.bbox
        });
      } else if (payload.detected) {
        // Fallback: If recognized but coordinates are missing, draw center indicator
        const nameVal = payload.name || 'Unknown';
        const scoreVal = payload.confidence || 0.9;
        facesList.push({
          name: nameVal,
          score: scoreVal,
          bbox: [180, 100, 320, 260] // Placeholder centered box
        });
      }

      setFaces(facesList);
      setErrorMsg(null);
    };

    const onRecognitionError = (err) => {
      console.error('[Socket Recognition Error]:', err);
      setErrorMsg(err.message || 'Face recognition evaluation failed.');
    };

    socket.on('recognition-result', onRecognitionResult);
    socket.on('recognition-error', onRecognitionError);

    return () => {
      socket.off('recognition-result', onRecognitionResult);
      socket.off('recognition-error', onRecognitionError);
    };
  }, [socket]);

  // --- HTML5 Canvas drawing loop for Bounding Boxes ---
  useEffect(() => {
    let animationFrameId;
    const canvas = canvasRef.current;
    const video = videoRef.current;

    const renderCanvas = () => {
      if (canvas && video && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Keep canvas dimensions synced with the video element width/height
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // Clear previous canvas renders
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw bounding boxes on top
          faces.forEach((face) => {
            if (!face.bbox || face.bbox.length !== 4) return;
            
            const [x1, y1, x2, y2] = face.bbox;
            const w = x2 - x1;
            const h = y2 - y1;

            const isUnknown = !face.name || face.name.toLowerCase() === 'unknown' || face.name.toLowerCase() === 'unrecognized';
            const color = isUnknown ? '#F43F5E' : '#10B981'; // Red for unknown, green for recognized
            const scorePct = face.score <= 1.0 ? Math.round(face.score * 100) : Math.round(face.score);

            // Draw Corners
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            const len = Math.min(15, w / 4);

            // TL Corner
            ctx.beginPath(); ctx.moveTo(x1 + len, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + len); ctx.stroke();
            // TR Corner
            ctx.beginPath(); ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len); ctx.stroke();
            // BL Corner
            ctx.beginPath(); ctx.moveTo(x1 + len, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - len); ctx.stroke();
            // BR Corner
            ctx.beginPath(); ctx.moveTo(x2 - len, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - len); ctx.stroke();

            // Label background banner
            ctx.fillStyle = color;
            ctx.fillRect(x1 - 1, y1 - 20, w + 2, 20);

            // Text tag
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`${face.name.toUpperCase()} (${scorePct}%)`, x1 + 6, y1 - 7);
          });
        }
      }
      animationFrameId = requestAnimationFrame(renderCanvas);
    };

    renderCanvas();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [faces]);

  // --- Capturing Video Frame and emitting base64 over Socket.IO ---
  useEffect(() => {
    if (!socket || !pipelineActive || !cameraActive) {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      setFaces([]); // Reset boxes
      return;
    }

    // Capture frame at regular 1.5 second intervals
    sendIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (video && isConnected) {
        // Create an offline helper canvas to crop/render the mirrored webcam feed
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 480; // Compressed resolution for speed
        tempCanvas.height = 360;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
          // Draw video mirrored
          tempCtx.translate(tempCanvas.width, 0);
          tempCtx.scale(-1, 1);
          tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
          
          // Generate JPEG base64 string
          const base64Image = tempCanvas.toDataURL('image/jpeg', 0.7);

          // Emit over Socket.IO: event 'recognize-face'
          socket.emit('recognize-face', {
            image: base64Image,
            camera_id: 'Camera-LocalWebcam'
          });
        }
      }
    }, 1500);

    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [socket, isConnected, pipelineActive, cameraActive]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
      
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">Direct Webcam Recognition Testing</h2>
        <p className="text-xs text-slate-400 mt-1">Directly test backend recognition models using frames captured from your browser webcam.</p>
      </div>

      {/* ERROR MESSAGE NOTIFICATION */}
      {errorMsg && (
        <div className="bg-rose-500/10 border-l-4 border-rose-500 text-rose-400 p-4 rounded-r-xl flex items-start justify-between">
          <div className="flex space-x-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs">{errorMsg}</div>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-slate-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* WEBCAM VIEWPORT WITH CONTAINER OVERLAYS */}
      <div className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
        {cameraActive ? (
          <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            muted
            playsInline
          />
        ) : (
          <div className="text-xs text-slate-500 z-10">Webcam inactive. Switch toggle to start stream.</div>
        )}

        {/* HTML5 Canvas overlay for Bounding Boxes */}
        {cameraActive && (
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
          />
        )}

        {/* Laser scanner visual overlay */}
        {cameraActive && pipelineActive && isConnected && (
          <div className="absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none z-15 animate-[scan-line_4s_infinite_linear]"></div>
        )}

        {/* Offline notice */}
        {!isConnected && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-20">
            <p className="text-xs font-semibold text-slate-200">Offline: Awaiting Socket Connection...</p>
            <p className="text-[10px] text-slate-500 mt-1">Make sure the backend is active at Port 8000/3000</p>
          </div>
        )}

        {/* HUD Overlay elements */}
        {isConnected && cameraActive && (
          <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none text-white font-mono text-[9px] z-10">
            <div className="flex justify-between items-start">
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-cyan-400">
                PIPELINE STATUS: {pipelineActive ? 'EMITTING' : 'IDLE'}
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                ACTIVE GATE: Camera-LocalWebcam
              </div>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                PIPELINE INTERVAL: 1.5s
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>FACES IDENTIFIED: {faces.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTROLS AREA WITH PIPELINE TOGGLE SWITCH */}
      <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between">
        
        {/* Toggle Switch */}
        <div className="flex items-center space-x-3">
          <button 
            type="button"
            onClick={() => setPipelineActive(!pipelineActive)}
            disabled={!cameraActive || !isConnected}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              pipelineActive ? 'bg-blue-600' : 'bg-slate-800'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              pipelineActive ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
          <div className="text-left">
            <span className="text-xs font-bold text-slate-200 block">Activate Direct Socket Pipeline</span>
            <span className="text-[10px] text-slate-500">Starts emitting base64 frames to the backend recognizer.</span>
          </div>
        </div>

        {/* Camera Toggle Button */}
        <button 
          onClick={() => setCameraActive(!cameraActive)}
          className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold rounded-xl text-slate-350 hover:text-white transition-colors"
        >
          {cameraActive ? 'Deactivate Camera' : 'Activate Camera'}
        </button>
      </div>

    </div>
  );
}
