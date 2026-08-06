// frontend/src/components/common/ConfirmDialog.jsx
import { useState, useEffect } from 'react';

export default function ConfirmDialog({
  open, title, message, children, confirmLabel = 'OK', cancelLabel = 'Cancel',
  danger = false, showInput = false, inputPlaceholder = '', onConfirm, onCancel
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {title && (
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="font-bold text-sm">{title}</h2>
          </div>
        )}
        <div className="px-5 py-4">
          {children || (message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>)}
          {showInput && (
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="input-field mt-3 w-full"
            />
          )}
        </div>
        <div className="flex gap-2 p-4">
          <button onClick={onCancel} className="flex-1 btn-outline py-2.5 rounded-xl text-sm font-semibold">
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(showInput ? value : undefined)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'btn-brand'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
