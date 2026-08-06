import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storyAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FiX, FiSend, FiMoreHorizontal, FiPause, FiPlay, FiHeart } from 'react-icons/fi';
import { BsChevronLeft, BsChevronRight } from 'react-icons/bs';
import { useConfirm } from '../../context/DialogContext';

const STORY_DURATION = 5000;

export default function StoriesPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const [groups, setGroups] = useState([]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const progressTimer = useRef(null);
  const progressStart = useRef(null);
  const progressElapsed = useRef(0);
  const videoRef = useRef(null);

  useEffect(() => {
    storyAPI.getStories().then(({ data }) => {
      const grps = data.storyGroups || [];
      setGroups(grps);
      const idx = grps.findIndex(g => g.user?._id === userId);
      if (idx >= 0) setGroupIdx(idx);
      else if (grps.length > 0) setGroupIdx(0);
      setLoaded(true);
    }).catch(() => navigate(-1));
  }, [userId]);

  const currentGroup = groups[groupIdx];
  const currentStory = currentGroup?.stories?.[storyIdx];

  // View tracking
  useEffect(() => {
    if (!currentStory?._id) return;
    storyAPI.viewStory(currentStory._id).catch(() => {});
  }, [currentStory?._id]);

  // Progress timer for images
  const startProgress = useCallback(() => {
    if (!currentStory || currentStory.media?.type === 'video') return;
    clearInterval(progressTimer.current);
    progressStart.current = Date.now() - progressElapsed.current;
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - progressStart.current;
      const pct = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { clearInterval(progressTimer.current); goNext(); }
    }, 50);
  }, [currentStory?._id]);

  const stopProgress = useCallback(() => {
    clearInterval(progressTimer.current);
    progressElapsed.current = progress * STORY_DURATION / 100;
  }, [progress]);

  useEffect(() => {
    setProgress(0);
    progressElapsed.current = 0;
    if (!paused) startProgress();
    return () => clearInterval(progressTimer.current);
  }, [currentStory?._id, paused]);

  useEffect(() => {
    if (paused) { stopProgress(); videoRef.current?.pause(); }
    else { startProgress(); videoRef.current?.play().catch(() => {}); }
  }, [paused]);

  const goNext = useCallback(() => {
    if (!currentGroup) return;
    if (storyIdx < currentGroup.stories.length - 1) {
      setStoryIdx(i => i + 1); setProgress(0); progressElapsed.current = 0;
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1); setStoryIdx(0); setProgress(0); progressElapsed.current = 0;
    } else navigate(-1);
  }, [storyIdx, groupIdx, groups, currentGroup]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) { setStoryIdx(i => i - 1); setProgress(0); progressElapsed.current = 0; }
    else if (groupIdx > 0) { setGroupIdx(i => i - 1); setStoryIdx(0); setProgress(0); progressElapsed.current = 0; }
  }, [storyIdx, groupIdx]);

  const handleReply = async e => {
    e.preventDefault();
    if (!replyText.trim() || !currentStory) return;
    try { await storyAPI.replyToStory(currentStory._id, replyText); setReplyText(''); toast.success('Reply sent!'); }
    catch { toast.error('Failed'); }
  };

  const handleDelete = async () => {
    if (!currentStory) return;
    setPaused(true);
    const confirmed = await confirmDialog({ message: 'Delete this story?', danger: true, confirmLabel: 'Delete' });
    if (!confirmed) { setPaused(false); return; }
    try { await storyAPI.deleteStory(currentStory._id); toast.success('Story deleted'); goNext(); }
    catch { toast.error('Failed'); setPaused(false); }
  };

  const loadViewers = async () => {
    if (!currentStory) return;
    try { const { data } = await storyAPI.getViewers(currentStory._id); setViewers(data.viewers || []); setShowViewers(true); }
    catch {}
  };

  if (!loaded || !currentGroup || !currentStory) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isOwn = currentGroup.user?._id === user?._id;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Close */}
      <button onClick={() => navigate(-1)}
        className="absolute top-4 right-4 z-50 p-2 text-white hover:bg-white/10 rounded-full transition-colors">
        <FiX className="w-6 h-6" />
      </button>

      {/* Prev group nav */}
      {groupIdx > 0 && (
        <button onClick={() => { setGroupIdx(i => i - 1); setStoryIdx(0); setProgress(0); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex w-10 h-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full items-center justify-center transition-colors">
          <BsChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      {groupIdx < groups.length - 1 && (
        <button onClick={() => { setGroupIdx(i => i + 1); setStoryIdx(0); setProgress(0); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex w-10 h-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full items-center justify-center transition-colors">
          <BsChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Story container */}
      <div className="relative w-full max-w-[400px] h-full" style={{ maxHeight: '100svh' }}>
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-3 pt-3">
          {currentGroup.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-none"
                style={{ width: `${i < storyIdx ? 100 : i === storyIdx ? progress : 0}%` }} />
            </div>
          ))}
        </div>

        {/* Author header */}
        <div className="absolute top-7 left-0 right-0 z-20 flex items-center justify-between px-3 pt-1">
          <Link to={`/${currentGroup.user?.username}`} className="flex items-center gap-2">
            <Avatar src={currentGroup.user?.avatar} size={36} alt={currentGroup.user?.username} />
            <div>
              <p className="text-white font-semibold text-sm drop-shadow">{currentGroup.user?.username}</p>
              <p className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(currentStory.createdAt), { addSuffix: true })}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={() => setPaused(p => !p)} className="p-2 text-white hover:bg-white/10 rounded-full">
              {paused ? <FiPlay className="w-4 h-4" /> : <FiPause className="w-4 h-4" />}
            </button>
            {isOwn && (
              <button onClick={handleDelete} className="p-2 text-white hover:bg-white/10 rounded-full">
                <FiMoreHorizontal className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Media */}
        <div className="w-full h-full relative">
          {currentStory.media?.type === 'video' ? (
            <video ref={videoRef} src={currentStory.media.url}
              className="w-full h-full object-cover" playsInline autoPlay muted
              onEnded={goNext}
              onTimeUpdate={e => setProgress((e.target.currentTime / e.target.duration) * 100)}
              style={{ maxHeight: '100svh' }} />
          ) : (
            <img src={currentStory.media?.url} className="w-full h-full object-cover" style={{ maxHeight: '100svh' }}
              alt="Story" />
          )}

          {/* Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

          {/* Text overlay */}
          {currentStory.text && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
              <div className="bg-black/50 backdrop-blur-sm rounded-2xl px-5 py-3 max-w-[80%] text-center">
                <p className="text-white text-lg font-semibold leading-snug">{currentStory.text}</p>
              </div>
            </div>
          )}

          {/* Tap zones */}
          <div className="absolute inset-0 flex">
            <div className="w-1/3 h-full" onClick={goPrev} />
            <div className="flex-1 h-full"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onPointerLeave={() => setPaused(false)} />
            <div className="w-1/3 h-full" onClick={goNext} />
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-6">
          {isOwn ? (
            <button onClick={loadViewers}
              className="flex items-center gap-2 text-white/90 hover:text-white transition-colors">
              <span className="text-lg">👁</span>
              <span className="text-sm font-medium">{currentStory.viewers?.length || 0} views</span>
            </button>
          ) : (
            <form onSubmit={handleReply} className="flex items-center gap-3">
              <input value={replyText} onChange={e => setReplyText(e.target.value)}
                placeholder={`Reply to ${currentGroup.user?.username}…`}
                className="flex-1 bg-transparent border border-white/50 text-white placeholder:text-white/60 rounded-full px-4 py-2.5 text-sm outline-none focus:border-white/80 transition-colors" />
              <button type="button" className="text-white text-xl hover:scale-110 transition-transform">
                <FiHeart className="w-6 h-6" />
              </button>
              {replyText && (
                <button type="submit" className="text-white hover:scale-110 transition-transform">
                  <FiSend className="w-5 h-5" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Viewers sheet */}
      {showViewers && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-end" onClick={() => setShowViewers(false)}>
          <div className="w-full bg-[var(--bg-primary)] rounded-t-3xl p-5 max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Viewers ({viewers.length})</h3>
              <button onClick={() => setShowViewers(false)} className="p-1"><FiX className="w-5 h-5" /></button>
            </div>
            {viewers.length === 0
              ? <p className="text-center text-[var(--text-muted)] py-6 text-sm">No views yet</p>
              : viewers.map(v => (
                <div key={v._id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
                  <Avatar src={v.user?.avatar} size={40} alt={v.user?.username} />
                  <div>
                    <p className="font-semibold text-sm">{v.user?.username}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatDistanceToNow(new Date(v.viewedAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
