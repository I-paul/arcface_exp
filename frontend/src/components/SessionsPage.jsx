import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SessionCard from './SessionCard';
import EmptyState from './ui/EmptyState';
import { useToast } from './ui/Toast';

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function SessionsPage({ socket }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const navigate = useNavigate();
  const toast = useToast();

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/sessions/today');
      setSessions(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStartSession = async (sessionId) => {
    try {
      await axios.post(`/api/sessions/${sessionId}/start`);
      toast.success('Session started');
      fetchSessions();
    } catch (err) {
      console.error('Failed to start session:', err);
      toast.error(err.response?.data?.error || 'Failed to start session');
    }
  };

  const handleEndSession = async (sessionId) => {
    try {
      await axios.post(`/api/sessions/${sessionId}/end`);
      toast.success('Session ended');
      fetchSessions();
    } catch (err) {
      console.error('Failed to end session:', err);
      toast.error(err.response?.data?.error || 'Failed to end session');
    }
  };

  const handleCancelSession = async (sessionId) => {
    try {
      await axios.post(`/api/sessions/${sessionId}/cancel`);
      toast.info('Session cancelled');
      fetchSessions();
    } catch (err) {
      console.error('Failed to cancel session:', err);
      toast.error(err.response?.data?.error || 'Failed to cancel session');
    }
  };

  const filteredSessions = statusFilter === 'ALL'
    ? sessions
    : sessions.filter(s => s.status === statusFilter);

  const statusCounts = sessions.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Sessions...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Today's Sessions</h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <button
          onClick={() => navigate('/sessions/book')}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center shadow-lg shadow-blue-900/20 self-start sm:self-auto"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Book Session
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto hide-scrollbar pb-1">
        {STATUS_FILTERS.map(f => {
          const count = f.key === 'ALL' ? sessions.length : (statusCounts[f.key] || 0);
          const isActive = statusFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-raised border border-transparent'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-subtle text-slate-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <EmptyState
          title={statusFilter === 'ALL' ? 'No sessions scheduled' : `No ${statusFilter.toLowerCase()} sessions`}
          description={statusFilter === 'ALL' ? 'Get started by booking a new session for today.' : 'Try a different filter or book a new session.'}
          action={statusFilter === 'ALL' ? { label: 'Book Session', onClick: () => navigate('/sessions/book') } : null}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          {filteredSessions.map(session => (
            <SessionCard
              key={session.session_id}
              session={session}
              onStart={handleStartSession}
              onEnd={handleEndSession}
              onCancel={handleCancelSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}
