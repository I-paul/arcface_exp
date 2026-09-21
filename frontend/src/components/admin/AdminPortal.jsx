import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import AdminStudents from './AdminStudents';
import AdminRooms from './AdminRooms';
import AdminPeriods from './AdminPeriods';
import AdminCameras from './AdminCameras';
import SystemHealth from './SystemHealth';

export default function AdminPortal() {
  const tabs = [
    { name: 'Students', path: '/admin/students' },
    { name: 'Rooms', path: '/admin/rooms' },
    { name: 'Periods', path: '/admin/periods' },
    { name: 'Cameras', path: '/admin/cameras' },
    { name: 'System Health', path: '/admin/health' },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Tabs */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-5 border-b border-subtle">
          <h1 className="text-xl font-semibold text-slate-100">System Administration</h1>
          <p className="text-sm text-slate-400 mt-1">Manage core entities and monitor system health</p>
        </div>
        
        <nav className="flex px-4 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => (
            <NavLink
              key={tab.name}
              to={tab.path}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Admin Content */}
      <main className="bg-surface border border-subtle rounded-xl shadow-lg overflow-hidden min-h-[500px]">
        <Routes>
          <Route index element={<Navigate to="/admin/students" replace />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="rooms" element={<AdminRooms />} />
          <Route path="periods" element={<AdminPeriods />} />
          <Route path="cameras" element={<AdminCameras />} />
          <Route path="health" element={<SystemHealth />} />
        </Routes>
      </main>
    </div>
  );
}
