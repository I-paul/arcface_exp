import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminOverview() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Job Lookup State
  const [jobId, setJobId] = useState('');
  const [jobData, setJobData] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState(null);

  const fetchHealth = async () => {
    try {
      const res = await axios.get('/api/health');
      setHealthData(res.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch system health statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleJobLookup = async (e) => {
    e.preventDefault();
    if (!jobId.trim()) return;

    try {
      setJobLoading(true);
      setJobError(null);
      setJobData(null);
      const res = await axios.get(`/api/job/${jobId.trim()}`);
      setJobData(res.data);
    } catch (err) {
      console.error(err);
      setJobError(err.response?.data?.message || 'Failed to fetch job payload. Ensure the Job ID is valid.');
    } finally {
      setJobLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Control Center Overview</h2>
          <p className="text-xs text-slate-400 mt-1">Global system telemetry, infrastructure heartbeats, and asynchronous job audit tools.</p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
          <input 
            type="checkbox" 
            id="autoRefresh"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4 rounded border-slate-800 text-orange-500 bg-slate-950 focus:ring-orange-500 focus:ring-offset-slate-900 focus:ring-2"
          />
          <label htmlFor="autoRefresh" className="text-xs text-slate-350 select-none cursor-pointer">
            Auto-refresh (10s)
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Health Indicator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Core System Status */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Status</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  healthData?.status === 'healthy' ? 'bg-emerald-500' : healthData ? 'bg-rose-500' : 'bg-slate-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  healthData?.status === 'healthy' ? 'bg-emerald-500' : healthData ? 'bg-rose-500' : 'bg-slate-500'
                }`}></span>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-100 uppercase tracking-wide">
              {loading ? 'LOADING...' : healthData?.status || 'UNKNOWN'}
            </p>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex flex-col gap-1 text-[10px] text-slate-500">
            <span>Last checked:</span>
            <span className="font-mono text-slate-400">
              {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>

        {/* PostgreSQL Database */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PostgreSQL</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  healthData?.services?.postgres?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  healthData?.services?.postgres?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-200">Relational DB</p>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Postgres Status</span>
            <span className={`font-extrabold uppercase ${
              healthData?.services?.postgres?.status === 'connected' ? 'text-emerald-400' : 'text-rose-450'
            }`}>
              {loading ? 'checking' : healthData?.services?.postgres?.status || 'offline'}
            </span>
          </div>
        </div>

        {/* Redis Queue */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Redis Cache / Queue</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  healthData?.services?.redis?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  healthData?.services?.redis?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-200">BullMQ Cache</p>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Redis Status</span>
            <span className={`font-extrabold uppercase ${
              healthData?.services?.redis?.status === 'connected' ? 'text-emerald-400' : 'text-rose-450'
            }`}>
              {loading ? 'checking' : healthData?.services?.redis?.status || 'offline'}
            </span>
          </div>
        </div>

        {/* Milvus DB */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Milvus DB</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  healthData?.services?.milvus?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  healthData?.services?.milvus?.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-200">Vector Index</p>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Milvus Status</span>
            <span className={`font-extrabold uppercase ${
              healthData?.services?.milvus?.status === 'connected' ? 'text-emerald-400' : 'text-rose-450'
            }`}>
              {loading ? 'checking' : healthData?.services?.milvus?.status || 'offline'}
            </span>
          </div>
        </div>

      </div>

      {/* Bottom section: Job Status Lookup Tool */}
      <div className="bg-[#0f1422]/50 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Background Worker Job Auditor
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">Audit background tasks processed by our BullMQ queues. Paste a Job ID below to inspect its execution payload.</p>
        </div>

        <form onSubmit={handleJobLookup} className="flex gap-3 max-w-lg">
          <input 
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Enter BullMQ Job ID (e.g. 1, 2, 3...)"
            className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            required
          />
          <button 
            type="submit"
            disabled={jobLoading}
            className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-450 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-5 shadow-lg shadow-orange-500/10"
          >
            {jobLoading ? 'Auditing...' : 'Lookup Payload'}
          </button>
        </form>

        {jobError && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-lg">
            {jobError}
          </div>
        )}

        {/* Display Job JSON Payload */}
        {jobData && (
          <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-5 font-mono text-xs text-slate-350 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <span className="font-bold text-slate-200">Job ID: {jobId}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                jobData.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                jobData.status === 'failed' ? 'bg-rose-500/10 text-rose-450' : 'bg-slate-850 text-slate-400 animate-pulse'
              }`}>
                {jobData.status}
              </span>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Progress</span>
                  <span className="font-bold text-slate-200">{jobData.progress}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Timestamp</span>
                  <span className="text-slate-300">{new Date(jobData.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Result Payload</span>
                <pre className="bg-[#0f1422] p-3 rounded-lg border border-slate-850 overflow-x-auto text-[11px] max-h-60">
                  {JSON.stringify(jobData.result || jobData.failedReason || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
