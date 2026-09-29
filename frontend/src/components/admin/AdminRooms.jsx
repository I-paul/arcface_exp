import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmAction from '../ui/ConfirmAction';
import EmptyState from '../ui/EmptyState';
import Badge from '../ui/Badge';
import { useToast } from '../ui/Toast';

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ room_name: '', default_students: [] });
  const [editingRoom, setEditingRoom] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const toast = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [roomsRes, camerasRes, studentsRes] = await Promise.all([
        axios.get('/api/rooms'),
        axios.get('/api/cameras'),
        axios.get('/api/students')
      ]);
      setRooms(roomsRes.data);
      setCameras(camerasRes.data);
      setStudents(studentsRes.data);
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
      if (editingRoom) {
        await axios.put(`/api/rooms/${editingRoom.room_id}`, formData);
        toast.success('Room updated');
      } else {
        await axios.post('/api/rooms', formData);
        toast.success('Room created');
      }

      setShowForm(false);
      setFormData({ room_name: '', default_students: [] });
      setEditingRoom(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save room:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save room');
    }
  };

  const handleEdit = (room) => {
    setEditingRoom(room);
    setFormData({ room_name: room.room_name, default_students: room.default_students || [] });
    setShowForm(true);
    setSearchTerm('');
  };

  const handleDelete = async (roomId) => {
    try {
      await axios.delete(`/api/rooms/${roomId}`);
      toast.success('Room deleted');
      fetchData();
    } catch (err) {
      console.error('Failed to delete room:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to delete room');
    }
  };

  const getRoomCamera = (roomId) => {
    return cameras.find(c => c.room_id === roomId);
  };

  const getFilteredStudents = () => {
    if (!searchTerm) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.student_id.toLowerCase().includes(term)
    );
  };

  const handleSelectAllStudents = () => {
    const filtered = getFilteredStudents();
    setFormData(prev => ({
      ...prev,
      default_students: Array.from(new Set([...prev.default_students, ...filtered.map(s => s.student_id)]))
    }));
  };

  const handleClearSelection = () => {
    setFormData(prev => ({ ...prev, default_students: [] }));
  };

  const handleStudentToggle = (studentId) => {
    setFormData(prev => ({
      ...prev,
      default_students: prev.default_students.includes(studentId)
        ? prev.default_students.filter(id => id !== studentId)
        : [...prev.default_students, studentId]
    }));
  };

  const filteredStudents = getFilteredStudents();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Rooms...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Rooms & Rosters</h2>
          <p className="text-sm text-slate-400 mt-1">Manage physical locations and default students.</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRoom(null);
            setFormData({ room_name: '', default_students: [] });
            setSearchTerm('');
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Room
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-raised border border-subtle rounded-xl p-5 shadow-inner slide-in-bottom space-y-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
            {editingRoom ? 'Edit Room & Roster' : 'Add New Room & Roster'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="max-w-md">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Room Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.room_name}
                onChange={(e) => setFormData({ ...formData, room_name: e.target.value })}
                required
                placeholder="e.g. Lab A"
                autoFocus
                className="w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none"
              />
            </div>

            <div>
              <div className="flex items-end justify-between mb-3">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider" style={{ marginBottom: 0 }}>
                  Default Roster Students
                </label>
                <div className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                  {formData.default_students.length} selected
                </div>
              </div>

              <div className="border border-subtle bg-base rounded-xl overflow-hidden max-w-2xl">
                <div className="flex items-center space-x-3 p-3 bg-raised border-b border-subtle">
                  <div className="relative flex-1">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name or ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg pl-9 pr-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllStudents}
                    className="px-3 py-2 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors whitespace-nowrap"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="px-3 py-2 text-xs font-medium text-slate-400 bg-surface hover:bg-raised hover:text-slate-200 border border-subtle rounded transition-colors"
                  >
                    Clear
                  </button>
                </div>

                <div className="h-64 overflow-y-auto p-2 space-y-1">
                  {filteredStudents.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500">
                      No students found
                    </div>
                  ) : (
                    filteredStudents.map(student => {
                      const isSelected = formData.default_students.includes(student.student_id);
                      return (
                        <label
                          key={student.student_id}
                          className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors border ${
                            isSelected 
                              ? 'bg-blue-500/10 border-blue-500/30' 
                              : 'bg-transparent border-transparent hover:bg-raised'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-base border-subtle'
                          }`}>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="ml-3 flex-1 flex items-baseline justify-between">
                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-100' : 'text-slate-300'}`}>
                              {student.name}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {student.student_id}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
              >
                {editingRoom ? 'Update Room' : 'Create Room'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRoom(null);
                  setFormData({ room_name: '', default_students: [] });
                }}
                className="px-6 py-2.5 text-sm font-medium text-slate-300 bg-surface border border-subtle rounded-lg hover:bg-subtle hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rooms Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full">
            <thead className="bg-subtle/30 border-b border-subtle sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Room Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Camera Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Roster Size
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12">
                    <EmptyState 
                      title="No rooms configured"
                      description="Add a room to start scheduling sessions."
                      icon={
                        <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rooms.map(room => {
                  const camera = getRoomCamera(room.room_id);
                  const rosterSize = room.default_students ? room.default_students.length : 0;
                  return (
                    <tr key={room.room_id} className="hover:bg-raised transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                        {room.room_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {camera ? (
                          camera.is_active ? <Badge variant="ACTIVE">Active</Badge> : <Badge variant="SCHEDULED">Inactive</Badge>
                        ) : (
                          <span className="text-sm font-mono text-slate-500">No camera</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-400">
                        {rosterSize} {rosterSize === 1 ? 'student' : 'students'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end items-center space-x-3">
                          <button
                            onClick={() => handleEdit(room)}
                            className="text-blue-400 hover:text-blue-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Edit
                          </button>
                          <ConfirmAction
                            onConfirm={() => handleDelete(room.room_id)}
                            buttonText="Delete"
                            confirmText="Confirm"
                            buttonClass="text-red-400 hover:text-red-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                            confirmClass="text-red-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium"
                            cancelClass="text-slate-400 hover:text-slate-200 px-3 py-1 text-xs font-medium"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
