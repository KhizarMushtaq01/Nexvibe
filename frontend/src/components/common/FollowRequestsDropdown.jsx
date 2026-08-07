import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { FiUserPlus } from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';

export default function FollowRequestsDropdown({ requests, onRespond, onClose }) {
  const ref = useRef(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    // Exclude clicks on the toggle button itself -- otherwise this mousedown
    // handler closes the panel first, then the button's own onClick fires
    // right after and re-toggles it back open.
    const handler = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-toggle]')) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 150);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const respond = async (id, action) => {
    setBusyId(id);
    try { await onRespond(id, action); } finally { setBusyId(null); }
  };

  return (
    <div ref={ref}
      className="fixed z-50 inset-x-3 top-16 w-auto lg:inset-x-auto lg:top-1/2 lg:left-[270px] lg:-translate-y-1/2 lg:w-[360px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">

      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-bold">Follow Requests</h3>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-180px)] lg:max-h-[480px]">
        {requests.length === 0 ? (
          <div className="text-center py-12">
            <FiUserPlus className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No follow requests</p>
          </div>
        ) : requests.map(r => (
          <div key={r._id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors border-b border-[var(--border)] last:border-0">
            <Link to={`/${r.username}`} onClick={onClose} className="flex-shrink-0">
              <Avatar src={r.avatar} size={44} alt={r.fullName} />
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/${r.username}`} onClick={onClose}
                className="text-sm font-bold flex items-center gap-1 truncate hover:opacity-70 transition-opacity">
                {r.username}
                {r.isVerified && <MdVerified className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
              </Link>
              <p className="text-xs text-[var(--text-muted)] truncate">{r.fullName}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => respond(r._id, 'accept')} disabled={busyId === r._id}
                className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60">
                Confirm
              </button>
              <button onClick={() => respond(r._id, 'decline')} disabled={busyId === r._id}
                className="btn-outline text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
