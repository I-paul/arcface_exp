import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmAction from '../ui/ConfirmAction';
import EmptyState from '../ui/EmptyState';
import Badge from '../ui/Badge';
import { useToast } from '../ui/Toast';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const toast = useToast();

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/students');
      setStudents(data);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleDelete = async (studentId) => {
    try {
      await axios.delete(`/api/students/${studentId}`);
      toast.success('Student deleted');
      fetchStudents();
    } catch (err) {
      console.error('Failed to delete student:', err);
      toast.error(err.response?.data?.error || 'Failed to delete student');
    }
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.student_id.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-sm text-slate-500 font-mono uppercase tracking-widest">Loading Students...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-subtle bg-raised flex items-center justify-between sticky top-0 z-10">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Students Database</h2>
        
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 bg-base border border-subtle text-slate-200 text-sm rounded pl-9 pr-3 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-subtle/30 border-b border-subtle sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Student ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Face Enrolled
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Enrolled At
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12">
                  <EmptyState 
                    title="No students found" 
                    description={searchTerm ? `No matches for "${searchTerm}"` : "The database is empty"} 
                    icon={
                      <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.student_id} className="hover:bg-raised transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-300">
                    {student.student_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                    {student.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {student.milvus_id ? (
                      <Badge variant="ACTIVE">Yes</Badge>
                    ) : (
                      <Badge variant="SCHEDULED">No</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {student.enrolled_at
                      ? new Date(student.enrolled_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <ConfirmAction
                      onConfirm={() => handleDelete(student.student_id)}
                      buttonText="Delete"
                      confirmText="Confirm Delete"
                      buttonClass="text-red-400 hover:text-red-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1"
                      confirmClass="text-red-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium"
                      cancelClass="text-slate-400 hover:text-slate-200 px-3 py-1 text-xs font-medium"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-subtle bg-surface text-xs font-mono text-slate-500 flex justify-between">
        <span>TOTAL STUDENTS: {students.length}</span>
        {searchTerm && <span>MATCHING: {filteredStudents.length}</span>}
      </div>
    </div>
  );
}
