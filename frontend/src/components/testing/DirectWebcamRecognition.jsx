import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * DirectWebcamRecognition Component (Local Testing with IP Camera Support & HTTP Fallback)
 * 
 * Accesses browser webcam stream or Network IP Camera feed.
 * Periodically captures frames and emits them over 'recognize-face' Socket.IO event.
 * Also provides an HTTP Fallback Test button, posting the frame as 'file' to /api/recognize.
 * Overlays bounding boxes, employee name, and scores on canvas.
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

  // Source configuration states
  const [sourceType, setSourceType] = useState('webcam'); // 'webcam' or 'ipcamera'
  const [ipAddress, setIpAddress] = useState('192.168.1.50');
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
        facesList.push({
          name: payload.name || 'Unknown',
          score: payload.confidence || payload.score || 0.9,
          bbox: payload.bbox
        });
      } else if (payload.detected) {
        const nameVal = payload.name || 'Unknown';
        const scoreVal = payload.confidence || 0.9;
        facesList.push({
          name: nameVal,
          score: scoreVal,
          bbox: [180, 100, 320, 260]
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

            // Draw bounding boxes on top
            faces.forEach((face) => {
              if (!face.bbox || face.bbox.length !== 4) return;
              
              const [x1, y1, x2, y2] = face.bbox;
              const w = x2 - x1;
              const h = y2 - y1;

              const isUnknown = !face.name || face.name.toLowerCase() === 'unknown' || face.name.toLowerCase() === 'unrecognized';
              const color = isUnknown ? '#F43F5E' : '#10B981';
              const scorePct = face.score <= 1.0 ? Math.round(face.score * 100) : Math.round(face.score);

              // Draw Corners
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              const len = Math.min(15, w / 4);

              // TL
              ctx.beginPath(); ctx.moveTo(x1 + len, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + len); ctx.stroke();
              // TR
              ctx.beginPath(); ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len); ctx.stroke();
              // BL
              ctx.beginPath(); ctx.moveTo(x1 + len, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - len); ctx.stroke();
              // BR
              ctx.beginPath(); ctx.moveTo(x2 - len, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - len); ctx.stroke();

              // Banner
              ctx.fillStyle = color;
              ctx.fillRect(x1 - 1, y1 - 20, w + 2, 20);

              // Text
              ctx.fillStyle = '#000000';
              ctx.font = 'bold 10px sans-serif';
              ctx.fillText(`${face.name.toUpperCase()} (${scorePct}%)`, x1 + 6, y1 - 7);
            });
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

  // --- HTTP Fallback Evaluation to /api/recognize ---
  const handleHTTPEvaluate = () => {
    setErrorMsg(null);
    const video = videoRef.current;
    const ipImg = ipImageRef.current;
    
    let captureSource = sourceType === 'webcam' ? video : ipImg;
    if (!captureSource) {
      setErrorMsg("Active camera stream source not found.");
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    try {
      if (sourceType === 'webcam') {
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(captureSource, 0, 0, tempCanvas.width, tempCanvas.height);
      } else {
        tempCtx.drawImage(captureSource, 0, 0, tempCanvas.width, tempCanvas.height);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("CORS Block: Cannot capture frame for HTTP evaluation. Check IP camera cross-origin settings.");
      return;
    }

    tempCanvas.toBlob(async (blob) => {
      if (!blob) {
        setErrorMsg("Failed to generate image snapshot Blob.");
        return;
      }

      const formData = new FormData();
      // Requirement: Appending file to FormData under the key exactly as 'file' 
      // matching the Backend's uploadMemory.single('file') configuration:
      formData.append('file', blob, `${sourceType}-test-snapshot.jpg`);

      try {
        const response = await axios.post('/api/recognize', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const data = response.data;
        if (data.detected) {
          const scoreVal = data.confidence || 0.9;
          setFaces([{
            name: data.name || 'Unknown',
            score: scoreVal,
            bbox: data.bbox || [180, 100, 320, 260] // fallback center box
          }]);
        } else {
          setFaces([{
            name: 'Unknown',
            score: 0,
            bbox: [180, 100, 320, 260]
          }]);
        }
      } catch (err) {
        console.error('HTTP evaluation failed:', err);
        const errMsg = err.response?.data?.message || err.message || 'HTTP endpoint evaluation failed.';
        setErrorMsg(errMsg);
      }
    }, 'image/jpeg', 0.85);
  };

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

      {/* VIEWPORT AREA */}
      <div className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
        
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
                PIPELINE STATUS: {pipelineActive ? 'EMITTING' : 'IDLE'}
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                SOURCE: {sourceType === 'webcam' ? 'USB_WEBCAM' : 'IP_CAMERA'}
              </div>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-slate-400">
                GATEWAY: {sourceType === 'webcam' ? 'Camera-LocalWebcam' : `IP-Cam-${ipAddress}`}
              </div>
              <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-800 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>FACES FOUND: {faces.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTROLS SWITCH */}
      <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-wrap gap-4 items-center justify-between">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleHTTPEvaluate}
            className="px-4 py-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 text-xs font-bold rounded-xl transition-colors"
          >
            Trigger HTTP Fallback Test
          </button>

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

    </div>
  );
}
