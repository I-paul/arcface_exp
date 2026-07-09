import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

/**
 * WebcamEnrollment Component (Webcam & IP Camera Biometric Enrollment)
 * 
 * Supports capturing from either:
 * 1. Local USB Webcam (via browser getUserMedia)
 * 2. Network IP Camera (via HTTP MJPEG/JPEG stream URL)
 * 
 * When 'Capture & Register' is clicked, it compiles 5 snaps and submits them
 * as a multipart POST to /api/enroll under the 'files' form key.
 * Supports both automatic interval capture (1.5s delay) and manual snapping.
 */
export default function WebcamEnrollment() {
  const videoRef = useRef(null);
  const ipImageRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Form input states
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');

  // Source configuration states
  const [sourceType, setSourceType] = useState('ipcamera'); // Default to network IP camera
  const [ipAddress, setIpAddress] = useState('10.1.31.216');
  const [ipPort, setIpPort] = useState('8080');
  const [ipPath, setIpPath] = useState('/video');
  
  // Camera capture states
  const [cameraActive, setCameraActive] = useState(true);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0); // 0: Idle, 1-5: captured X frames
  const [capturedPreviews, setCapturedPreviews] = useState([]); // Visual previews of the 5 captured frames
  const [collectedBlobs, setCollectedBlobs] = useState([]);

  // Capture mode configuration
  const [captureMode, setCaptureMode] = useState('auto'); // 'auto' (interval) or 'manual' (click to snap)
  const [isCapturingManual, setIsCapturingManual] = useState(false);

  // Feedback & Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [successToast, setSuccessToast] = useState(null);
  const [errorAlert, setErrorAlert] = useState(null);

  const ipCameraUrl = `http://${ipAddress}:${ipPort}${ipPath}`;

  // --- Webcam lifecycle ---
  useEffect(() => {
    if (sourceType === 'webcam' && cameraActive) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log("Video play error:", e));
          }
        })
        .catch(err => {
          console.error("Webcam stream access failed:", err);
          setErrorAlert("Failed to start browser webcam. Verify permission settings.");
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

  // --- Helper to capture a single frame Blob ---
  const captureSingleFrameBlob = () => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        reject(new Error('Canvas element not ready'));
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      let captureSource = sourceType === 'webcam' ? videoRef.current : ipImageRef.current;
      let w = 640;
      let h = 480;

      if (sourceType === 'webcam' && captureSource) {
        w = captureSource.videoWidth;
        h = captureSource.videoHeight;
      } else if (sourceType === 'ipcamera' && captureSource) {
        w = captureSource.naturalWidth || 640;
        h = captureSource.naturalHeight || 480;
      }

      if (!captureSource) {
        reject(new Error('Stream source not ready'));
        return;
      }

      canvas.width = w;
      canvas.height = h;

      try {
        if (sourceType === 'webcam') {
          // Mirror draw
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(captureSource, 0, 0, canvas.width, canvas.height);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          ctx.drawImage(captureSource, 0, 0, canvas.width, canvas.height);
        }

        const previewUrl = canvas.toDataURL('image/jpeg', 0.85);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, previewUrl });
          } else {
            reject(new Error('Canvas toBlob generated null'));
          }
        }, 'image/jpeg', 0.85);

      } catch (err) {
        reject(err);
      }
    });
  };

  // --- Trigger Capture Sequence ---
  const startEnrollmentSequence = async (e) => {
    if (e) e.preventDefault();

    if (!empId.trim() || !name.trim()) {
      setErrorAlert('Please provide both Employee ID and Full Name.');
      return;
    }

    setErrorAlert(null);
    setSuccessToast(null);
    setCapturedPreviews([]);
    setCollectedBlobs([]);

    if (captureMode === 'manual') {
      setIsCapturingManual(true);
      setCaptureProgress(0);
      return;
    }

    // Auto Mode: Capture 5 frames at 1.5s intervals (increased time between snaps)
    const blobs = [];
    const previews = [];

    for (let step = 1; step <= 5; step++) {
      setCaptureProgress(step);
      
      // Trigger flash feedback
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 120);

      try {
        const { blob, previewUrl } = await captureSingleFrameBlob();
        blobs.push(blob);
        previews.push(previewUrl);
        setCapturedPreviews([...previews]);
      } catch (err) {
        console.error(`Frame capture step ${step} failed:`, err);
        setErrorAlert("Capture Error: Failed to grab frame. If using IP camera, ensure CORS cross-origin headers are configured.");
        setCaptureProgress(0);
        return;
      }

      // Wait 1.5 seconds between snaps to allow face angle adjustments
      if (step < 5) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setCaptureProgress(0);
    submitEnrollment(blobs);
  };

  // --- Capture Manual Snapshot ---
  const captureManualSnapshot = async () => {
    if (collectedBlobs.length >= 5) return;

    // Trigger flash feedback
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 120);

    try {
      const { blob, previewUrl } = await captureSingleFrameBlob();
      
      const newBlobs = [...collectedBlobs, blob];
      const newPreviews = [...capturedPreviews, previewUrl];
      
      setCollectedBlobs(newBlobs);
      setCapturedPreviews(newPreviews);
      setCaptureProgress(newBlobs.length);

      if (newBlobs.length === 5) {
        setIsCapturingManual(false);
        setCaptureProgress(0);
        submitEnrollment(newBlobs);
      }
    } catch (err) {
      console.error("Manual frame capture failed:", err);
      setErrorAlert("Capture Error: Failed to grab frame. Check camera or CORS permissions.");
    }
  };

  const cancelManualCapture = () => {
    setIsCapturingManual(false);
    setCaptureProgress(0);
    setCapturedPreviews([]);
    setCollectedBlobs([]);
  };

  // --- Submit Enrollment ---
  const submitEnrollment = async (blobsToSubmit) => {
    setIsLoading(true);

    // Build uploader FormData
    const formData = new FormData();
    formData.append('emp_id', empId.trim());
    formData.append('name', name.trim());

    // Append all 5 collected Blobs under exactly 'files' key name
    blobsToSubmit.forEach((blob, idx) => {
      const filename = `${empId.trim()}-webcam-${idx + 1}.jpg`;
      formData.append('files', blob, filename);
    });

    try {
      const response = await axios.post('/api/enroll', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const employeeData = response.data?.employee;
      const personId = employeeData?.milvus_id || response.data?.person_id || 'N/A';

      setSuccessToast({
        personId: personId,
        employeeName: name.trim()
      });

      // Reset text inputs
      setEmpId('');
      setName('');
      setCapturedPreviews([]);
      setCollectedBlobs([]);
    } catch (err) {
      console.error('Biometric registration error:', err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'An error occurred during registration.';
      setErrorAlert(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      
      {/* Background visual graphics */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="mb-6 relative">
        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">Webcam & IP Camera Enrollment</h2>
        <p className="text-xs text-slate-400 mt-1">Enrolls face signatures by capturing **5 frames** in sequence to match vector DB centroid quality checks.</p>
      </div>

      {/* SOURCE SWITCHER */}
      <div className="mb-5 p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl space-y-3 relative z-10">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stream Source Type</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSourceType('webcam'); setErrorAlert(null); setCapturedPreviews([]); }}
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
              onClick={() => { setSourceType('ipcamera'); setErrorAlert(null); setCapturedPreviews([]); }}
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

      {/* CAPTURE MODE SELECTOR */}
      <div className="mb-5 p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl flex items-center justify-between z-10 relative">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Capture Configuration</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isCapturingManual || isLoading}
            onClick={() => setCaptureMode('auto')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              captureMode === 'auto' 
                ? 'bg-orange-600 text-white' 
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto Snap (1.5s Delay)
          </button>
          <button
            type="button"
            disabled={isCapturingManual || isLoading}
            onClick={() => setCaptureMode('manual')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              captureMode === 'manual' 
                ? 'bg-orange-600 text-white' 
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual Snap
          </button>
        </div>
      </div>

      {/* SUCCESS TOAST */}
      {successToast && (
        <div className="mb-5 bg-emerald-500/10 border-l-4 border-emerald-500 text-emerald-400 p-4 rounded-r-xl flex items-start justify-between">
          <div className="flex space-x-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-bold text-slate-100">Enrollment Completed!</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Registered <span className="font-semibold text-slate-200">{successToast.employeeName}</span> in Postgres DB.
              </p>
              <div className="mt-1.5 inline-block bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 text-[10px] font-mono text-cyan-400">
                Milvus Person ID: {successToast.personId}
              </div>
            </div>
          </div>
          <button 
            type="button"
            className="text-slate-400 hover:text-slate-250 transition-colors ml-1"
            onClick={() => setSuccessToast(null)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ERROR ALERT */}
      {errorAlert && (
        <div className="mb-5 bg-rose-500/10 border-l-4 border-rose-500 text-rose-400 p-4 rounded-r-xl flex items-start justify-between">
          <div className="flex space-x-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs">{errorAlert}</div>
          </div>
          <button 
            type="button" 
            className="text-slate-400 hover:text-slate-200"
            onClick={() => setErrorAlert(null)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <form onSubmit={startEnrollmentSequence} className="space-y-5">
        
        {/* STREAM VIEWPORT */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {sourceType === 'webcam' ? 'Live Webcam Stream' : `Network IP Camera Stream (${ipCameraUrl})`}
          </label>
          <div className="relative bg-slate-950 rounded-xl aspect-video border border-slate-800 overflow-hidden flex items-center justify-center">
            
            {/* Webcam Source */}
            {sourceType === 'webcam' && (
              cameraActive ? (
                <video 
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  muted
                  playsInline
                />
              ) : (
                <div className="text-center p-4 text-slate-500 text-xs">
                  Camera feed inactive.
                  <button 
                    type="button"
                    onClick={() => setCameraActive(true)}
                    className="mt-2.5 block mx-auto px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-350 hover:text-white"
                  >
                    Start Stream
                  </button>
                </div>
              )
            )}

            {/* IP Camera Source */}
            {sourceType === 'ipcamera' && (
              <img
                ref={ipImageRef}
                src={ipCameraUrl}
                alt="IP Camera Feed"
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            )}

            {/* Shutter flash screen */}
            <div className={`absolute inset-0 bg-white transition-opacity duration-100 pointer-events-none ${shutterFlash ? 'opacity-90' : 'opacity-0'} z-20`}></div>

            {/* Silhouette guide overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="w-36 h-48 border border-dashed border-cyan-400/20 rounded-[50px] flex items-center justify-center">
                {captureProgress > 0 && (
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950/80 border border-cyan-400/30 px-3 py-1 rounded animate-pulse">
                    CAPTURED {captureProgress} / 5
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* THUMBNAIL PREVIEWS OF THE 5 CAPTURED FRAMES */}
        <div className="grid grid-cols-5 gap-2 bg-slate-950/50 border border-slate-800 p-4 rounded-xl">
          {Array.from({ length: 5 }).map((_, idx) => {
            const preview = capturedPreviews[idx];
            return (
              <div key={idx} className="aspect-square bg-slate-900 border border-slate-850 rounded-lg relative overflow-hidden flex flex-col items-center justify-center">
                {preview ? (
                  <img src={preview} className="w-full h-full object-cover" alt={`Capture step ${idx + 1}`} />
                ) : (
                  <div className="text-[9px] text-slate-700 font-semibold text-center leading-tight">
                    <div>Frame</div>
                    <div>{idx + 1}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FORM INPUTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee ID</label>
            <input 
              required
              disabled={isLoading || captureProgress > 0 || isCapturingManual}
              type="text" 
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="e.g. EMP-1049" 
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name</label>
            <input 
              required
              disabled={isLoading || captureProgress > 0 || isCapturingManual}
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith" 
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* CONTROLS (AUTOSNAP VS MANUALSNAP TAKING) */}
        <div className="pt-2">
          {isCapturingManual ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelManualCapture}
                className="flex-1 py-3.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancel Capture
              </button>
              <button
                type="button"
                onClick={captureManualSnapshot}
                className="flex-1 py-3.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-450 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/10"
              >
                Snap Frame ({collectedBlobs.length + 1}/5)
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isLoading || (sourceType === 'webcam' && !cameraActive) || captureProgress > 0}
              className={`w-full py-3.5 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                isLoading || (sourceType === 'webcam' && !cameraActive) || captureProgress > 0
                  ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 hover:shadow-blue-500/20 active:scale-98 shadow-lg shadow-blue-500/10 cursor-pointer'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Registering Biometric Profile...</span>
                </>
              ) : captureProgress > 0 ? (
                <span>Auto Capturing Facial Data...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>
                    {captureMode === 'manual' ? 'Start Manual Capture' : 'Start Auto Capture & Register'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

      </form>
      
      {/* Hidden capture canvas */}
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
}
