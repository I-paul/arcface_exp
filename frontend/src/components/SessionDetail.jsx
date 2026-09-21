import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Badge from './ui/Badge';
import StatCard from './ui/StatCard';

export default function SessionDetail({ socket }) {
  const { session_id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingStudent, setUpdatingStudent] = useState(null);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`/api/sessions/${session_id}`);
      setSession(data.session);
      setRoster(data.roster || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch session:', err);
      setError('Failed to load session data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, [session_id]);

  // Real-time attendance updates for active sessions
  useEffect(() => {
    if (!socket || !session || session.status !== 'ACTIVE') return;

    const handleAttendanceUpdate = (update) => {
      if (update.session_id !== session_id) return;

      setRoster(prev => prev.map(record =>
        record.student_id === update.student_id
          ? { ...record, status: update.status, detected_at: update.detected_at }
          : record
      ));
    };

    socket.on('session-attendance-update', handleAttendanceUpdate);

    return () => {
      socket.off('session-attendance-update', handleAttendanceUpdate);
    };
  }, [socket, session, session_id]);

  const handleMarkAttendance = async (studentId, newStatus) => {
    setUpdatingStudent(studentId);

    try {
      const { data } = await axios.put(
        `/api/sessions/${session_id}/attendance/${studentId}`,
        { status: newStatus }
      );

      setRoster(prev => prev.map(record =>
        record.student_id === studentId ? data : record
      ));
    } catch (err) {
      console.error('Failed to update attendance:', err);
      alert(err.response?.data?.error || 'Failed to update attendance');
    } finally {
      setUpdatingStudent(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Session Data...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center">
        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {error || 'Session not found'}
      </div>
    );
  }

  const presentCount = roster.filter(r => r.status === 'PRESENT').length;
  const absentCount = roster.filter(r => r.status === 'ABSENT').length;
  const totalCount = roster.length;
  const attendancePercent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  // Sort: PRESENT first, then ABSENT
  const sortedRoster = [...roster].sort((a, b) => {
    if (a.status === 'PRESENT' && b.status !== 'PRESENT') return -1;
    if (a.status !== 'PRESENT' && b.status === 'PRESENT') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/sessions')}
        className="flex items-center text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors group"
      >
        <svg className="w-4 h-4 mr-1 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Sessions
      </button>

      {/* Header Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-3 bg-surface border border-subtle rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100 mb-2">{session.period_name}</h1>
              <div className="flex items-center space-x-6 text-sm text-slate-400 font-medium">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {session.room_name}
                </div>
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(session.session_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {session.start_time} – {session.end_time}
                </div>
              </div>
            </div>
            <Badge variant={session.status}>{session.status}</Badge>
          </div>
          
          {session.actual_start && (
            <div className="mt-6 pt-4 border-t border-subtle flex items-center space-x-6 text-sm text-slate-500 font-mono">
              <div>
                <span className="text-slate-600 mr-2">START:</span>
                {new Date(session.actual_start).toLocaleTimeString()}
              </div>
              {session.actual_end && (
                <div>
                  <span className="text-slate-600 mr-2">END:</span>
                  {new Date(session.actual_end).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Column */}
        <div className="space-y-4">
          <StatCard label="Present" value={presentCount} sub={`/ ${totalCount}`} color="green" />
          <StatCard label="Absent" value={absentCount} sub={`/ ${totalCount}`} color="amber" />
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-subtle bg-raised flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Attendance Roster</h2>
          
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
            <span>{attendancePercent}% RATE</span>
            <div className="w-24 h-1.5 bg-subtle rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-500" 
                style={{ width: `${attendancePercent}%` }} 
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle/30 border-b border-subtle">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Student ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Detected At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {sortedRoster.map(record => (
                <tr key={record.student_id} className="hover:bg-raised transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-300">
                    {record.student_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                    {record.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={record.status} className="!text-[10px]">
                      {record.status}
                      {record.manually_marked && (
                        <svg className="w-3 h-3 ml-1.5 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      )}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-500">
                    {record.detected_at
                      ? new Date(record.detected_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {session.status !== 'CANCELLED' && (
                      <div className="flex items-center justify-end">
                        {record.status === 'ABSENT' ? (
                          <button
                            onClick={() => handleMarkAttendance(record.student_id, 'PRESENT')}
                            disabled={updatingStudent === record.student_id}
                            className="px-3 py-1.5 text-xs font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-md transition-colors disabled:opacity-50 border border-green-500/20"
                          >
                            Mark Present
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarkAttendance(record.student_id, 'ABSENT')}
                            disabled={updatingStudent === record.student_id}
                            className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-md transition-colors disabled:opacity-50 border border-amber-500/20 opacity-0 group-hover:opacity-100"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
