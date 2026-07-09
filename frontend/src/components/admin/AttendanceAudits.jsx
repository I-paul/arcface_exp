import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AttendanceAudits() {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeMap, setEmployeeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [filterEmpId, setFilterEmpId] = useState('');
  const [filterCamId, setFilterCamId] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit, setLimit] = useState(100);

  const fetchEmployeesAndEvents = async () => {
    try {
      setLoading(true);
      // Fetch employees to map emp_id -> name
      const empRes = await axios.get('/api/employees');
      setEmployees(empRes.data);
      const mapping = {};
      empRes.data.forEach((e) => {
        mapping[e.emp_id] = e.name;
      });
      setEmployeeMap(mapping);

      // Build query string
      const params = {};
      if (filterEmpId) params.emp_id = filterEmpId;
      if (filterCamId) params.cam_id = filterCamId;
      if (filterSiteId) params.site_id = filterSiteId;
      if (filterAction) params.action = filterAction;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.limit = limit;

      const eventsRes = await axios.get('/api/attendance', { params });
      setEvents(eventsRes.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch audit data. Verify the API connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesAndEvents();
  }, [filterEmpId, filterCamId, filterSiteId, filterAction, startDate, endDate, limit]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Attendance Audits</h2>
        <p className="text-xs text-slate-400 mt-1">Audit verification logs, check-in intervals, and liveness check scores for employee attendance events.</p>
      </div>

      {/* Filter Controls Panel */}
      <div className="bg-[#0f1422]/60 backdrop-blur-md border border-slate-800 rounded-2xl p-5">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Audit Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          
          {/* Employee ID */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Employee ID</label>
            <select 
              value={filterEmpId}
              onChange={(e) => setFilterEmpId(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Employees</option>
              {employees.map((e) => (
                <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.emp_id})</option>
              ))}
            </select>
          </div>

          {/* Action */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Action Type</label>
            <select 
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Actions</option>
              <option value="IN">IN (Check-in)</option>
              <option value="OUT">OUT (Check-out)</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Start Date</label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">End Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="text-xs text-slate-500 animate-pulse">Loading audit table...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center space-y-2">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-slate-500">No attendance events matched your active filters.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Employee Details</th>
                  <th className="px-6 py-4">Location & Cam</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4 font-mono text-center">Confidence</th>
                  <th className="px-6 py-4 text-center">Liveness Check</th>
                  <th className="px-6 py-4">Event Date/Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-slate-250">{employeeMap[evt.emp_id] || 'Unknown Enrollee'}</p>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {evt.emp_id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-200">Site: {evt.site_id}</p>
                        <p className="text-[10px] text-slate-500 font-mono">Cam: {evt.cam_id.slice(0, 8)}...</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        evt.action === 'IN' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {evt.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-center font-bold text-slate-250">
                      {evt.similarity_score !== null 
                        ? `${(parseFloat(evt.similarity_score) * 100).toFixed(1)}%` 
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                        evt.liveness_passed === true ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                        evt.liveness_passed === false ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {evt.liveness_passed === true ? 'passed' :
                         evt.liveness_passed === false ? 'spoof alert' : 'skipped'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                      {new Date(evt.event_time).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
