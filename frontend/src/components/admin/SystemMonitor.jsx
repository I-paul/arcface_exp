import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SystemMonitor() {
  const [backendStats, setBackendStats] = useState({ status: 'checking', connections: 0, latency: 0 });
  const [mlHealth, setMlHealth] = useState({ status: 'checking', gpu_available: false, milvus_connected: false, providers: null });
  const [milvusStats, setMilvusStats] = useState({ status: 'checking', total_count: 0, loading: true });
  const [systemLogs, setSystemLogs] = useState([]);

  const addLog = (message, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setSystemLogs((prev) => [{ time, message, type }, ...prev].slice(0, 50));
  };

  const fetchStats = async () => {
    // 1. Fetch Backend Stats
    const backendStart = Date.now();
    try {
      const res = await axios.get('/health');
      const latency = Date.now() - backendStart;
      setBackendStats({
        status: 'online',
        connections: res.data.connections || 0,
        latency,
      });
    } catch (err) {
      setBackendStats({ status: 'offline', connections: 0, latency: 0 });
      addLog('Backend API health check failed', 'error');
    }

    // 2. Fetch ML Service Stats (Direct port 8000 access if exposed, or fallback)
    try {
      const mlRes = await axios.get('http://localhost:8000/health');
      setMlHealth({
        status: 'online',
        gpu_available: mlRes.data.gpu_available,
        milvus_connected: mlRes.data.milvus_connected,
        providers: mlRes.data.runtime_providers,
      });

      // 3. Fetch Milvus Collection Stats
      try {
        const statsRes = await axios.get('http://localhost:8000/collection/stats');
        setMilvusStats({
          status: 'online',
          total_count: statsRes.data.total_count || statsRes.data.num_entities || 0,
          loading: false,
        });
      } catch (statsErr) {
        setMilvusStats({ status: 'online', total_count: 0, loading: false });
        addLog('Failed to query Milvus collection stats', 'warning');
      }
    } catch (err) {
      setMlHealth({ status: 'offline', gpu_available: false, milvus_connected: false, providers: null });
      setMilvusStats({ status: 'offline', total_count: 0, loading: false });
      addLog('ML Service endpoint is unreachable on port 8000', 'error');
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    addLog('System monitoring initialized', 'success');
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">System Monitor</h2>
        <p className="text-xs text-slate-400 mt-1">Real-time status updates and telemetry metrics across backend, ML and Milvus database containers.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Backend Server */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Backend API Server</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                backendStats.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {backendStats.status}
              </span>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-extrabold text-slate-100 font-mono">
                {backendStats.status === 'online' ? `${backendStats.latency}ms` : '—'}
              </span>
              <span className="text-xs text-slate-500">API Response Latency</span>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-xs">
            <span className="text-slate-400">Socket Connections</span>
            <span className="font-bold text-slate-200 font-mono">{backendStats.connections} active</span>
          </div>
        </div>

        {/* Card 2: ML Inference Engine */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ML Inference Engine</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                mlHealth.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {mlHealth.status}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${mlHealth.gpu_available ? 'bg-cyan-500 animate-pulse shadow-lg shadow-cyan-500/30' : 'bg-slate-700'}`}></div>
              <span className="text-sm font-bold text-slate-200">
                {mlHealth.status === 'online' 
                  ? (mlHealth.gpu_available ? 'CUDA GPU Enabled' : 'CPU Execution Fallback') 
                  : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-xs">
            <span className="text-slate-400">InsightFace Core</span>
            <span className="font-bold text-slate-200 font-mono">buffalo_l</span>
          </div>
        </div>

        {/* Card 3: Milvus Vector Store */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Milvus Database</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                mlHealth.milvus_connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {mlHealth.milvus_connected ? 'connected' : 'disconnected'}
              </span>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-extrabold text-slate-100 font-mono">
                {milvusStats.status === 'online' ? milvusStats.total_count : '—'}
              </span>
              <span className="text-xs text-slate-500">Enrolled Face Vectors</span>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800/60 pt-4 flex items-center justify-between text-xs">
            <span className="text-slate-400">Collection Name</span>
            <span className="font-bold text-slate-200 font-mono">face_embeddings</span>
          </div>
        </div>

      </div>

      {/* Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Provider Details */}
        <div className="bg-[#0f1422]/40 rounded-2xl border border-slate-800 p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            ONNX Runtime Providers
          </h3>
          {mlHealth.providers ? (
            <div className="space-y-3">
              {Object.entries(mlHealth.providers).map(([model, provList]) => (
                <div key={model} className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 font-mono">{model}</span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {provList.map((p) => (
                      <span key={p} className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                        p.includes('CUDA') ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center border border-dashed border-slate-850 rounded-xl">
              <span className="text-xs text-slate-500">No runtime metadata available (Service offline)</span>
            </div>
          )}
        </div>

        {/* Telemetry Log */}
        <div className="bg-[#0f1422]/40 rounded-2xl border border-slate-800 p-5 flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Telemetry Event Log
          </h3>
          <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-2 pr-2">
            {systemLogs.map((log, idx) => (
              <div key={idx} className="flex items-start space-x-2 border-b border-slate-900 pb-1.5">
                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                <span className={`px-1 rounded text-[8px] font-bold uppercase shrink-0 ${
                  log.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                  log.type === 'error' ? 'bg-rose-500/10 text-rose-400' :
                  log.type === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  {log.type}
                </span>
                <span className="text-slate-350">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
