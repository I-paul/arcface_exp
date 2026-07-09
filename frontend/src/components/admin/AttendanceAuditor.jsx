import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AttendanceAuditor() {
  // Summary Stats
  const [stats, setStats] = useState({ totalClockIns: 0, uniqueRecognized: 0, activeHours: 0 });
  const [employees, setEmployees] = useState([]);
  const [employeeMap, setEmployeeMap] = useState({});
  const [loadingStats, setLoadingStats] = useState(true);

  // Filter and Data states
  const [searchEmpId, setSearchEmpId] = useState('');
  const [auditData, setAuditData] = useState([]);
  const [loadingTable, setLoadingTable] = useState(true);
  const [error, setError] = useState(null);

  // Fetch employees on load to resolve names
  const fetchEmployees = async () => {
    try {
      const res = await axios.get('/api/employees');
      setEmployees(res.data);
      const mapping = {};
      res.data.forEach((e) => {
        mapping[e.emp_id] = e.name;
      });
      setEmployeeMap(mapping);
    } catch (err) {
      console.error('Failed to pre-fetch employees for name mapping:', err);
    }
  };

  const fetchSummaryStats = async () => {
    try {
      setLoadingStats(true);
      const res = await axios.get('/api/attendance/summary/today');
      const rows = res.data || [];

      // Calculate stats
      const uniqueRecognized = rows.length;
      let totalClockIns = 0;
      let earliest = null;
      let latest = null;

      rows.forEach((r) => {
        if (r.check_in_time) {
          totalClockIns++;
          const t = new Date(r.check_in_time).getTime();
          if (!earliest || t < earliest) earliest = t;
        }
        if (r.check_out_time) {
          const t = new Date(r.check_out_time).getTime();
          if (!latest || t > latest) latest = t;
        }
      });

      let activeHours = 0.0;
      if (earliest && latest) {
        activeHours = parseFloat(((latest - earliest) / (1000 * 60 * 60)).toFixed(1));
      }

      setStats({
        totalClockIns,
        uniqueRecognized,
        activeHours,
      });
    } catch (err) {
      console.error('Failed to fetch summary stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoadingTable(true);
      setError(null);
      
      if (searchEmpId.trim()) {
        // Timeline mode for specific user
        const res = await axios.get(`/api/attendance/employee/${searchEmpId.trim()}`);
        setAuditData(res.data || []);
      } else {
        // Global list mode
        const res = await axios.get('/api/attendance');
        setAuditData(res.data || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch audit data from database.');
    } finally {
      setLoadingTable(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchSummaryStats();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [searchEmpId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Attendance Auditor</h2>
        <p className="text-xs text-slate-400 mt-1">Verify chronological attendance timelines, operational metrics, and liveness audit logs.</p>
      </div>

      {/* Stats Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Stat 1: Total Clock Ins */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Today's Clock-Ins</span>
            <span className="text-3xl font-extrabold text-slate-150 font-mono">
              {loadingStats ? '—' : stats.totalClockIns}
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-3-3m0 0l3-3m-3 3h8m-13-8h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z" />
            </svg>
          </div>
        </div>

        {/* Stat 2: Unique Employees */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Unique Recognized</span>
            <span className="text-3xl font-extrabold text-slate-150 font-mono">
              {loadingStats ? '—' : stats.uniqueRecognized}
            </span>
          </div>
          <div className="w-12 h-12 bg-blue-500/10 rounded-xl border border-blue-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>

        {/* Stat 3: Active Operational Hours */}
        <div className="bg-[#0f1422]/60 backdrop-blur-md border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Active Hours Today</span>
            <span className="text-3xl font-extrabold text-slate-150 font-mono">
              {loadingStats ? '—' : `${stats.activeHours}h`}
            </span>
          </div>
          <div className="w-12 h-12 bg-orange-500/10 rounded-xl border border-orange-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

      </div>

      {/* Filter and Search Panel */}
      <div className="bg-[#0f1422]/50 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">Employee Audit Lookup</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Isolate an individual employee's chronological check-in timeline by choosing their ID below.</p>
        </div>
        <div className="shrink-0 w-full md:w-72">
          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Filter by Employee ID</label>
          <select 
            value={searchEmpId}
            onChange={(e) => setSearchEmpId(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-orange-500"
          >
            <option value="">All Employees (Global Audit Log)</option>
            {employees.map((e) => (
              <option key={e.emp_id} value={e.emp_id}>
                {e.name} ({e.emp_id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Audit Panel View Selector */}
      {searchEmpId ? (
        // Timeline isolated view
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 space-y-6">
          <div className="border-b border-slate-800/80 pb-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-200">Chronological Timeline</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Isolated records for employee {searchEmpId} ({employeeMap[searchEmpId]})</p>
            </div>
            <button 
              onClick={() => setSearchEmpId('')}
              className="text-xs text-orange-400 hover:text-orange-350 font-bold"
            >
              Clear Filter
            </button>
          </div>

          {loadingTable ? (
            <div className="h-48 flex items-center justify-center">
              <span className="text-xs text-slate-500 animate-pulse font-mono">Reconstructing timeline...</span>
            </div>
          ) : auditData.length === 0 ? (
            <div className="h-32 flex items-center justify-center">
              <span className="text-xs text-slate-500">No registered check-ins found for this employee.</span>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-slate-800 space-y-6 ml-4">
              {auditData.map((evt) => (
                <div key={evt.id} className="relative">
                  {/* Timeline Dot Indicator */}
                  <span className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center ${
                    evt.action === 'IN' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} />
                  
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-2 max-w-xl hover:border-slate-800 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        evt.action === 'IN' ? 'bg-emerald-500/10 text-emerald-450' : 'bg-amber-500/10 text-amber-450'
                      }`}>
                        {evt.action === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(evt.event_time).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-350 space-y-1">
                      <p>Checked at <strong className="text-slate-200">{new Date(evt.event_time).toLocaleDateString()}</strong></p>
                      <p className="text-[10px] text-slate-500">
                        Camera Source: <span className="font-mono text-slate-400">{evt.cam_id}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Site Location: <span className="font-mono text-slate-400">{evt.site_id}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Global audit log table view
        <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
          {loadingTable ? (
            <div className="h-48 flex items-center justify-center">
              <span className="text-xs text-slate-500 animate-pulse">Loading global audit records...</span>
            </div>
          ) : auditData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-2">
              <svg className="w-8 h-8 text-slate-650" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs text-slate-500">No historical attendance logs recorded in the system database.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Employee Name</th>
                    <th className="px-6 py-4">Employee ID</th>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Verification Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                  {auditData.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-200">
                        {employeeMap[evt.emp_id] || evt.name || 'Unknown Enrollee'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-850">
                          {evt.emp_id}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono">
                        {new Date(evt.event_time).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-semibold font-mono">
                        {evt.site_id} / Cam ({evt.cam_id.slice(0, 8)}...)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
