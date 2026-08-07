import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { userAPI, postAPI, messageAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';
import FollowButton from '../../components/common/FollowButton';
import PostGrid from '../../components/post/PostGrid';
import FollowersModal from '../../components/profile/FollowersModal';
import toast from 'react-hot-toast';
import { FiSettings, FiCamera, FiGrid, FiBookmark, FiUser } from 'react-icons/fi';
import { BsPlayCircle } from 'react-icons/bs';

export default function ProfilePage() {
  const { username } = useParams();
  const { user: currentUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwn, setIsOwn] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [tab, setTab] = useState('posts');
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [followersModal, setFollowersModal] = useState(null);

  useEffect(() => {
    setLoading(true);
    setTab('posts');
    userAPI.getProfile(username)
      .then(({ data }) => {
        setProfile(data.user);
        setIsFollowing(data.isFollowing);
        setIsOwn(data.isOwnProfile);
        setRequestSent(data.hasFollowRequest);
        loadPosts(data.user._id, undefined);
      })
      .catch(() => navigate('/feed'))
      .finally(() => setLoading(false));
  }, [username]);

  const loadPosts = async (userId, type) => {
    setPostsLoading(true);
    try {
      const { data } = type === 'saved'
        ? await postAPI.getSaved()
        : await postAPI.getUserPosts(userId, 1, type);
      setPosts(data.posts || []);
    } catch {} finally { setPostsLoading(false); }
  };

  const handleFollowToggle = ({ isFollowing: nextFollowing, requestSent: nextRequested }) => {
    setIsFollowing(nextFollowing);
    setRequestSent(nextRequested);
    setProfile(p => ({
      ...p,
      followers: nextFollowing
        ? [...(p.followers || []), { _id: currentUser._id }]
        : (p.followers || []).filter(f => (f._id || f) !== currentUser._id)
    }));
  };

  const handleMessage = async () => {
    try { const { data } = await messageAPI.getOrCreate(profile._id); navigate(`/messages/${data.conversation._id}`); }
    catch { toast.error('Could not open chat'); }
  };

  const handleTabChange = t => {
    setTab(t);
    const typeMap = { posts: undefined, reels: 'reel', saved: 'saved' };
    loadPosts(profile._id, typeMap[t]);
  };

  if (loading) return <ProfileSkeleton />;
  if (!profile) return null;

  const tabs = [
    { key: 'posts', Icon: FiGrid, label: 'Posts' },
    { key: 'reels', Icon: BsPlayCircle, label: 'Reels' },
    ...(isOwn ? [{ key: 'saved', Icon: FiBookmark, label: 'Saved' }] : []),
    { key: 'tagged', Icon: FiUser, label: 'Tagged' },
  ];

  return (
    <div className="max-w-[935px] mx-auto px-4 pt-8 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-8 mb-8">
        {/* Avatar */}
        <div className="flex-shrink-0 self-center sm:self-start relative">
          <div className={`${!isOwn && !isFollowing && profile.isPrivate ? '' : 'sm:w-[150px] sm:h-[150px]'}`}>
            <Avatar src={profile.avatar} size={77} alt={profile.fullName}
              className="sm:!w-[150px] sm:!h-[150px]" />
          </div>
          {isOwn && (
            <button onClick={() => navigate('/settings/profile')}
              className="absolute bottom-0 right-0 w-7 h-7 bg-[var(--bg-tertiary)] border-2 border-[var(--bg-primary)] rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow">
              <FiCamera className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Username row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h1 className="text-xl font-light">{profile.username}</h1>
            {profile.isVerified && <span className="text-blue-500" title="Verified">✓</span>}

            {isOwn ? (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigate('/settings/profile')} className="btn-outline text-sm px-4 py-1.5 font-semibold">
                  Edit profile
                </button>
                <button onClick={() => navigate('/archived')} className="btn-outline text-sm px-4 py-1.5 font-semibold">
                  View archive
                </button>
                <button onClick={() => navigate('/settings')} className="btn-outline p-2">
                  <FiSettings className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <FollowButton userId={profile._id} isFollowing={isFollowing} requestSent={requestSent} onToggle={handleFollowToggle} />
                {isFollowing && (
                  <button onClick={handleMessage} className="btn-outline text-sm px-4 py-1.5 font-semibold">Message</button>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 mb-4">
            <div><span className="font-bold">{profile.postsCount || 0}</span> <span className="text-[var(--text-secondary)] text-sm">posts</span></div>
            <button onClick={() => setFollowersModal('followers')} className="hover:opacity-70 transition-opacity">
              <span className="font-bold">{(profile.followers?.length || 0).toLocaleString()}</span>
              <span className="text-[var(--text-secondary)] text-sm"> followers</span>
            </button>
            <button onClick={() => setFollowersModal('following')} className="hover:opacity-70 transition-opacity">
              <span className="font-bold">{(profile.following?.length || 0).toLocaleString()}</span>
              <span className="text-[var(--text-secondary)] text-sm"> following</span>
            </button>
          </div>

          {/* Bio */}
          <div className="space-y-0.5">
            {profile.fullName && <p className="font-bold text-sm">{profile.fullName}</p>}
            {profile.category && <p className="text-xs text-[var(--text-muted)]">{profile.category}</p>}
            {profile.bio && <p className="text-sm whitespace-pre-wrap leading-snug">{profile.bio}</p>}
            {profile.website && (
              <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-blue-900 dark:text-blue-300 hover:underline block">
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Highlights */}
      {(isOwn || (profile.highlights?.length > 0)) && (
        <div className="flex gap-6 overflow-x-auto hide-scrollbar mb-8 pb-1">
          {profile.highlights?.map(h => (
            <div key={h._id} className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group">
              <div className="w-16 h-16 rounded-full border-2 border-[var(--border)] overflow-hidden group-hover:border-[var(--text-secondary)] transition-colors">
                {h.coverImage ? <img src={h.coverImage} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--bg-tertiary)]" />}
              </div>
              <span className="text-[11px] text-center w-16 truncate text-[var(--text-secondary)]">{h.title}</span>
            </div>
          ))}
          {isOwn && (
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--border)] flex items-center justify-center text-2xl text-[var(--text-muted)] hover:border-[var(--text-secondary)] transition-colors">+</div>
              <span className="text-[11px] text-[var(--text-muted)] text-center w-16">New</span>
            </div>
          )}
        </div>
      )}

      {/* Private lock */}
      {profile.isPrivate && !isFollowing && !isOwn && (
        <div className="text-center py-16 border-t border-[var(--border)]">
          <div className="w-16 h-16 border-2 border-[var(--text-primary)] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-lg font-bold mb-2">This Account is Private</h2>
          <p className="text-sm text-[var(--text-secondary)]">Follow this account to see their photos and videos.</p>
        </div>
      )}

      {/* Tabs + Posts */}
      {(!profile.isPrivate || isFollowing || isOwn) && (
        <>
          <div className="flex border-t border-[var(--border)] mb-0.5">
            {tabs.map(({ key, Icon, label }) => (
              <button key={key} onClick={() => handleTabChange(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold tracking-widest uppercase transition-colors border-t-2 -mt-px
                  ${tab === key ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {postsLoading ? (
            <div className="grid grid-cols-3 gap-px mt-px">
              {Array(9).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <FiCamera className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="font-bold text-lg mb-1">{isOwn ? 'Share Photos' : 'No Posts Yet'}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {isOwn ? 'When you share photos, they will appear here.' : `${profile.username} hasn't posted yet.`}
              </p>
              {isOwn && tab === 'posts' && (
                <button onClick={() => navigate('/create')} className="btn-primary mt-4 px-6 py-2 rounded-xl text-sm">
                  Share your first post
                </button>
              )}
            </div>
          ) : (
            <div className="mt-px">
              <PostGrid posts={posts} />
            </div>
          )}
        </>
      )}

      {followersModal && (
        <FollowersModal userId={profile._id} type={followersModal} onClose={() => setFollowersModal(null)} />
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-[935px] mx-auto px-4 pt-8 animate-pulse">
      <div className="flex gap-8 mb-8">
        <div className="w-[150px] h-[150px] rounded-full shimmer flex-shrink-0" />
        <div className="flex-1 space-y-4 pt-4">
          <div className="h-6 w-40 rounded shimmer" />
          <div className="flex gap-6">
            {[0,1,2].map(i => <div key={i} className="h-4 w-20 rounded shimmer" />)}
          </div>
          <div className="h-3 w-48 rounded shimmer" />
          <div className="h-3 w-64 rounded shimmer" />
        </div>
      </div>
    </div>
  );
}
