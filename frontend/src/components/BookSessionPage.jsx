import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function BookSessionPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    period_id: '',
    room_id: '',
    session_date: new Date().toISOString().split('T')[0],
    booked_by: '',
    student_ids: []
  });

  const [periods, setPeriods] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cameraWarning, setCameraWarning] = useState('');

  // Fetch initial data
  useEffect(() => {
    Promise.all([
      axios.get('/api/periods'),
      axios.get('/api/rooms'),
      axios.get('/api/students'),
      axios.get('/api/cameras')
    ])
      .then(([periodsRes, roomsRes, studentsRes, camerasRes]) => {
        setPeriods(periodsRes.data);
        setRooms(roomsRes.data);
        setStudents(studentsRes.data);
        setCameras(camerasRes.data);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setError('Failed to load form data');
      });
  }, []);

  // Check camera status and load default students when room changes
  useEffect(() => {
    if (!formData.room_id) {
      setCameraWarning('');
      return;
    }

    const roomCamera = cameras.find(c => c.room_id === formData.room_id && c.is_active);
    if (!roomCamera) {
      setCameraWarning('⚠️ This room has no active camera. Session monitoring will not work.');
    } else {
      setCameraWarning('');
    }
    
    // Load default students for the room
    const selectedRoom = rooms.find(r => r.room_id === formData.room_id);
    if (selectedRoom && selectedRoom.default_students) {
      setFormData(prev => ({
        ...prev,
        student_ids: selectedRoom.default_students
      }));
    }
  }, [formData.room_id, cameras, rooms]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStudentToggle = (studentId) => {
    setFormData(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter(id => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  const handleSelectAllStudents = () => {
    const filtered = getFilteredStudents();
    setFormData(prev => ({
      ...prev,
      student_ids: filtered.map(s => s.student_id)
    }));
  };

  const handleClearSelection = () => {
    setFormData(prev => ({ ...prev, student_ids: [] }));
  };

  const getFilteredStudents = () => {
    if (!searchTerm) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.student_id.toLowerCase().includes(term)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await axios.post('/api/sessions', formData);
      navigate('/sessions');
    } catch (err) {
      console.error('Failed to book session:', err);
      setError(err.response?.data?.error || 'Failed to book session');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = getFilteredStudents();
  const inputClass = "w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-shadow";
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <button
          onClick={() => navigate('/sessions')}
          className="p-2 text-slate-400 hover:text-slate-200 bg-surface border border-subtle rounded-lg hover:bg-raised transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Book Session</h1>
          <p className="text-sm text-slate-400 mt-1">Schedule a new classroom session for monitoring</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-surface border border-subtle rounded-xl p-6 md:p-8 space-y-8 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Period Selector */}
          <div>
            <label className={labelClass}>
              Period <span className="text-red-500">*</span>
            </label>
            <select
              name="period_id"
              value={formData.period_id}
              onChange={handleInputChange}
              required
              className={inputClass}
            >
              <option value="" disabled>Select a period</option>
              {periods.map(p => (
                <option key={p.period_id} value={p.period_id}>
                  {p.period_name} ({p.start_time} – {p.end_time})
                </option>
              ))}
            </select>
          </div>

          {/* Room Selector */}
          <div>
            <label className={labelClass}>
              Room <span className="text-red-500">*</span>
            </label>
            <select
              name="room_id"
              value={formData.room_id}
              onChange={handleInputChange}
              required
              className={inputClass}
            >
              <option value="" disabled>Select a room</option>
              {rooms.map(r => (
                <option key={r.room_id} value={r.room_id}>
                  {r.room_name}
                </option>
              ))}
            </select>
            {cameraWarning && (
              <p className="mt-2 text-xs text-amber-500 font-medium">{cameraWarning}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className={labelClass}>
              Session Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="session_date"
              value={formData.session_date}
              onChange={handleInputChange}
              required
              className={inputClass}
              style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Booked By */}
          <div>
            <label className={labelClass}>
              Faculty Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="booked_by"
              value={formData.booked_by}
              onChange={handleInputChange}
              required
              placeholder="Enter faculty name"
              className={inputClass}
            />
          </div>
        </div>

        {/* Student Selection */}
        <div>
          <div className="flex items-end justify-between mb-3">
            <label className={labelClass} style={{ marginBottom: 0 }}>
              Expected Students <span className="text-red-500">*</span>
            </label>
            <div className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
              {formData.student_ids.length} selected
            </div>
          </div>

          <div className="border border-subtle bg-base rounded-xl overflow-hidden">
            {/* Search & Actions bar */}
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

            {/* Student list */}
            <div className="h-64 overflow-y-auto p-2 space-y-1">
              {filteredStudents.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  No students found
                </div>
              ) : (
                filteredStudents.map(student => {
                  const isSelected = formData.student_ids.includes(student.student_id);
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

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-subtle">
          <button
            type="button"
            onClick={() => navigate('/sessions')}
            className="px-6 py-2.5 text-sm font-medium text-slate-300 bg-raised border border-subtle rounded-lg hover:bg-subtle hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || formData.student_ids.length === 0}
            className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {loading ? 'Booking...' : 'Book Session'}
          </button>
        </div>
      </form>
    </div>
  );
}
