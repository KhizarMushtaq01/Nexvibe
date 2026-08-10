export default function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {title && (
          <div className="px-5 py-4 border-b border-[var(--border)] text-center">
            <p className="font-bold text-sm truncate">{title}</p>
          </div>
        )}
        {actions.map((action, i) => (
          <button key={i} onClick={action.onClick}
            className={`w-full py-4 px-6 text-center text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]
              ${action.danger ? 'text-red-500 font-bold' : action.label === 'Cancel' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}
              ${i < actions.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
