import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from './ui/Badge';
import ConfirmAction from './ui/ConfirmAction';

export default function SessionCard({ session, onStart, onEnd, onCancel }) {
  const navigate = useNavigate();
  const [confirmingAction, setConfirmingAction] = useState(null); // 'end' | 'cancel' | null

  const attendancePercent = session.total_students > 0
    ? Math.round((session.present_count / session.total_students) * 100)
    : 0;

  const handleAction = (action) => {
    setConfirmingAction(action);
  };

  const executeAction = () => {
    if (confirmingAction === 'end') onEnd(session.session_id);
    if (confirmingAction === 'cancel') onCancel(session.session_id);
    setConfirmingAction(null);
  };

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5 hover:ring-1 hover:ring-blue-500/20 hover:shadow-lg hover:shadow-blue-900/10 transition-all flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 pr-4">
          <h3 className="font-semibold text-slate-100 mb-1.5 line-clamp-1">
            {session.period_name}
          </h3>
          <div className="text-sm text-slate-400 space-y-1.5">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-mono text-xs">{session.start_time} – {session.end_time}</span>
            </div>
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {session.room_name}
            </div>
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {session.booked_by}
            </div>
          </div>
        </div>

        <Badge variant={session.status}>{session.status}</Badge>
      </div>

      {/* Attendance Stats */}
      {session.status !== 'CANCELLED' && (
        <div className="mb-5 mt-auto">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-500 uppercase tracking-wider font-medium">Attendance</span>
            <span className="font-mono text-slate-300">
              <span className="text-slate-100 font-medium">{session.present_count}</span> / {session.total_students}
            </span>
          </div>
          <div className="w-full bg-raised rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${session.status === 'ACTIVE' ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${attendancePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 mt-auto">
        {!confirmingAction ? (
          <div className="flex items-center space-x-2">
            {session.status === 'SCHEDULED' && (
              <>
                <button
                  onClick={() => onStart(session.session_id)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
                >
                  Start Session
                </button>
                <button
                  onClick={() => handleAction('cancel')}
                  className="px-4 py-2 bg-raised text-slate-300 text-sm font-medium rounded-lg hover:bg-subtle hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {session.status === 'ACTIVE' && (
              <>
                <button
                  onClick={() => navigate(`/sessions/${session.session_id}`)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
                >
                  View Live
                </button>
                <button
                  onClick={() => handleAction('end')}
                  className="px-4 py-2 bg-raised text-slate-300 text-sm font-medium rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
                >
                  End
                </button>
              </>
            )}

            {session.status === 'COMPLETED' && (
              <button
                onClick={() => navigate(`/sessions/${session.session_id}`)}
                className="flex-1 px-4 py-2 bg-raised text-slate-200 text-sm font-medium rounded-lg hover:bg-subtle transition-colors"
              >
                View Report
              </button>
            )}
          </div>
        ) : (
          <ConfirmAction
            message={`Confirm ${confirmingAction}?`}
            confirmLabel={confirmingAction === 'end' ? 'End Session' : 'Cancel Session'}
            onConfirm={executeAction}
            onCancel={() => setConfirmingAction(null)}
            danger={true}
          />
        )}
      </div>

      {/* Actual start/end times */}
      {session.actual_start && (
        <div className="mt-4 pt-3 border-t border-subtle flex justify-between text-[10px] font-mono text-slate-500">
          {session.status === 'ACTIVE' && (
            <span>Started {new Date(session.actual_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          )}
          {session.status === 'COMPLETED' && session.actual_end && (
            <>
              <span>In: {new Date(session.actual_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              <span>Out: {new Date(session.actual_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
