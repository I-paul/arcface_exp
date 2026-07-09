import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Simple regex to validate UUID v4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CameraManager() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCameraId, setEditCameraId] = useState(null);
  
  // Form Input fields
  const [camIdInput, setCamIdInput] = useState('');
  const [siteIdInput, setSiteIdInput] = useState('');
  const [rtspInput, setRtspInput] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/cameras');
      setCameras(res.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch hardware stream configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const openAddModal = () => {
    setEditCameraId(null);
    // Generate a default valid UUIDv4 so the user doesn't have to think of one, but let them customize it!
    setCamIdInput(generateUUIDv4());
    setSiteIdInput('');
    setRtspInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (camera) => {
    setEditCameraId(camera.cam_id);
    setCamIdInput(camera.cam_id);
    setSiteIdInput(camera.site_id || '');
    setRtspInput(camera.camera_label || '');
    setIsModalOpen(true);
  };

  // Helper to generate UUIDv4
  function generateUUIDv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validations
    if (!camIdInput.trim() || !siteIdInput.trim() || !rtspInput.trim()) {
      alert('All fields (Camera ID, Site ID, and RTSP URL) are required.');
      return;
    }

    if (!UUID_REGEX.test(camIdInput.trim())) {
      alert('Camera ID must be a valid UUID v4 format (e.g. 123e4567-e89b-12d3-a456-426614174000).');
      return;
    }

    try {
      setSubmitLoading(true);
      
      const payload = {
        cam_id: camIdInput.trim(),
        site_id: siteIdInput.trim(),
        camera_label: rtspInput.trim(), // mapping rtsp to camera_label for DB storage
        site_name: 'Edge Feed Site'
      };

      if (editCameraId) {
        // Edit Mode: PUT /api/cameras/:cam_id
        await axios.put(`/api/cameras/${editCameraId}`, payload);
      } else {
        // Create Mode: POST /api/cameras
        await axios.post('/api/cameras', payload);
      }

      setIsModalOpen(false);
      // Immediately refresh the table following successful mutation
      fetchCameras();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to save camera configuration. Check database/UUID uniqueness.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (camId) => {
    if (!window.confirm(`Are you sure you want to delete camera ${camId}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/cameras/${camId}`);
      // Immediately refresh the table following successful mutation
      fetchCameras();
    } catch (err) {
      console.error(err);
      alert('Failed to delete camera feed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Camera Feed Manager</h2>
          <p className="text-xs text-slate-400 mt-1">Configure physical hardware streams, register unique edge UUIDs, and monitor active pipeline ingestion statuses.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/10 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Register Camera
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Grid Table Container */}
      <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="text-xs text-slate-500 animate-pulse">Querying active ingestion feeds...</span>
          </div>
        ) : cameras.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center space-y-2">
            <svg className="w-8 h-8 text-slate-650" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-slate-500">No active hardware streams registered. Add one above.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Camera ID (UUID)</th>
                  <th className="px-6 py-4">Site Placement</th>
                  <th className="px-6 py-4">RTSP Connection URL</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                {cameras.map((cam) => {
                  const isRtsp = cam.camera_label?.startsWith('rtsp://') || cam.camera_label?.startsWith('http://') || cam.camera_label?.includes(':');
                  return (
                    <tr key={cam.cam_id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-slate-200 font-bold select-all bg-slate-950/60 px-2 py-1 rounded border border-slate-850">
                          {cam.cam_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-100 font-mono">{cam.site_id}</p>
                          <p className="text-[10px] text-slate-500">{cam.site_name || 'Site Registered'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-slate-400 text-xs truncate max-w-xs block" title={cam.camera_label}>
                          {cam.camera_label || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          active
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => openEditModal(cam)}
                            className="p-1.5 bg-slate-850 hover:bg-slate-800 rounded border border-slate-800 hover:border-slate-700 transition-all text-slate-400 hover:text-slate-200"
                            title="Edit Ingestion Feed"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => handleDelete(cam.cam_id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/10 hover:border-rose-500/30 transition-all text-rose-450 hover:text-rose-400"
                            title="De-register Feed"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1422] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/20">
              <h3 className="font-bold text-slate-100 text-sm">
                {editCameraId ? 'Edit Hardware Stream' : 'Register New Hardware Stream'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Camera ID (UUID v4)</label>
                <input 
                  type="text" 
                  value={camIdInput} 
                  onChange={(e) => setCamIdInput(e.target.value)}
                  placeholder="e.g. 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500 transition-colors"
                  required
                  disabled={!!editCameraId} // ID cannot be changed once created
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Site Location ID</label>
                <input 
                  type="text" 
                  value={siteIdInput} 
                  onChange={(e) => setSiteIdInput(e.target.value)}
                  placeholder="e.g. site-A"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">RTSP Connection URL</label>
                <input 
                  type="text" 
                  value={rtspInput} 
                  onChange={(e) => setRtspInput(e.target.value)}
                  placeholder="rtsp://username:password@ip_address:port/stream"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500 transition-colors"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800/60">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-350 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitLoading}
                  className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-450 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitLoading ? 'Registering...' : (editCameraId ? 'Save Changes' : 'Register Stream')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
