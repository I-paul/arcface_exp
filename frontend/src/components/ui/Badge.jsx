import React from 'react';

export default function Badge({ variant = 'scheduled', children, className = '' }) {
  const styles = {
    active: 'bg-green-500/10 text-green-400 border border-green-500/30 animate-[pulse_2s_ease-in-out_infinite]',
    scheduled: 'bg-slate-500/10 text-slate-400 border border-slate-500/30',
    completed: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border border-red-500/30',
    present: 'bg-green-500/10 text-green-400 border border-green-500/30',
    absent: 'bg-red-500/10 text-red-400 border border-red-500/30',
    default: 'bg-slate-800 text-slate-300 border border-slate-700'
  };

  const selectedStyle = styles[variant.toLowerCase()] || styles.default;

  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-mono inline-flex items-center ${selectedStyle} ${className}`}>
      {variant.toLowerCase() === 'active' && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
      )}
      {children}
    </span>
  );
}
