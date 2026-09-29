import React from 'react';

export default function StatCard({ label, value, sub, color = 'blue' }) {
  const colorMap = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    red: 'text-red-500',
    amber: 'text-amber-500',
    default: 'text-slate-200'
  };

  const textClass = colorMap[color] || colorMap.default;

  return (
    <div className="bg-raised border border-subtle rounded-xl p-4 flex flex-col justify-center">
      <div className="text-xs font-medium uppercase tracking-widest text-slate-500 mb-1">
        {label}
      </div>
      <div className="flex items-baseline space-x-2">
        <div className={`text-3xl font-semibold ${textClass}`}>
          {value}
        </div>
        {sub && (
          <div className="text-sm text-slate-400">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
