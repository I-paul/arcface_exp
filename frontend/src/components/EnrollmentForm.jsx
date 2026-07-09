import React, { useState, useRef } from 'react';
import axios from 'axios';

/**
 * EnrollmentForm Component
 * 
 * Renders an employee enrollment form featuring:
 * - Employee ID and Full Name validation
 * - Multi-image file uploader (supports drag-and-drop & file browser)
 * - Required count validation (Minimum 3, Maximum 5 files to match Backend and ML service schemas)
 * - Multipart/form-data submission using Axios to /api/enroll under the field name 'files'
 * - Graceful loading, success, and error feedback states
 */
export default function EnrollmentForm() {
  // Form input states
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  
  // Multiple files upload states
  const [files, setFiles] = useState([]); // Array of File objects
  const [previews, setPreviews] = useState([]); // Array of { id, url, name, size } objects
  const [isDragging, setIsDragging] = useState(false);
  
  // Feedback & Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [successToast, setSuccessToast] = useState(null); // stores { personId, employeeName }
  const [errorAlert, setErrorAlert] = useState(null);

  const fileInputRef = useRef(null);

  // --- File Selection Handlers ---
  const handleFilesAdded = (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validFiles = [];
    const validPreviews = [];
    const errors = [];

    // Convert FileList to Array
    const filesArray = Array.from(selectedFiles);

    // Limit check: Total files must not exceed 5
    if (files.length + filesArray.length > 5) {
      setErrorAlert('Maximum 5 images allowed for enrollment.');
      return;
    }

    filesArray.forEach((file) => {
      // Check image type
      if (!file.type.startsWith('image/')) {
        errors.push(`"${file.name}" is not an image file.`);
        return;
      }

      // Limit file size to 10MB
      const maxSizeBytes = 10 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        errors.push(`"${file.name}" exceeds the 10MB size limit.`);
        return;
      }

      // Add to temporary lists
      const fileId = Math.random().toString(36).substr(2, 9);
      validFiles.push(file);
      validPreviews.push({
        id: fileId,
        file: file, // Keep reference to file object
        url: URL.createObjectURL(file),
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2)
      });
    });

    if (errors.length > 0) {
      setErrorAlert(errors.join(' '));
      return;
    }

    setErrorAlert(null);
    setFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...validPreviews]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const removeFile = (idToRemove) => {
    const previewToRemove = previews.find(p => p.id === idToRemove);
    if (!previewToRemove) return;

    // Revoke object URL to avoid memory leaks
    URL.revokeObjectURL(previewToRemove.url);

    setPreviews((prev) => prev.filter(p => p.id !== idToRemove));
    setFiles((prev) => prev.filter(f => f !== previewToRemove.file));
  };

  // --- Form Reset Handler ---
  const handleReset = () => {
    setEmpId('');
    setName('');
    // Clear preview object URLs
    previews.forEach(p => URL.revokeObjectURL(p.url));
    setFiles([]);
    setPreviews([]);
    setErrorAlert(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- Form Submission Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!empId.trim() || !name.trim()) {
      setErrorAlert('Please fill in all text fields.');
      return;
    }
    
    // Backend requires at least 3 files
    if (files.length < 3) {
      setErrorAlert('Biometric registration requires at least 3 face images (Recommended 5) for model centroid matching.');
      return;
    }

    setIsLoading(true);
    setErrorAlert(null);
    setSuccessToast(null);

    // Create multipart/form-data package
    const formData = new FormData();
    formData.append('emp_id', empId.trim());
    formData.append('name', name.trim());
    
    // Append multiple files under 'files' key (plural to match backend)
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await axios.post('/api/enroll', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Extract details from backend response
      // Expecting { success: true, employee: { milvus_id, name } } or similar
      const employeeData = response.data?.employee;
      const personId = employeeData?.milvus_id || response.data?.person_id || 'N/A';
      
      setSuccessToast({
        personId: personId,
        employeeName: name.trim()
      });
      
      // Clean form fields upon success
      handleReset();
    } catch (err) {
      console.error('Enrollment request failure:', err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'An unexpected server error occurred during enrollment.';
      setErrorAlert(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      
      {/* Visual background accents */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <div className="mb-6 relative">
        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">Register Biometric Profile</h2>
        <p className="text-xs text-slate-400 mt-1">Enroll an employee's face template into the recognition database (Requires 3-5 images).</p>
      </div>

      {/* SUCCESS TOAST NOTIFICATION */}
      {successToast && (
        <div className="mb-5 bg-emerald-500/10 border-l-4 border-emerald-500 text-emerald-400 p-4 rounded-r-xl flex items-start justify-between animate-fade-in">
          <div className="flex space-x-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-bold text-slate-100">Enrollment Successful!</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Employee <span className="font-semibold text-slate-200">{successToast.employeeName}</span> enrolled.
              </p>
              <div className="mt-1.5 inline-block bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 text-[10px] font-mono text-cyan-400">
                Milvus Vector ID: {successToast.personId}
              </div>
            </div>
          </div>
          <button 
            type="button"
            className="text-slate-400 hover:text-slate-200 transition-colors ml-1"
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
              <p className="text-xs font-bold text-slate-100">Enrollment Error</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{errorAlert}</p>
            </div>
          </div>
          <button 
            type="button" 
            className="text-slate-400 hover:text-slate-200 transition-colors ml-1"
            onClick={() => setErrorAlert(null)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* FORM */}
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* TEXT INPUTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Employee ID */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee ID</label>
            <input 
              required
              disabled={isLoading}
              type="text" 
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="e.g. EMP-1049" 
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name</label>
            <input 
              required
              disabled={isLoading}
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith" 
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

        </div>

        {/* DRAG AND DROP FILE UPLOAD AREA */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Biometric Image Source (3-5 Images)</label>
            <span className={`text-[10px] font-semibold ${files.length >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
              Selected: {files.length} / 5
            </span>
          </div>
          
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isLoading && files.length < 5 && fileInputRef.current?.click()}
            className={`relative min-h-[140px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-5 text-center transition-all ${
              isLoading ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-950/20' :
              files.length >= 5 ? 'opacity-60 cursor-not-allowed border-slate-800 bg-slate-950/40' :
              isDragging ? 'border-blue-500 bg-blue-500/5' :
              'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-950/80 cursor-pointer'
            }`}
          >
            {/* Hidden native input */}
            <input 
              ref={fileInputRef}
              type="file" 
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFilesAdded(e.target.files)}
              disabled={isLoading || files.length >= 5}
            />

            <div className="space-y-2 pointer-events-none">
              <div className="mx-auto w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {files.length >= 5 ? 'Maximum files selected' : 'Drag & drop image files, or browse'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Requires 3 images (front, left, right profiles) | Max size 10MB per file</p>
              </div>
            </div>
          </div>
        </div>

        {/* THUMBNAIL LIST OF ADDED PREVIEWS */}
        {previews.length > 0 && (
          <div className="grid grid-cols-5 gap-3 bg-slate-950/50 border border-slate-800 p-4 rounded-xl">
            {previews.map((preview) => (
              <div key={preview.id} className="aspect-square bg-slate-900 border border-slate-800 rounded-lg relative overflow-hidden group">
                <img 
                  src={preview.url} 
                  alt={preview.name} 
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(preview.id)}
                  className="absolute top-1 right-1 w-4 h-4 bg-slate-950/80 hover:bg-slate-950 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors border border-slate-800"
                  title="Remove image"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {/* Image Details tooltip */}
                <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 text-[8px] text-slate-400 px-1 py-0.5 truncate pointer-events-none text-center">
                  {preview.size}MB
                </div>
              </div>
            ))}
            
            {/* Empty slots placeholders */}
            {Array.from({ length: Math.max(0, 5 - previews.length) }).map((_, idx) => (
              <div key={idx} className="aspect-square border border-dashed border-slate-850 rounded-lg flex items-center justify-center text-[10px] text-slate-700">
                Empty
              </div>
            ))}
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || files.length < 3}
            className={`w-full py-3.5 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              isLoading || files.length < 3
                ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 hover:shadow-blue-500/20 active:scale-98 shadow-lg shadow-blue-500/10 cursor-pointer'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Processing Face Biometrics...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>
                  {files.length < 3 
                    ? `Add ${3 - files.length} More Images to Register` 
                    : 'Register Biometric ID'}
                </span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
