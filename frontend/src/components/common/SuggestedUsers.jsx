import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import toast from 'react-hot-toast';

export default function SuggestedUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [followed, setFollowed] = useState(new Set());

  useEffect(() => {
    userAPI.getSuggestions()
      .then(({ data }) => setUsers(data.users?.slice(0, 5) || []))
      .catch(() => {});
  }, []);

  const handleFollow = async (id) => {
    try {
      await userAPI.followUser(id);
      setFollowed(prev => new Set([...prev, id]));
    } catch { toast.error('Failed'); }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Current user */}
      <div className="flex items-center gap-3">
        <Link to={`/${user.username}`}>
          <Avatar src={user.avatar} size={44} alt={user.fullName} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/${user.username}`} className="text-sm font-bold hover:opacity-70 transition-opacity block truncate">
            {user.username}
          </Link>
          <p className="text-xs text-[var(--text-muted)] truncate">{user.fullName}</p>
        </div>
        <Link to="/settings" className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0">
          Switch
        </Link>
      </div>

      {users.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Suggested for you</p>
            <Link to="/explore" className="text-xs font-bold hover:opacity-70 transition-opacity">See all</Link>
          </div>

          <div className="space-y-3">
            {users.map(u => (
              <div key={u._id} className="flex items-center gap-3">
                <Link to={`/${u.username}`} className="flex-shrink-0">
                  <Avatar src={u.avatar} size={32} alt={u.fullName} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/${u.username}`}
                    className="text-xs font-bold flex items-center gap-1 hover:opacity-70 transition-opacity truncate">
                    {u.username}
                    {u.isVerified && <span className="text-blue-500 text-[10px] flex-shrink-0">✓</span>}
                  </Link>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {u.followers?.length ? `${u.followers.length.toLocaleString()} followers` : 'Suggested for you'}
                  </p>
                </div>
                <button onClick={() => handleFollow(u._id)} disabled={followed.has(u._id)}
                  className={`text-xs font-bold flex-shrink-0 transition-colors
                    ${followed.has(u._id) ? 'text-[var(--text-muted)]' : 'text-blue-500 hover:text-blue-600'}`}>
                  {followed.has(u._id) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer links */}
      <div className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-2">
        <p className="flex flex-wrap gap-x-1.5 gap-y-1 mb-2">
          {['About', 'Help', 'Press', 'API', 'Jobs', 'Privacy', 'Terms', 'Locations'].map((l, i, arr) => (
            <span key={l}>
              <a href="#" className="hover:underline">{l}</a>
              {i < arr.length - 1 && ' ·'}
            </span>
          ))}
        </p>
        <p>© {new Date().getFullYear()} NEXVIBE</p>
      </div>
    </div>
  );
}
