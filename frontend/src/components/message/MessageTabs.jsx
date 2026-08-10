const TABS = [
  { key: 'primary', label: 'Primary' },
  { key: 'general', label: 'General' },
  { key: 'requests', label: 'Requests' },
];

export default function MessageTabs({ activeTab, onChange, counts }) {
  return (
    <div className="flex border-b border-[var(--border)]">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition-colors
            ${activeTab === tab.key
              ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
          {tab.label}
          {counts?.[tab.key] > 0 && ` (${counts[tab.key]})`}
        </button>
      ))}
    </div>
  );
}
