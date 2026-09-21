import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SessionCard from './SessionCard';
import EmptyState from './ui/EmptyState';

export default function SessionsPage({ socket }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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
      fetchSessions();
    } catch (err) {
      console.error('Failed to start session:', err);
      setError(err.response?.data?.error || 'Failed to start session');
    }
  };

  const handleEndSession = async (sessionId) => {
    try {
      await axios.post(`/api/sessions/${sessionId}/end`);
      fetchSessions();
    } catch (err) {
      console.error('Failed to end session:', err);
      setError(err.response?.data?.error || 'Failed to end session');
    }
  };

  const handleCancelSession = async (sessionId) => {
    try {
      await axios.post(`/api/sessions/${sessionId}/cancel`);
      fetchSessions();
    } catch (err) {
      console.error('Failed to cancel session:', err);
      setError(err.response?.data?.error || 'Failed to cancel session');
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Today's Sessions</h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <button
          onClick={() => navigate('/sessions/book')}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center shadow-lg shadow-blue-900/20"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Book Session
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions scheduled"
          description="Get started by booking a new session for today."
          action={{ label: 'Book Session', onClick: () => navigate('/sessions/book') }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map(session => (
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
