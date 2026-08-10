// frontend/src/components/message/SelectionBottomBar.jsx
import { useState } from 'react';
import ActionSheet from './ActionSheet';

export default function SelectionBottomBar({
  count, activeTab, onDelete, onMoveFolder,
  onMarkRead, onMarkUnread, onMuteMessages, onMuteCalls
}) {
  const [showMore, setShowMore] = useState(false);
  const targetFolder = activeTab === 'general' ? 'primary' : 'general';
  const targetLabel = activeTab === 'general' ? 'Primary' : 'General';

  const moreActions = [
    { label: 'Mark as Read', onClick: () => { onMarkRead(); setShowMore(false); } },
    { label: 'Mark as Unread', onClick: () => { onMarkUnread(); setShowMore(false); } },
    { label: 'Mute Messages', onClick: () => { onMuteMessages(); setShowMore(false); } },
    { label: 'Mute Call Notifications', onClick: () => { onMuteCalls(); setShowMore(false); } },
    { label: 'Cancel', onClick: () => setShowMore(false) },
  ];

  return (
    <div className="flex items-center justify-around border-t border-[var(--border)] bg-[var(--bg-primary)] py-3 px-2 flex-shrink-0">
      <button onClick={() => setShowMore(true)} className="text-sm font-semibold text-[var(--text-primary)] px-3 py-1.5">
        More
      </button>
      <button onClick={() => onMoveFolder(targetFolder)} className="text-sm font-semibold text-[var(--text-primary)] px-3 py-1.5">
        {targetLabel} ({count})
      </button>
      <button onClick={onDelete} className="text-sm font-bold text-red-500 px-3 py-1.5">
        Delete ({count})
      </button>

      {showMore && (
        <ActionSheet title={`${count} selected`} actions={moreActions} onClose={() => setShowMore(false)} />
      )}
    </div>
  );
}
