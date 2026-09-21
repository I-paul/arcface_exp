import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmAction from '../ui/ConfirmAction';
import EmptyState from '../ui/EmptyState';
import Badge from '../ui/Badge';

export default function AdminCameras() {
  const [cameras, setCameras] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    room_id: '',
    rtsp_url: '',
    is_active: true
  });
  const [editingCamera, setEditingCamera] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [camerasRes, roomsRes] = await Promise.all([
        axios.get('/api/cameras'),
        axios.get('/api/rooms')
      ]);
      setCameras(camerasRes.data);
      setRooms(roomsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingCamera) {
        await axios.put(`/api/cameras/${editingCamera.cam_id}`, {
          rtsp_url: formData.rtsp_url,
          is_active: formData.is_active
        });
      } else {
        await axios.post('/api/cameras', formData);
      }

      setShowForm(false);
      setFormData({ room_id: '', rtsp_url: '', is_active: true });
      setEditingCamera(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save camera:', err);
      alert(err.response?.data?.error || 'Failed to save camera');
    }
  };

  const handleEdit = (camera) => {
    setEditingCamera(camera);
    setFormData({
      room_id: camera.room_id,
      rtsp_url: camera.rtsp_url,
      is_active: camera.is_active
    });
    setShowForm(true);
  };

  const handleDelete = async (camId) => {
    try {
      await axios.delete(`/api/cameras/${camId}`);
      fetchData();
    } catch (err) {
      console.error('Failed to delete camera:', err);
      alert(err.response?.data?.error || 'Failed to delete camera');
    }
  };

  const handleToggleActive = async (camId, currentStatus) => {
    try {
      const camera = cameras.find(c => c.cam_id === camId);
      await axios.put(`/api/cameras/${camId}`, {
        rtsp_url: camera.rtsp_url,
        is_active: !currentStatus
      });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle camera status:', err);
      alert(err.response?.data?.error || 'Failed to update camera');
    }
  };

  const maskRtspUrl = (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        return url.replace(parsed.password, '****');
      }
      return url;
    } catch {
      return url;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Cameras...</div>
      </div>
    );
  }

  const inputClass = "w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider";

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Cameras</h2>
          <p className="text-sm text-slate-400 mt-1">Configure RTSP streams for room surveillance.</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingCamera(null);
            setFormData({ room_id: '', rtsp_url: '', is_active: true });
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Add Camera
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-raised border border-subtle rounded-xl p-5 shadow-inner slide-in-bottom">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4">
            {editingCamera ? 'Edit Camera' : 'Add New Camera'}
          </h3>
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className="flex items-end space-x-4">
              <div className="flex-1 max-w-xs">
                <label className={labelClass}>Room</label>
                <select
                  value={formData.room_id}
                  onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                  required={!editingCamera}
                  disabled={editingCamera}
                  className={`${inputClass} disabled:opacity-50`}
                >
                  <option value="">Select a room</option>
                  {rooms.map(room => (
                    <option key={room.room_id} value={room.room_id}>
                      {room.room_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className={labelClass}>RTSP URL</label>
                <input
                  type="text"
                  value={formData.rtsp_url}
                  onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
                  required
                  placeholder="rtsp://username:password@ip:554/stream"
                  className={`${inputClass} font-mono text-xs`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-500 bg-surface text-blue-500 focus:ring-blue-500/50"
                />
                <span className="ml-2 text-sm text-slate-300">Camera is active and recording</span>
              </label>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCamera(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-surface border border-subtle rounded-lg hover:bg-subtle hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingCamera ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Cameras Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full">
            <thead className="bg-subtle/30 border-b border-subtle sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Room
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  RTSP URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {cameras.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12">
                    <EmptyState 
                      title="No cameras configured"
                      description="Add a camera to a room to start detecting faces."
                      icon={
                        <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                  </td>
                </tr>
              ) : (
                cameras.map(camera => (
                  <tr key={camera.cam_id} className="hover:bg-raised transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                      {camera.room_name}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-400">
                      <div className="max-w-md truncate" title={maskRtspUrl(camera.rtsp_url)}>
                        {maskRtspUrl(camera.rtsp_url)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(camera.cam_id, camera.is_active)}
                        className="hover:scale-105 transition-transform"
                      >
                        {camera.is_active ? <Badge variant="ACTIVE">Active</Badge> : <Badge variant="SCHEDULED">Inactive</Badge>}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end items-center space-x-3">
                        <button
                          onClick={() => handleEdit(camera)}
                          className="text-blue-400 hover:text-blue-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Edit
                        </button>
                        <ConfirmAction
                          onConfirm={() => handleDelete(camera.cam_id)}
                          buttonText="Delete"
                          confirmText="Confirm"
                          buttonClass="text-red-400 hover:text-red-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                          confirmClass="text-red-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium"
                          cancelClass="text-slate-400 hover:text-slate-200 px-3 py-1 text-xs font-medium"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
