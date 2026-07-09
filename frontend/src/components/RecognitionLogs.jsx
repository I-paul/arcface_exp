import React, { useEffect, useState } from 'react';

/**
 * RecognitionLogs Component
 * 
 * An attendance log panel designed to sit alongside the video stream canvas.
 * - Subscribes to Socket.IO connection
 * - Listens for backend's native 'recognition-result' events (contain matched employee details)
 * - Appends log entries to a scrollable attendance feed
 */
export default function RecognitionLogs({ socket }) {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!socket) return;

    // Listen for face recognition match event from backend Socket.IO
    const onRecognitionResult = (payload) => {
      if (!payload) return;

      // Payload structure: { camera_id, detected, name, confidence, message }
      const { name, confidence, detected } = payload;

      // Only log successful matches with confidence threshold > 70%
      const matchScore = confidence <= 1.0 ? confidence * 100 : confidence;
      
      if (detected && name && matchScore >= 70) {
        const timeString = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });

        const logId = `${name}-${Date.now()}`;

        // Create log entry matching database specs
        const newLog = {
          id: logId,
          empId: payload.emp_id || 'RESOLVED',
          name: name,
          score: Math.round(matchScore),
          time: timeString,
          timestampMs: Date.now(),
          date: new Date().toLocaleDateString()
        };

        // Append to logs, ensuring we don't log duplicate records for the same employee within 5 seconds
        setLogs((prevLogs) => {
          const duplicate = prevLogs.find(l => l.name === newLog.name && (Date.now() - l.timestampMs < 5000));
          if (duplicate) return prevLogs;
          
          return [newLog, ...prevLogs].slice(0, 55);
        });
      }
    };

    socket.on('recognition-result', onRecognitionResult);

    return () => {
      socket.off('recognition-result', onRecognitionResult);
    };
  }, [socket]);

  // Search Filter logic
  const filteredLogs = logs.filter(log => 
    log.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Export session log
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = dataStr;
    downloadAnchor.download = `AuraFace-AttendanceLogs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col h-full max-h-[500px]">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-wrap gap-3 items-center justify-between border-b border-slate-850 pb-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 00-2 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span>Live Attendance Log</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Scans matching backend registry</p>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button 
            onClick={handleExport}
            disabled={logs.length === 0}
            className="p-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 hover:border-slate-700 disabled:cursor-not-allowed rounded-lg transition-all"
            title="Export session logs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          
          <button 
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
            className="p-1.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-rose-400 disabled:opacity-40 hover:border-slate-800 disabled:cursor-not-allowed rounded-lg transition-all"
            title="Clear logs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* SEARCH LOG BAR */}
      <div className="relative mb-3.5">
        <input 
          type="text" 
          placeholder="Filter log entries..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-950 border border-slate-850 text-slate-350 focus:border-blue-500 rounded-xl pl-8.5 pr-4 py-2 text-xs outline-none transition-all placeholder-slate-700"
        />
        <svg className="w-3.5 h-3.5 text-slate-650 absolute left-3 top-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* SCROLLABLE LOG ENTRY ITEMS */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
        {filteredLogs.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <svg className="w-9 h-9 stroke-1 mb-2 text-slate-650 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-semibold text-slate-400">Awaiting matching scans...</p>
            <p className="text-[10px] text-slate-600 mt-1 max-w-[175px]">Recognized check-ins will display here in real-time</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div 
              key={log.id} 
              className="bg-slate-950/60 hover:bg-slate-950 border border-slate-850/80 hover:border-slate-800 rounded-xl p-3 flex items-center gap-3 transition-all animate-[slide-in-bottom_0.3s_ease-out]"
            >
              {/* Initials Placeholder */}
              <div className="relative shrink-0 w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center text-xs font-bold bg-blue-500/10 text-blue-400">
                {log.name.split(' ').map(n => n[0]).join('').substr(0, 2).toUpperCase()}
              </div>

              {/* Record Metadata */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-200 truncate">{log.name}</h4>
                  <span className="text-[9px] font-mono text-slate-500 shrink-0">{log.time}</span>
                </div>
                
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[9px] text-slate-500 font-mono truncate">STATUS: VERIFIED</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-emerald-400 font-mono">{log.score}%</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FOOTER COUNT */}
      <div className="text-[10px] text-slate-650 font-medium pt-3 border-t border-slate-850 flex justify-between">
        <span>Scanned Matches</span>
        <span className="font-mono">{filteredLogs.length} Total</span>
      </div>

    </div>
  );
}
