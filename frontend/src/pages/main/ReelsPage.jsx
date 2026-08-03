import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { reelAPI, postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';
import { FiHeart, FiMessageCircle, FiSend, FiBookmark, FiMoreHorizontal, FiPlay, FiPause, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { BsMusicNote } from 'react-icons/bs';

export default function ReelsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reelAPI.getFeed()
      .then(({ data }) => setReels(data.reels || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-black">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (reels.length === 0) return (
    <div className="flex flex-col items-center justify-center h-screen gap-5 bg-[var(--bg-primary)]">
      <div className="text-6xl">🎬</div>
      <h2 className="text-2xl font-bold">No reels yet</h2>
      <p className="text-sm text-[var(--text-secondary)] text-center max-w-xs">
        Follow people to see their reels, or create your first reel.
      </p>
      <button onClick={() => navigate('/create', { state: { intent: 'reel' } })} className="btn-brand px-6 py-2.5 rounded-xl">
        Create a reel
      </button>
    </div>
  );

  return (
    <div className="max-w-[470px] mx-auto">
      {reels.map((reel, idx) => (
        <ReelCard key={reel._id} reel={reel} isFirst={idx === 0} />
      ))}
    </div>
  );
}

function ReelCard({ reel, isFirst }) {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(isFirst);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(reel.likes?.some(l => (l._id || l) === user?._id));
  const [likesCount, setLikesCount] = useState(reel.likes?.length || 0);
  const [saved, setSaved] = useState(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().catch(() => {}); setPlaying(true); }
  };

  const handleLike = async () => {
    const wasLiked = liked;
    setLiked(!liked);
    setLikesCount(n => wasLiked ? n - 1 : n + 1);
    await postAPI.likePost(reel._id).catch(() => { setLiked(wasLiked); setLikesCount(n => wasLiked ? n + 1 : n - 1); });
  };

  const handleSave = async () => {
    setSaved(!saved);
    await postAPI.savePost(reel._id).catch(() => setSaved(s => !s));
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${reel._id}`);
    toast.success('Link copied!');
  };

  return (
    <div className="relative bg-black overflow-hidden rounded-2xl mb-4 mx-2 lg:mx-0"
      style={{ height: 'calc(100vh - 100px)', maxHeight: 700 }}>
      {/* Video */}
      {reel.media?.[0] ? (
        <video
          ref={videoRef}
          src={reel.media[0].url}
          className="w-full h-full object-cover cursor-pointer"
          loop muted={muted} playsInline
          autoPlay={isFirst}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-purple-900 via-pink-900 to-black flex items-center justify-center">
          <span className="text-white text-6xl">🎬</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

      {/* Play/Pause center indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <FiPlay className="w-7 h-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={() => setMuted(!muted)}
          className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition-colors">
          {muted ? <FiVolumeX className="w-4 h-4 text-white" /> : <FiVolume2 className="w-4 h-4 text-white" />}
        </button>
      </div>

      {/* Right action column */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors ${liked ? 'text-red-500' : 'text-white'}`}>
            <FiHeart className="w-7 h-7" style={liked ? { fill: '#ef4444', stroke: '#ef4444' } : {}} />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{likesCount.toLocaleString()}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <FiMessageCircle className="w-7 h-7" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">
            {reel.comments?.filter(c => !c.isDeleted).length || 0}
          </span>
        </button>

        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <FiSend className="w-6 h-6" />
          </div>
          <span className="text-white text-xs drop-shadow">{reel.shareCount || 0}</span>
        </button>

        <button onClick={handleSave} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <FiBookmark className="w-6 h-6" style={saved ? { fill: 'white' } : {}} />
          </div>
        </button>

        <button className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <FiMoreHorizontal className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-16">
        <Link to={`/${reel.author?.username}`} className="flex items-center gap-2.5 mb-2.5 group">
          <Avatar src={reel.author?.avatar} size={36} alt={reel.author?.fullName} />
          <div>
            <p className="text-white font-bold text-sm drop-shadow group-hover:opacity-80 transition-opacity">
              @{reel.author?.username}
            </p>
            {reel.author?.isVerified && <span className="text-blue-400 text-xs">✓ Verified</span>}
          </div>
          {reel.author?.username !== user?.username && (
            <button className="ml-2 border border-white text-white text-xs font-semibold px-3 py-1 rounded-lg hover:bg-white hover:text-black transition-colors">
              Follow
            </button>
          )}
        </Link>

        {reel.caption && (
          <p className="text-white text-sm leading-relaxed mb-2 drop-shadow line-clamp-2">
            {reel.caption}
          </p>
        )}

        {reel.music && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
              <BsMusicNote className="w-2.5 h-2.5 text-white" />
            </div>
            <p className="text-white/80 text-xs truncate max-w-[200px]">
              {reel.music.title}{reel.music.artist ? ` · ${reel.music.artist}` : ''}
            </p>
            <div className="w-6 h-6 rounded-full overflow-hidden border border-white/30 ml-auto animate-spin-slow">
              {reel.author?.avatar
                ? <img src={reel.author.avatar} className="w-full h-full object-cover" />
                : <div className="w-full h-full ig-gradient" />
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
