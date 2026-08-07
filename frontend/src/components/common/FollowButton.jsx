import { useState } from 'react';
import toast from 'react-hot-toast';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Single source of truth for follow/unfollow anywhere in the app. Trusts the
// API response instead of tracking its own optimistic guess, so it can never
// drift out of sync with the server (the bug that plagued the older
// per-component implementations).
export default function FollowButton({ userId, isFollowing = false, requestSent = false, size = 'md', className = '', onToggle }) {
  const { user: currentUser } = useAuth();
  const [following, setFollowing] = useState(isFollowing);
  const [requested, setRequested] = useState(requestSent);
  const [loading, setLoading] = useState(false);
  const [hovering, setHovering] = useState(false);

  if (!userId || userId === currentUser?._id) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await userAPI.followUser(userId);
      if (data.requestSent) {
        setRequested(true);
        setFollowing(false);
        toast.success('Follow request sent');
        onToggle?.({ isFollowing: false, requestSent: true });
      } else {
        const nextFollowing = !!data.isFollowing;
        setFollowing(nextFollowing);
        setRequested(false);
        onToggle?.({ isFollowing: nextFollowing, requestSent: false });
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-1.5';

  let label = 'Follow';
  let variant = 'btn-primary';
  if (following) {
    label = hovering ? 'Unfollow' : 'Following';
    variant = hovering
      ? 'border border-red-300 text-red-500 bg-red-50 dark:bg-red-950/20'
      : 'btn-outline';
  } else if (requested) {
    label = 'Requested';
    variant = 'btn-outline opacity-70';
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`rounded-lg font-semibold transition-all disabled:opacity-60 flex-shrink-0 ${sizeClasses} ${variant} ${className}`}>
      {loading ? '…' : label}
    </button>
  );
}
