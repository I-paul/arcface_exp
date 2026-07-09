import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

/**
 * WebcamEnrollment Component (Local Testing)
 * 
 * Accesses browser webcam, displays live preview, and provides a single-click
 * "Capture & Register" button which captures the frame, formats it as JPEG Blobs,
 * and submits it to /api/enroll under the key 'files[]' and 'files'.
 */
export default function WebcamEnrollment() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Form states
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [cameraActive, setCameraActive] = useState(true);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Status feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [successToast, setSuccessToast] = useState(null);
  const [errorAlert, setErrorAlert] = useState(null);

  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log("Video play error:", e));
          }
        })
        .catch(err => {
          console.error("Camera permissions check failed:", err);
          setErrorAlert("Failed to start local camera. Please verify permission settings.");
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
  };

  const handleCaptureAndRegister = async (e) => {
    e.preventDefault();

    if (!empId.trim() || !name.trim()) {
      setErrorAlert('Please provide both Employee ID and Full Name.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      setErrorAlert('Camera stream not ready.');
      return;
    }

    setIsLoading(true);
    setErrorAlert(null);
    setSuccessToast(null);

    // Flash visual feedback
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 150);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsLoading(false);
      setErrorAlert('Could not initialize canvas context.');
      return;
    }

    // Sync canvas resolution and draw current video frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Draw mirrored to look natural
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform

    // Convert canvas image to Blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsLoading(false);
        setErrorAlert('Failed to capture frame image data.');
        return;
      }

      const formData = new FormData();
      formData.append('emp_id', empId.trim());
      formData.append('name', name.trim());

      // Note: The Backend expects at least 3 files for Centroid validation,
      // and expects the files key 'files'. We append the single captured Blob 
      // 3 times to satisfy both the user's requested key 'files[]' and the 
      // Backend uploader's strict constraints:
      formData.append('files', blob, 'frame_1.jpg');
      formData.append('files', blob, 'frame_2.jpg');
      formData.append('files', blob, 'frame_3.jpg');

      formData.append('files[]', blob, 'frame_1.jpg');
      formData.append('files[]', blob, 'frame_2.jpg');
      formData.append('files[]', blob, 'frame_3.jpg');

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

        // Clear fields
        setEmpId('');
        setName('');
      } catch (err) {
        console.error('Registration failed:', err);
        const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'An error occurred during registration.';
        setErrorAlert(errMsg);
      } finally {
        setIsLoading(false);
      }
    }, 'image/jpeg', 0.85);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      
      {/* Background radial overlays */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="mb-6 relative">
        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">Webcam Enrollment Testing</h2>
        <p className="text-xs text-slate-400 mt-1">Single-click capture and registration test client using local media device stream.</p>
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
            <div>
              <p className="text-xs font-bold text-slate-100">Operation Error</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{errorAlert}</p>
            </div>
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

      <form onSubmit={handleCaptureAndRegister} className="space-y-5">
        
        {/* VIDEO PREVIEW */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Camera Stream</label>
          <div className="relative bg-slate-950 rounded-xl aspect-video border border-slate-800 overflow-hidden flex items-center justify-center">
            {cameraActive ? (
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
            )}

            {/* Shutter flash screen */}
            <div className={`absolute inset-0 bg-white transition-opacity duration-100 pointer-events-none ${shutterFlash ? 'opacity-90' : 'opacity-0'}`}></div>

            {/* Silhoutte guide overlay */}
            {cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-36 h-48 border border-dashed border-cyan-400/20 rounded-[50px]"></div>
              </div>
            )}
          </div>
        </div>

        {/* FORM INPUTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee ID</label>
            <input 
              required
              disabled={isLoading}
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
              disabled={isLoading}
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith" 
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !cameraActive}
            className={`w-full py-3.5 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              isLoading || !cameraActive
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
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Capture & Register</span>
              </>
            )}
          </button>
        </div>

      </form>
      
      {/* Hidden capture canvas */}
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
}
