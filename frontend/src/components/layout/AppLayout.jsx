import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function AppLayout({ socket, children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/monitor') return 'Live Monitor';
    if (path.startsWith('/sessions/book')) return 'Book Session';
    if (path.startsWith('/sessions/')) return 'Session Detail';
    if (path === '/sessions') return 'Sessions';
    if (path === '/enroll') return 'Enrollment';
    if (path.startsWith('/admin')) return 'Administration';
    return 'Dashboard';
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors ${
      isActive
        ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500'
        : 'text-slate-400 hover:bg-raised hover:text-slate-200 border-l-2 border-transparent'
    }`;

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center px-6 border-b border-subtle">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-white leading-tight">Classroom</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-blue-500 leading-tight">Attendance</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        <NavLink to="/monitor" className={navLinkClass}>
          <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Live Monitor
        </NavLink>

        <NavLink to="/sessions" className={navLinkClass}>
          <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Sessions
        </NavLink>

        <NavLink to="/enroll" className={navLinkClass}>
          <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Enrollment
        </NavLink>

        <div className="pt-6 pb-2">
          <div className="px-4 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">System</div>
          <NavLink to="/admin" className={navLinkClass}>
            <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Administration
          </NavLink>
        </div>
      </nav>

      <div className="p-4 border-t border-subtle bg-surface">
        <div className="flex items-center space-x-2 text-xs mb-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'System Live' : 'Offline'}
          </span>
        </div>
        <div className="text-[10px] font-mono text-slate-500">{currentTime}</div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-base text-slate-200">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 bg-surface border-r border-subtle flex-col flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="relative w-64 h-full bg-surface border-r border-subtle flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-surface border-b border-subtle flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center">
            <button
              className="lg:hidden mr-3 p-1.5 text-slate-400 hover:text-white hover:bg-raised rounded-lg transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="text-sm font-medium text-slate-300 flex items-center">
              <span className="text-slate-500 mr-2">/</span> {getPageTitle()}
            </div>
          </div>
          <div className="text-xs font-medium text-slate-400 hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
