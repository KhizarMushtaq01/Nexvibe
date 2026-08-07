import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../../services/api';
import Avatar from '../common/Avatar';
import FollowButton from '../common/FollowButton';
import { FiX } from 'react-icons/fi';

export default function FollowersModal({ userId, type, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = type === 'followers' ? userAPI.getFollowers : userAPI.getFollowing;
    fn(userId)
      .then(({ data }) => setUsers(data.followers || data.following || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, type]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-bold capitalize">{type}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center py-10 text-sm text-[var(--text-muted)]">No {type} yet</p>
          ) : users.map(u => (
            <div key={u._id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors">
              <Link to={`/${u.username}`} onClick={onClose} className="flex-shrink-0">
                <Avatar src={u.avatar} size={44} alt={u.fullName} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/${u.username}`} onClick={onClose}
                  className="text-sm font-semibold flex items-center gap-1 truncate hover:opacity-70 transition-opacity">
                  {u.username}
                  {u.isVerified && <span className="text-blue-500 text-xs flex-shrink-0">✓</span>}
                </Link>
                <p className="text-xs text-[var(--text-muted)] truncate">{u.fullName}</p>
              </div>
              <FollowButton userId={u._id} isFollowing={u.isFollowing} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
