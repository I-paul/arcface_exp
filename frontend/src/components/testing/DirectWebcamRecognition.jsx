import React, { useEffect, useRef, useState } from 'react';

/**
 * DirectWebcamRecognition Component (Local Testing with IP Camera Support)
 * 
 * Accesses browser webcam stream or Network IP Camera feed.
 * Periodically captures frames and emits them over 'recognize-face' Socket.IO event.
 * Overlays bounding boxes, employee name, and scores on canvas.
 * 
 * Layout:
 * - Streamlined viewport height and side-panel results to fit together on screen.
 * - Defaults to Network IP Camera feed.
 */
export default function DirectWebcamRecognition({ socket }) {
  const videoRef = useRef(null);
  const ipImageRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const sendIntervalRef = useRef(null);

  // Connection and configuration states
  const [isConnected, setIsConnected] = useState(false);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [faces, setFaces] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // Source configuration states - default set to network IP camera ('ipcamera')
  const [sourceType, setSourceType] = useState('ipcamera');
  const [ipAddress, setIpAddress] = useState('10.1.31.216');
  const [ipPort, setIpPort] = useState('8080');
  const [ipPath, setIpPath] = useState('/video');

  // Compute full IP Camera stream URL
  const ipCameraUrl = `http://${ipAddress}:${ipPort}${ipPath}`;

  // --- WebSocket Connection status tracker ---
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
    if (sourceType === 'webcam' && cameraActive) {
      navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.log("Video play error:", e));
        }
      })
      .catch(err => {
        console.error("Camera access failed:", err);
        setErrorMsg("Failed to start browser webcam. Check permissions.");
        setCameraActive(false);
      });
    } else {
      stopWebcam();
    }

    return () => stopWebcam();
  }, [cameraActive, sourceType]);

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // --- WebSocket Result & Error Observers ---
  useEffect(() => {
    if (!socket) return;

    const onRecognitionResult = (payload) => {
      if (!payload) return;

      const rawFaces = [];
      if (payload.faces && Array.isArray(payload.faces)) {
        payload.faces.forEach((f) => {
          rawFaces.push({
            name: f.name || 'Unknown',
            score: f.score || f.confidence || 0.9,
            bbox: f.bbox
          });
        });
      } else if (payload.bbox) {
        rawFaces.push({
          name: payload.name || 'Unknown',
          score: payload.confidence || payload.score || 0.9,
          bbox: payload.bbox
        });
      } else if (payload.detected) {
        const nameVal = payload.name || 'Unknown';
        const scoreVal = payload.confidence || 0.9;
        rawFaces.push({
          name: nameVal,
          score: scoreVal,
          bbox: [180, 100, 320, 260]
        });
      }

      // Filter: Keep all recognized entries, but only ONE unknown entry
      const recognized = rawFaces.filter(f => f.name.toLowerCase() !== 'unknown' && f.name.toLowerCase() !== 'unrecognized');
      const unknowns = rawFaces.filter(f => f.name.toLowerCase() === 'unknown' || f.name.toLowerCase() === 'unrecognized');
      
      const filtered = [...recognized];
      if (unknowns.length > 0) {
        filtered.push(unknowns[0]);
      }

      setFaces(filtered);
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

    const renderCanvas = () => {
      const video = videoRef.current;
      const ipImg = ipImageRef.current;

      let drawSource = null;
      let width = 640;
      let height = 480;

      if (sourceType === 'webcam' && video && video.readyState === video.HAVE_ENOUGH_DATA) {
        drawSource = video;
        width = video.videoWidth;
        height = video.videoHeight;
      } else if (sourceType === 'ipcamera' && ipImg) {
        drawSource = ipImg;
        width = ipImg.naturalWidth || 640;
        height = ipImg.naturalHeight || 480;
      }

      if (canvas && drawSource) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Keep canvas dimensions synced
          if (canvas.width !== width) {
            canvas.width = width;
            canvas.height = height;
          }

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          try {
            // Draw active camera frame
            if (sourceType === 'webcam') {
              // Mirror webcam
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(drawSource, 0, 0, canvas.width, canvas.height);
              ctx.setTransform(1, 0, 0, 1, 0, 0);
            } else {
              // Standard draw for IP camera
              ctx.drawImage(drawSource, 0, 0, canvas.width, canvas.height);
            }

            // Bounding box overlays disabled per request. Direct video stream is displayed.
          } catch (drawErr) {
            // Draw error notice if canvas tainted by CORS
            ctx.fillStyle = '#F43F5E';
            ctx.font = '12px sans-serif';
            ctx.fillText("CORS Block: Cross-Origin Canvas Capture Blocked", 20, 40);
          }
        }
      }
      animationFrameId = requestAnimationFrame(renderCanvas);
    };

    renderCanvas();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [faces, sourceType]);

  // --- Capturing Frame and emitting base64 over Socket.IO ---
  useEffect(() => {
    if (!socket || !pipelineActive || (sourceType === 'webcam' && !cameraActive)) {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      setFaces([]);
      return;
    }

    sendIntervalRef.current = setInterval(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ipImg = ipImageRef.current;

      let captureSource = sourceType === 'webcam' ? video : ipImg;
      let width = 480;
      let height = 360;

      if (captureSource && isConnected) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
          try {
            if (sourceType === 'webcam') {
              tempCtx.translate(tempCanvas.width, 0);
              tempCtx.scale(-1, 1);
              tempCtx.drawImage(captureSource, 0, 0, tempCanvas.width, tempCanvas.height);
            } else {
              tempCtx.drawImage(captureSource, 0, 0, tempCanvas.width, tempCanvas.height);
            }
            
            const base64Image = tempCanvas.toDataURL('image/jpeg', 0.7);

            // Emit recognize-face
            socket.emit('recognize-face', {
              image: base64Image,
              camera_id: sourceType === 'webcam' ? 'Camera-LocalWebcam' : `IP-Cam-${ipAddress}`
            });
          } catch (e) {
            console.error("Pipeline frame capture CORS block:", e);
            setErrorMsg("CORS Block: Cannot capture frames from IP Camera. Ensure camera allows cross-origin access or configure local CORS proxy.");
            setPipelineActive(false);
          }
        }
      }
    }, 1500);

    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [socket, isConnected, pipelineActive, cameraActive, sourceType, ipAddress]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
      
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">Direct Webcam & IP Camera Recognition</h2>
        <p className="text-xs text-slate-400 mt-1">Directly test recognition channels using a USB Webcam or Network IP Camera feed.</p>
      </div>

      {/* SOURCE SWITCHER */}
      <div className="p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl space-y-3 relative z-10">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stream Source Type</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSourceType('webcam'); setErrorMsg(null); setFaces([]); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                sourceType === 'webcam' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              USB Webcam
            </button>
            <button
              type="button"
              onClick={() => { setSourceType('ipcamera'); setErrorMsg(null); setFaces([]); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                sourceType === 'ipcamera' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Network IP Camera
            </button>
          </div>
        </div>

        {/* IP Camera Configuration Form */}
        {sourceType === 'ipcamera' && (
          <div className="grid grid-cols-3 gap-2.5 pt-1.5 border-t border-slate-800/60">
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">IP Address</label>
              <input 
                type="text" 
                value={ipAddress} 
                onChange={(e) => setIpAddress(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-2 py-1 outline-none text-slate-350 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Port</label>
              <input 
                type="text" 
                value={ipPort} 
                onChange={(e) => setIpPort(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-2 py-1 outline-none text-slate-350 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Path URL</label>
              <input 
                type="text" 
                value={ipPath} 
                onChange={(e) => setIpPath(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-2 py-1 outline-none text-slate-350 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* ERROR MESSAGE */}
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

      {/* BALANCED SIDE-BY-SIDE VIEWPORT LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        
        {/* Stream / Camera Viewport (reduced height/size to prevent layout push) */}
        <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative aspect-video flex items-center justify-center max-h-[300px]">
          
          {/* Webcam stream */}
          {sourceType === 'webcam' && (
            cameraActive ? (
              <video 
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                muted
                playsInline
              />
            ) : (
              <div className="text-xs text-slate-500 z-10">Webcam inactive. Switch toggle to start stream.</div>
            )
          )}

          {/* IP Camera stream */}
          {sourceType === 'ipcamera' && (
            <img
              ref={ipImageRef}
              src={ipCameraUrl}
              alt="IP Camera Feed"
              className="hidden" // rendered to canvas
              crossOrigin="anonymous"
              onError={() => {
                console.error("IP Camera feed load error");
              }}
            />
          )}

          {/* Display Canvas */}
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover z-10"
          />

          {/* Laser scanner overlay */}
          {isConnected && pipelineActive && (
            <div className="absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none z-15 animate-[scan-line_4s_infinite_linear]"></div>
          )}

          {/* Offline notice */}
          {!isConnected && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-20">
              <p className="text-xs font-semibold text-slate-200">Offline: Awaiting Socket Connection...</p>
            </div>
          )}

          {/* HUD overlay */}
          {isConnected && (
            <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none text-white font-mono text-[9px] z-10">
              <div className="flex justify-between items-start">
                <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-cyan-400">
                  PIPELINE: {pipelineActive ? 'RUNNING' : 'IDLE'}
                </div>
              </div>
              
              <div className="flex justify-between items-end">
                <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                  GATEWAY: {sourceType === 'webcam' ? 'Camera-LocalWebcam' : `IP-Cam-${ipAddress}`}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recognition Results Side-Panel (aligned directly side-by-side) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between min-h-[220px] max-h-[300px]">
          <div>
            <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">Evaluation Result HUD</h3>
            <p className="text-[9px] text-slate-500 mt-0.5">Real-time socket pipeline verification feed</p>
          </div>

          <div className="flex-1 flex flex-col justify-start items-center py-4 overflow-y-auto space-y-4 max-h-[190px] w-full">
            {faces.length === 0 ? (
              <div className="text-center text-slate-600 text-xs">
                <div className="w-10 h-10 rounded-full border border-dashed border-slate-800 flex items-center justify-center mb-2 mx-auto">
                  <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span>Awaiting target lock...</span>
              </div>
            ) : (
              faces.map((face, index) => {
                const isUnknown = !face.name || face.name.toLowerCase() === 'unknown';
                const scorePct = face.score <= 1.0 ? Math.round(face.score * 100) : Math.round(face.score);
                return (
                  <div key={index} className="w-full text-center space-y-2.5 animate-[slide-in-bottom_0.2s_ease-out]">
                    <div className={`inline-block px-3.5 py-1.5 rounded-full border font-bold text-xs ${
                      isUnknown 
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}>
                      {isUnknown ? 'UNIDENTIFIED TARGET' : 'LOCK-ON: IDENTIFIED'}
                    </div>

                    <div className="text-xl font-extrabold text-slate-100 tracking-wide">
                      {face.name.toUpperCase()}
                    </div>

                    {!isUnknown && (
                      <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                        <span>Match Confidence:</span>
                        <span className="font-mono font-bold text-emerald-400">{scorePct}%</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="text-[9px] text-slate-600 font-mono text-center pt-2 border-t border-slate-900 flex justify-between">
            <span>SOCKET CHANNEL: recognize-face</span>
            <span>CONNECTED</span>
          </div>
        </div>

      </div>

      {/* CONTROLS SWITCH */}
      <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center space-x-3">
          <button 
            type="button"
            onClick={() => setPipelineActive(!pipelineActive)}
            disabled={!isConnected}
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
            <span className="text-[10px] text-slate-500">Sends base64 frames to the backend recognizer every 1.5s.</span>
          </div>
        </div>

        {sourceType === 'webcam' && (
          <button 
            onClick={() => setCameraActive(!cameraActive)}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold rounded-xl text-slate-350 hover:text-white transition-colors"
          >
            {cameraActive ? 'Deactivate Camera' : 'Activate Camera'}
          </button>
        )}
      </div>

    </div>
  );
}
