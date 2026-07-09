import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';

// Import subcomponents
import SystemMonitor from './SystemMonitor';
import CameraManager from './CameraManager';
import EmployeeRecords from './EmployeeRecords';
import AttendanceAuditor from './AttendanceAuditor';
import AdminOverview from './AdminOverview';

export default function AdminLayout({ socket }) {
  // Live Clock states
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isLiveOnline, setIsLiveOnline] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    };
    
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    // Socket state observer
    if (socket) {
      setIsLiveOnline(socket.connected);
      socket.on('connect', () => setIsLiveOnline(true));
      socket.on('disconnect', () => setIsLiveOnline(false));
    }

    return () => {
      clearInterval(clockInterval);
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
      }
    };
  }, [socket]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row antialiased bg-[#070a13] text-[#f3f4f6]">
      
      {/* ADMIN SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 shrink-0 bg-[#0f1422]/95 backdrop-blur-md border-r border-slate-800 flex flex-col z-20">
        
        {/* Logo Header with Red/Orange Admin Tag */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-850">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-sans font-extrabold text-sm tracking-wider bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">AURAFACE</span>
              <span className="text-[9px] text-orange-450 font-bold uppercase tracking-widest leading-none mt-0.5">Admin Suite</span>
            </div>
          </div>
          
          <span className="bg-orange-500/10 text-orange-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded border border-orange-500/25 uppercase tracking-wider animate-pulse">
            Secure
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
            Admin Console
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
          </div>
          
          {/* NavLink - Dashboard Overview */}
          <NavLink 
            to="/admin/overview" 
            className={({ isActive }) => 
              `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                isActive 
                  ? 'bg-orange-500/10 text-orange-450 border-orange-500/20 shadow-md shadow-orange-500/5' 
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
              }`
            }
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-orange-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard Overview</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </NavLink>

          {/* NavLink - System Monitor */}
          <NavLink 
            to="/admin/monitor" 
            className={({ isActive }) => 
              `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                isActive 
                  ? 'bg-orange-500/10 text-orange-450 border-orange-500/20 shadow-md shadow-orange-500/5' 
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
              }`
            }
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-orange-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
              </svg>
              <span>System Monitor</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </NavLink>
          
          {/* NavLink - Camera Management */}
          <NavLink 
            to="/admin/cameras" 
            className={({ isActive }) => 
              `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                isActive 
                  ? 'bg-orange-500/10 text-orange-450 border-orange-500/20 shadow-md shadow-orange-500/5' 
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
              }`
            }
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-orange-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Camera Management</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </NavLink>

          {/* NavLink - Employee Records */}
          <NavLink 
            to="/admin/employees" 
            className={({ isActive }) => 
              `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                isActive 
                  ? 'bg-orange-500/10 text-orange-450 border-orange-500/20 shadow-md shadow-orange-500/5' 
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
              }`
            }
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-orange-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Employee Records</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </NavLink>

          {/* NavLink - Attendance Audits */}
          <NavLink 
            to="/admin/audits" 
            className={({ isActive }) => 
              `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                isActive 
                  ? 'bg-orange-500/10 text-orange-450 border-orange-500/20 shadow-md shadow-orange-500/5' 
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/40'
              }`
            }
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-orange-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Attendance Audits</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </NavLink>

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mt-6 mb-2">Backdoor</div>
          
          {/* Back to Operator Views */}
          <NavLink 
            to="/feed" 
            className="w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 border border-transparent hover:text-slate-100 hover:bg-slate-800/40 transition-all"
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
              </svg>
              <span>Exit Admin Portal</span>
            </div>
          </NavLink>

        </nav>

        {/* Sidebar System Stats */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/20">
          <div className="flex items-center space-x-3 bg-slate-950/50 p-2 rounded-xl border border-slate-850">
            <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop" 
                className="w-full h-full object-cover" 
                alt="Admin"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] font-bold text-slate-350 truncate">Agent Admin</h4>
              <p className="text-[9px] text-orange-400/80 font-bold truncate">Root Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ADMIN MAIN PANEL CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Admin Top Header Navbar */}
        <header className="h-16 shrink-0 bg-[#0f1422]/50 backdrop-blur-md border-b border-slate-850 flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <h1 className="font-sans font-bold text-slate-100 text-base flex items-center gap-2">
              AuraFace Secure Control Center
              <span className="bg-orange-500/20 text-orange-450 border border-orange-500/30 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest leading-none">
                Admin
              </span>
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-100 font-mono tracking-wide">{timeStr}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{dateStr}</div>
            </div>
            <div className="h-6 w-[1px] bg-slate-800 hidden sm:block"></div>
            
            <div className="bg-slate-900 border border-slate-850 text-[10px] text-slate-400 px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Admin Gateway: Online</span>
            </div>
          </div>
        </header>

        {/* Routes Content viewports */}
        <main className="flex-1 p-6 relative">
          <Routes>
            <Route path="/" element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverview />} />
            <Route path="monitor" element={<SystemMonitor />} />
            <Route path="cameras" element={<CameraManager />} />
            <Route path="employees" element={<EmployeeRecords />} />
            <Route path="audits" element={<AttendanceAuditor />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </main>
      </div>

    </div>
  );
}
