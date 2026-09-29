import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Badge from '../ui/Badge';

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchHealth = async () => {
    try {
      const { data } = await axios.get('/api/health');
      setHealth(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch health:', err);
      setHealth({
        status: 'error',
        services: {
          postgres: 'error',
          redis: 'error',
          ml: { status: 'error' }
        }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    // Poll every 10 seconds
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Running Diagnostics...</div>
      </div>
    );
  }

  const ServiceStatus = ({ name, status, details, icon }) => {
    const isHealthy = status === 'connected' || status === 'healthy';

    return (
      <div className="bg-raised border border-subtle rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-subtle">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {icon}
            </div>
            <h3 className="font-semibold text-slate-200 tracking-wide">{name}</h3>
          </div>
          {isHealthy ? <Badge variant="ACTIVE">Healthy</Badge> : <Badge variant="ENDED">Offline</Badge>}
        </div>

        {details ? (
          <div className="space-y-3 font-mono text-xs">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}:</span>
                <span className={`font-medium ${value === true ? 'text-green-400' : value === false ? 'text-red-400' : 'text-slate-300'}`}>
                  {typeof value === 'boolean'
                    ? (value ? 'YES' : 'NO')
                    : typeof value === 'object' && value !== null
                      ? JSON.stringify(value)
                      : String(value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 uppercase tracking-wider">Status Code:</span>
            <span className="text-slate-300">{status}</span>
          </div>
        )}
      </div>
    );
  };

  const isFullyHealthy = health?.status === 'healthy';

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">System Diagnostics</h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time infrastructure health and connectivity status.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {lastUpdate && (
            <span className="text-xs font-mono text-slate-500 hidden sm:inline-block">
              UPDATED: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchHealth}
            className="px-4 py-2 bg-surface border border-subtle text-slate-300 text-sm font-medium rounded-lg hover:text-white hover:bg-subtle transition-colors flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div className={`rounded-xl p-5 border ${
        isFullyHealthy
          ? 'bg-green-500/10 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
          : 'bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
      }`}>
        <div className="flex items-center">
          <div className="mr-4">
            {isFullyHealthy ? (
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping opacity-20"></div>
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20"></div>
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <h3 className={`text-lg font-semibold tracking-wide ${
              isFullyHealthy ? 'text-green-400' : 'text-red-400'
            }`}>
              {isFullyHealthy ? 'SYSTEM OPERATIONAL' : 'SERVICE DEGRADATION'}
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {isFullyHealthy
                ? 'All core services and pipelines are functioning normally.'
                : 'Critical infrastructure components are unreachable. Check logs.'}
            </p>
          </div>
        </div>
      </div>

      {/* Service Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <ServiceStatus
          name="PostgreSQL"
          status={typeof health?.services?.postgres === 'object' ? health?.services?.postgres?.status : health?.services?.postgres}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>}
        />

        <ServiceStatus
          name="Redis Node"
          status={typeof health?.services?.redis === 'object' ? health?.services?.redis?.status : health?.services?.redis}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
        />

        <ServiceStatus
          name="ML Pipeline"
          status={health?.services?.ml?.status}
          details={{
            gpu_accelerated: health?.services?.ml?.gpu_available,
            milvus_vector_db: health?.services?.ml?.milvus_connected
          }}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
        />

        <div className="bg-raised border border-subtle rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-subtle">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            </div>
            <h3 className="font-semibold text-slate-200 tracking-wide">Environment</h3>
          </div>
          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wider">Mode:</span>
              <span className="text-slate-300 font-medium">
                {import.meta.env.MODE || 'production'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wider">Ping:</span>
              <span className="text-slate-300 font-medium">
                {health?.timestamp ? `${new Date() - new Date(health.timestamp)}ms` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
