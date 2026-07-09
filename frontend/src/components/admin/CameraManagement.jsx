import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function CameraManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCameraId, setEditCameraId] = useState(null);
  const [siteId, setSiteId] = useState('');
  const [siteName, setSiteName] = useState('');
  const [cameraLabel, setCameraLabel] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/cameras');
      setCameras(res.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch cameras. Ensure the API server is online.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const openAddModal = () => {
    setEditCameraId(null);
    setSiteId('');
    setSiteName('');
    setCameraLabel('');
    setIsModalOpen(true);
  };

  const openEditModal = (camera) => {
    setEditCameraId(camera.cam_id);
    setSiteId(camera.site_id || '');
    setSiteName(camera.site_name || '');
    setCameraLabel(camera.camera_label || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!siteId || !cameraLabel) {
      alert('Please fill in Site ID and Camera Label.');
      return;
    }

    try {
      setSubmitLoading(true);
      if (editCameraId) {
        // Update
        await axios.put(`/api/cameras/${editCameraId}`, {
          site_id: siteId,
          site_name: siteName,
          camera_label: cameraLabel,
        });
      } else {
        // Create
        await axios.post('/api/cameras', {
          site_id: siteId,
          site_name: siteName,
          camera_label: cameraLabel,
        });
      }
      setIsModalOpen(false);
      fetchCameras();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (camId) => {
    if (!window.confirm('Are you sure you want to delete this camera? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/cameras/${camId}`);
      fetchCameras();
    } catch (err) {
      console.error(err);
      alert('Failed to delete camera.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Camera Management</h2>
          <p className="text-xs text-slate-400 mt-1">Configure and manage RTSP and network IP camera ingestion sources linked to the AI recognition pipelines.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/10 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Camera Feed
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="text-xs text-slate-500 animate-pulse">Loading camera nodes...</span>
          </div>
        ) : cameras.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center space-y-2">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-slate-500">No cameras configured yet. Add your first feed above.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Camera Details</th>
                  <th className="px-6 py-4">Site Location</th>
                  <th className="px-6 py-4">Camera Unique ID</th>
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
                {cameras.map((cam) => (
                  <tr key={cam.cam_id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{cam.camera_label}</p>
                          <p className="text-[10px] text-slate-500">Live Streaming</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-200">{cam.site_name || 'Unassigned Site'}</p>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {cam.site_id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded border border-slate-850 select-all">
                        {cam.cam_id}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                      {new Date(cam.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => openEditModal(cam)}
                          className="p-1.5 bg-slate-850 hover:bg-slate-800 rounded border border-slate-800 hover:border-slate-700 transition-all text-slate-400 hover:text-slate-200"
                          title="Edit Camera"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(cam.cam_id)}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/10 hover:border-rose-500/30 transition-all text-rose-400 hover:text-rose-350"
                          title="Delete Camera"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1422] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/20">
              <h3 className="font-bold text-slate-100 text-sm">
                {editCameraId ? 'Modify Camera Node' : 'Register New Camera Node'}
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Camera Label</label>
                <input 
                  type="text" 
                  value={cameraLabel} 
                  onChange={(e) => setCameraLabel(e.target.value)}
                  placeholder="e.g. Front Entrance Inbound"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Site Unique ID</label>
                <input 
                  type="text" 
                  value={siteId} 
                  onChange={(e) => setSiteId(e.target.value)}
                  placeholder="e.g. site-A"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Site Friendly Name</label>
                <input 
                  type="text" 
                  value={siteName} 
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. HQ Main Office"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800/60">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitLoading}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitLoading ? 'Saving...' : (editCameraId ? 'Save Changes' : 'Register Camera')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
