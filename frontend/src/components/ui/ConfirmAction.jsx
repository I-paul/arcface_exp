import React, { useState } from 'react';

export default function ConfirmAction({
  onConfirm,
  buttonText = 'Delete',
  confirmText = 'Confirm',
  buttonClass = 'text-red-400 hover:text-red-300 font-medium',
  confirmClass = 'text-red-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium',
  cancelClass = 'text-slate-400 hover:text-slate-200 px-3 py-1 text-xs font-medium'
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <div className="flex items-center space-x-2 animate-[slide-in-right_0.2s_ease-out]">
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className={cancelClass}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(false);
            onConfirm();
          }}
          className={confirmClass}
        >
          {confirmText}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsConfirming(true);
      }}
      className={buttonClass}
    >
      {buttonText}
    </button>
  );
}
