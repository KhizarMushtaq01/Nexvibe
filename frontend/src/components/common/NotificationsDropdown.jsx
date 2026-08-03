import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { notificationAPI } from '../../services/api';
import Avatar from './Avatar';
import { formatDistanceToNow } from 'date-fns';
import { FiTrash2 } from 'react-icons/fi';

export default function NotificationsDropdown({ onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    notificationAPI.getAll()
      .then(({ data }) => { setNotifications(data.notifications || []); notificationAPI.markAllRead().catch(() => {}); })
      .catch(() => {})
      .finally(() => setLoading(false));

    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 150);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const typeLabel = {
    like: 'liked your post', comment: 'commented on your post',
    follow: 'started following you', follow_request: 'requested to follow you',
    follow_accept: 'accepted your follow request', mention: 'mentioned you',
    reply: 'replied to your comment', story_reaction: 'reacted to your story',
    message: 'sent you a message', system: 'System notification',
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await notificationAPI.delete(id).catch(() => {});
    setNotifications(prev => prev.filter(n => n._id !== id));
  };

  return (
    <div ref={ref}
      className="fixed z-50 w-[360px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      style={{ left: 270, top: '50%', transform: 'translateY(-50%)' }}>

      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-bold">Notifications</h3>
        {notifications.length > 0 && (
          <button onClick={async () => { await notificationAPI.clearAll().catch(() => {}); setNotifications([]); }}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            Clear all
          </button>
        )}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🔔</p>
            <p className="text-sm text-[var(--text-muted)]">No notifications yet</p>
          </div>
        ) : notifications.map(n => (
          <div key={n._id}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors group cursor-pointer border-b border-[var(--border)] last:border-0 ${!n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}`}>
            <Link to={n.sender ? `/${n.sender.username}` : '#'} onClick={onClose}>
              <Avatar src={n.sender?.avatar} size={42} alt={n.sender?.fullName} />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                {n.sender && <Link to={`/${n.sender.username}`} className="font-bold hover:opacity-70" onClick={onClose}>{n.sender.username} </Link>}
                {typeLabel[n.type] || n.text}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {n.post?.media?.[0] && (
                <Link to={`/p/${n.post._id}`} onClick={onClose}>
                  <img src={n.post.media[0].url} className="w-10 h-10 object-cover rounded-lg" alt="" />
                </Link>
              )}
              <button onClick={e => handleDelete(n._id, e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500 text-[var(--text-muted)]">
                <FiTrash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
