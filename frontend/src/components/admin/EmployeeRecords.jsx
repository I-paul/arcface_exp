import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function EmployeeRecords() {
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/employees');
      setEmployees(res.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch employee records. Ensure the API server is online.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleDelete = async (empId) => {
    if (!window.confirm(`Are you sure you want to delete employee ${empId}? This will remove them from the database and clear all linked face embeddings from Milvus.`)) {
      return;
    }

    try {
      await axios.delete(`/api/employees/${empId}`);
      fetchEmployees();
    } catch (err) {
      console.error(err);
      alert('Failed to delete employee record.');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.emp_id.toLowerCase().includes(q) ||
      (emp.milvus_id && String(emp.milvus_id).includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Employee Records</h2>
          <p className="text-xs text-slate-400 mt-1">Manage enrolled employees, audit vector linkage IDs, or remove system enrollments.</p>
        </div>
        <div className="relative shrink-0 w-full sm:w-64">
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, ID or Milvus key..."
            className="w-full bg-[#0f1422]/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="bg-[#0f1422]/60 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="text-xs text-slate-500 animate-pulse">Loading employee database...</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center space-y-2">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-xs text-slate-500">
              {searchQuery ? 'No employees matching your search query.' : 'No enrolled employees found. Enrol employees first.'}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Employee Details</th>
                  <th className="px-6 py-4">Employee Code</th>
                  <th className="px-6 py-4">Milvus DB Ref (Vector ID)</th>
                  <th className="px-6 py-4">Enrollment Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.emp_id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center shrink-0 font-bold text-slate-200">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{emp.name}</p>
                          <p className="text-[10px] text-slate-500">Face Vector Template Loaded</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-slate-200 font-semibold bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                        {emp.emp_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded border border-slate-850 select-all">
                        {emp.milvus_id || 'Legacy Key (No DB Ref)'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                      {new Date(emp.enrolled_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => handleDelete(emp.emp_id)}
                          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl border border-rose-500/10 hover:border-rose-500/30 transition-all text-rose-400 hover:text-rose-350 text-[10px] font-bold"
                          title="Revoke Record"
                        >
                          Revoke
                        </button>
                      </div>
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
