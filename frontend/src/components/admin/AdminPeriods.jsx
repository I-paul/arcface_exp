import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmAction from '../ui/ConfirmAction';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../ui/Toast';

export default function AdminPeriods() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    period_name: '',
    start_time: '',
    end_time: ''
  });
  const [editingPeriod, setEditingPeriod] = useState(null);
  const toast = useToast();

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/periods');
      setPeriods(data);
    } catch (err) {
      console.error('Failed to fetch periods:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingPeriod) {
        await axios.put(`/api/periods/${editingPeriod.period_id}`, formData);
        toast.success('Period updated');
      } else {
        await axios.post('/api/periods', formData);
        toast.success('Period created');
      }

      setShowForm(false);
      setFormData({ period_name: '', start_time: '', end_time: '' });
      setEditingPeriod(null);
      fetchPeriods();
    } catch (err) {
      console.error('Failed to save period:', err);
      toast.error(err.response?.data?.error || 'Failed to save period');
    }
  };

  const handleEdit = (period) => {
    setEditingPeriod(period);
    setFormData({
      period_name: period.period_name,
      start_time: period.start_time,
      end_time: period.end_time
    });
    setShowForm(true);
  };

  const handleDelete = async (periodId) => {
    try {
      await axios.delete(`/api/periods/${periodId}`);
      toast.success('Period deleted');
      fetchPeriods();
    } catch (err) {
      console.error('Failed to delete period:', err);
      toast.error(err.response?.data?.error || 'Failed to delete period. It may be referenced by sessions.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Periods...</div>
      </div>
    );
  }

  const inputClass = "w-full bg-base border border-subtle text-slate-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider";

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Periods</h2>
          <p className="text-sm text-slate-400 mt-1">Configure time blocks for scheduling sessions.</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingPeriod(null);
            setFormData({ period_name: '', start_time: '', end_time: '' });
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Period
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-raised border border-subtle rounded-xl p-5 shadow-inner slide-in-bottom">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4">
            {editingPeriod ? 'Edit Period' : 'Add New Period'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Period Name</label>
                <input
                  type="text"
                  value={formData.period_name}
                  onChange={(e) => setFormData({ ...formData, period_name: e.target.value })}
                  required
                  placeholder="e.g. Period 1"
                  autoFocus
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Start Time</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className={labelClass}>End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingPeriod ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingPeriod(null);
                  setFormData({ period_name: '', start_time: '', end_time: '' });
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-surface border border-subtle rounded-lg hover:bg-subtle hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Periods Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full">
            <thead className="bg-subtle/30 border-b border-subtle sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Period Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  End Time
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12">
                    <EmptyState 
                      title="No periods configured"
                      description="Create periods to act as templates for sessions."
                      icon={
                        <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                    />
                  </td>
                </tr>
              ) : (
                periods.map(period => (
                  <tr key={period.period_id} className="hover:bg-raised transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                      {period.period_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-400">
                      {period.start_time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-400">
                      {period.end_time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end items-center space-x-3">
                        <button
                          onClick={() => handleEdit(period)}
                          className="text-blue-400 hover:text-blue-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Edit
                        </button>
                        <ConfirmAction
                          onConfirm={() => handleDelete(period.period_id)}
                          buttonText="Delete"
                          confirmText="Confirm"
                          buttonClass="text-red-400 hover:text-red-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                          confirmClass="text-red-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium"
                          cancelClass="text-slate-400 hover:text-slate-200 px-3 py-1 text-xs font-medium"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
