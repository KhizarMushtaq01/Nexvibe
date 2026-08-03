import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationAPI, userAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FiBell } from 'react-icons/fi';

const TYPE_TEXT = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  follow: 'started following you',
  follow_request: 'requested to follow you',
  follow_accept: 'accepted your follow request',
  mention: 'mentioned you in a post',
  tag: 'tagged you in a post',
  story_view: 'viewed your story',
  story_reaction: 'reacted to your story',
  message: 'sent you a message',
  system: '',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    notificationAPI.getAll()
      .then(({ data }) => {
        setNotifications(data.notifications || []);
        notificationAPI.markAllRead().catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = notifications.reduce((acc, n) => {
    const diff = Date.now() - new Date(n.createdAt).getTime();
    const key = diff < 86400000 ? 'Today' : diff < 604800000 ? 'This week' : 'Earlier';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  const handleFollowBack = async (senderId) => {
    try { await userAPI.followUser(senderId); toast.success('Following!'); }
    catch { toast.error('Failed'); }
  };

  const handleRespond = async (requesterId, action) => {
    try {
      await userAPI.respondFollowRequest(requesterId, action);
      setNotifications(prev => prev.filter(n => n.sender?._id !== requesterId || n.type !== 'follow_request'));
      toast.success(action === 'accept' ? 'Follow request accepted' : 'Declined');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="max-w-[600px] mx-auto pt-4 pb-20 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Notifications</h1>
        {notifications.length > 0 && (
          <button onClick={async () => {
            await notificationAPI.clearAll().catch(() => {});
            setNotifications([]);
          }} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-11 h-11 rounded-full shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-56 rounded shimmer" />
                <div className="h-2.5 w-24 rounded shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
            <FiBell className="w-10 h-10 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-xl font-bold">No notifications yet</h2>
          <p className="text-sm text-[var(--text-secondary)] text-center max-w-xs">
            When someone likes or comments on your posts, you'll see it here.
          </p>
        </div>
      ) : (
        ['Today', 'This week', 'Earlier'].map(group =>
          grouped[group]?.length > 0 && (
            <div key={group} className="mb-6">
              <h2 className="font-bold text-sm text-[var(--text-secondary)] mb-3 px-1">{group}</h2>
              <div className="space-y-0.5">
                {grouped[group].map(n => (
                  <div key={n._id}
                    className={`flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}`}
                    onClick={() => {
                      if (n.post?._id) navigate(`/p/${n.post._id}`);
                      else if (n.sender?.username) navigate(`/${n.sender.username}`);
                    }}>
                    <Link to={n.sender ? `/${n.sender.username}` : '#'}
                      onClick={e => e.stopPropagation()} className="flex-shrink-0">
                      <Avatar src={n.sender?.avatar} size={44} alt={n.sender?.fullName} />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        {n.sender?.username && (
                          <Link to={`/${n.sender.username}`}
                            onClick={e => e.stopPropagation()}
                            className="font-bold hover:opacity-70 transition-opacity mr-1">
                            {n.sender.username}
                          </Link>
                        )}
                        {TYPE_TEXT[n.type] || n.text}
                        {n.type === 'comment' && n.text && (
                          <span className="text-[var(--text-muted)]">: "{n.text.slice(0, 40)}"</span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Action buttons for specific types */}
                    {n.type === 'follow_request' && (
                      <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleRespond(n.sender._id, 'accept')}
                          className="btn-primary text-xs px-3 py-1.5 rounded-lg">Confirm</button>
                        <button onClick={() => handleRespond(n.sender._id, 'decline')}
                          className="btn-outline text-xs px-3 py-1.5 rounded-lg">Delete</button>
                      </div>
                    )}

                    {n.type === 'follow' && (
                      <button onClick={e => { e.stopPropagation(); handleFollowBack(n.sender._id); }}
                        className="btn-outline text-xs px-3 py-1.5 rounded-lg flex-shrink-0">
                        Follow back
                      </button>
                    )}

                    {/* Post thumbnail */}
                    {n.post?.media?.[0] && (
                      <div className="flex-shrink-0 ml-1">
                        <img src={n.post.media[0].url} className="w-11 h-11 object-cover rounded-lg" alt="" />
                      </div>
                    )}

                    {/* Unread dot */}
                    {!n.isRead && !n.post?.media?.[0] && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
