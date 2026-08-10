export default function SelectionTopBar({ count, onCancel }) {
  return (
    <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
      <button onClick={onCancel} className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors">
        Cancel
      </button>
      <span className="font-bold text-sm">{count} selected</span>
    </div>
  );
}
