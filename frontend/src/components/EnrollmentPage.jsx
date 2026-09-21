import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function EnrollmentPage() {
  const [step, setStep] = useState(1); // 1: Select/Create Student, 2: Capture Photos, 3: Success
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [newStudentData, setNewStudentData] = useState({ student_id: '', name: '' });
  const [capturedImages, setCapturedImages] = useState([]);
  const [webcamActive, setWebcamActive] = useState(false);
  const [useIpCam, setUseIpCam] = useState(false);
  const [ipCamUrl, setIpCamUrl] = useState('http://192.168.1.3:8080');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enrolledStudent, setEnrolledStudent] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Fetch unenrolled students
  useEffect(() => {
    axios.get('/api/students')
      .then(res => {
        // Filter students without milvus_id (not enrolled for face recognition)
        const unenrolled = res.data.filter(s => !s.milvus_id);
        setStudents(unenrolled);
      })
      .catch(err => console.error('Failed to fetch students:', err));
  }, []);

  // Start webcam
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setWebcamActive(true);
      }
    } catch (err) {
      console.error('Failed to start webcam:', err);
      setError('Failed to access webcam. Please grant camera permissions.');
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setWebcamActive(false);
  };

  // Capture photo from webcam
  const capturePhoto = () => {
    if (!webcamActive) {
      setError('Cannot capture photo: Webcam is not active or permission was denied.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (blob) {
        const imageUrl = URL.createObjectURL(blob);
        setCapturedImages(prev => [...prev, { blob, url: imageUrl }]);
      }
    }, 'image/jpeg', 0.95);
  };

  // Remove captured image
  const removeImage = (index) => {
    setCapturedImages(prev => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Capture photo from IP Webcam
  const captureIpCamPhoto = async () => {
    if (!ipCamUrl) return;
    try {
      const snapshotUrl = `${ipCamUrl.replace(/\/$/, '')}/shot.jpg`;
      // Use proxy to avoid CORS
      const proxyUrl = `/api/proxy-snapshot?url=${encodeURIComponent(snapshotUrl)}`;
      
      const response = await axios.get(proxyUrl, { responseType: 'blob' });
      
      const blob = response.data;
      const imageUrl = URL.createObjectURL(blob);
      setCapturedImages(prev => [...prev, { blob, url: imageUrl }]);
    } catch (err) {
      console.error('Failed to capture IP cam photo:', err);
      setError('Failed to capture from IP Camera. Check URL or ensure the app is running.');
    }
  };

  // Submit enrollment
  const handleEnroll = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      // Determine student_id and name
      const studentId = selectedStudent?.student_id || newStudentData.student_id;
      const studentName = selectedStudent?.name || newStudentData.name;

      formData.append('student_id', studentId);
      formData.append('name', studentName);

      // Append images
      capturedImages.forEach((img, index) => {
        formData.append('files', img.blob, `photo_${index + 1}.jpg`);
      });

      const { data } = await axios.post('/api/enroll', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setEnrolledStudent(data.student);
      setStep(3);
      stopWebcam();
    } catch (err) {
      console.error('Enrollment failed:', err);
      // Extract the detailed message from the ML service via the backend
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.response?.data?.error || 'Enrollment failed. Please try again.';
      setError(`Enrollment Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset and start over
  const resetForm = () => {
    setStep(1);
    setSelectedStudent(null);
    setNewStudentData({ student_id: '', name: '' });
    setCapturedImages([]);
    setEnrolledStudent(null);
    setError(null);
    stopWebcam();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
      capturedImages.forEach(img => URL.revokeObjectURL(img.url));
    };
  }, []);

  const inputClass = "w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-shadow";
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Student Enrollment</h1>
        <p className="text-sm text-slate-400 mt-1">Enroll students for facial recognition monitoring</p>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center space-x-4 mb-8">
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
              step >= s 
                ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' 
                : 'bg-surface border-subtle text-slate-500'
            }`}>
              {s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-0.5 rounded-full ${step > s ? 'bg-blue-600' : 'bg-subtle'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center slide-in-bottom">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Step 1: Select or Create Student */}
      {step === 1 && (
        <div className="bg-surface border border-subtle rounded-xl p-6 md:p-8 shadow-xl slide-in-bottom">
          <h2 className="text-lg font-semibold text-slate-200 mb-6 flex items-center">
            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs mr-3">1</span>
            Identify Student
          </h2>

          <div className="space-y-6">
            <div>
              <label className={labelClass}>
                Select Existing Student
              </label>
              <select
                value={selectedStudent?.student_id || ''}
                onChange={(e) => {
                  const student = students.find(s => s.student_id === e.target.value);
                  setSelectedStudent(student || null);
                  setNewStudentData({ student_id: '', name: '' });
                }}
                className={inputClass}
              >
                <option value="">-- Choose from unenrolled students --</option>
                {students.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.name} ({s.student_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-subtle"></div>
              <span className="flex-shrink-0 px-4 text-xs font-medium text-slate-500 uppercase tracking-widest">Or create new</span>
              <div className="flex-grow border-t border-subtle"></div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Student ID</label>
                <input
                  type="text"
                  placeholder="e.g. 312323247048"
                  value={newStudentData.student_id}
                  onChange={(e) => {
                    setNewStudentData({ ...newStudentData, student_id: e.target.value });
                    setSelectedStudent(null);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newStudentData.name}
                  onChange={(e) => {
                    setNewStudentData({ ...newStudentData, name: e.target.value });
                    setSelectedStudent(null);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={() => {
                if (selectedStudent || (newStudentData.student_id && newStudentData.name)) {
                  setStep(2);
                  startWebcam();
                } else {
                  setError('Please select an existing student or provide ID and Name');
                }
              }}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Capture Photos */}
      {step === 2 && (
        <div className="bg-surface border border-subtle rounded-xl p-6 md:p-8 shadow-xl slide-in-bottom">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs mr-3">2</span>
              Capture Reference Photos
            </h2>
            <div className="text-sm font-medium text-slate-400">
              <span className={capturedImages.length >= 3 ? 'text-green-400' : 'text-amber-400'}>{capturedImages.length}</span> / 5 Max
            </div>
          </div>

          {/* Webcam / IP Cam feed */}
          <div className="mb-4">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => { setUseIpCam(false); startWebcam(); }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${!useIpCam ? 'bg-blue-600 text-white' : 'bg-surface border border-subtle text-slate-300 hover:bg-raised'}`}
              >
                Browser Webcam
              </button>
              <button
                onClick={() => { setUseIpCam(true); stopWebcam(); }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${useIpCam ? 'bg-blue-600 text-white' : 'bg-surface border border-subtle text-slate-300 hover:bg-raised'}`}
              >
                IP Webcam App
              </button>
            </div>

            {useIpCam && (
              <div className="mb-4 space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  IP Webcam URL
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={ipCamUrl}
                    onChange={(e) => setIpCamUrl(e.target.value)}
                    placeholder="e.g. http://192.168.1.100:8080"
                    className="flex-1 bg-base border border-subtle text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Enter the base URL shown in your IP Webcam app. Make sure your phone is on the same Wi-Fi.
                </p>
              </div>
            )}
          </div>

          <div className="mb-6 relative rounded-xl overflow-hidden bg-black border border-subtle aspect-video flex items-center justify-center shadow-inner group">
            {!useIpCam ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              ipCamUrl ? (
                <img
                  src={`${ipCamUrl.replace(/\/$/, '')}/video`}
                  alt="IP Camera Feed"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '';
                    e.target.alt = 'Stream unavailable. Check URL.';
                  }}
                />
              ) : (
                <div className="text-slate-500 font-mono text-sm uppercase tracking-widest">Awaiting URL...</div>
              )
            )}
            
            {/* Guide overlay */}
            <div className="absolute inset-0 border-2 border-dashed border-blue-500/30 m-8 rounded-full pointer-events-none" />
            
            <button
              onClick={useIpCam ? captureIpCamPhoto : capturePhoto}
              disabled={capturedImages.length >= 5 || (useIpCam && !ipCamUrl)}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-500 transition-colors disabled:bg-slate-700 disabled:text-slate-400 shadow-xl shadow-blue-900/30 flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              {capturedImages.length >= 5 ? 'Max Photos Reached' : 'Take Photo'}
            </button>
          </div>

          {/* Captured images preview */}
          {capturedImages.length > 0 && (
            <div className="mb-8">
              <div className="grid grid-cols-5 gap-3">
                {capturedImages.map((img, index) => (
                  <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-subtle">
                    <img
                      src={img.url}
                      alt={`Capture ${index + 1}`}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-red-600/90 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between border-t border-subtle pt-6">
            <button
              onClick={() => {
                setStep(1);
                stopWebcam();
                setCapturedImages([]);
              }}
              className="px-6 py-2.5 text-sm font-medium text-slate-300 bg-raised border border-subtle rounded-lg hover:bg-subtle hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleEnroll}
              disabled={capturedImages.length < 3 || loading}
              className="px-6 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : `Enroll Subject (${capturedImages.length})`}
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && enrolledStudent && (
        <div className="bg-surface border border-subtle rounded-xl p-8 shadow-xl text-center slide-in-bottom">
          <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-slate-100 mb-2">Subject Enrolled</h2>
          <p className="text-slate-400 mb-8">
            <span className="text-slate-200 font-medium">{enrolledStudent.name}</span> has been successfully registered to the vector database.
          </p>

          <div className="max-w-xs mx-auto bg-raised border border-subtle rounded-lg p-5 mb-8 text-left space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Student ID</span>
              <span className="font-mono text-slate-300">{enrolledStudent.student_id}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Name</span>
              <span className="font-medium text-slate-200">{enrolledStudent.name}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Vector ID</span>
              <span className="font-mono text-blue-400">#{enrolledStudent.milvus_id}</span>
            </div>
          </div>

          <button
            onClick={resetForm}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
          >
            Enroll Next Subject
          </button>
        </div>
      )}
    </div>
  );
}
