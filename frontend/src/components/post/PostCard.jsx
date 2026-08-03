import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../common/Avatar';
import CommentsSheet from './CommentsSheet';
import PostOptionsMenu from './PostOptionsMenu';
import toast from 'react-hot-toast';
import { FiHeart, FiMessageCircle, FiSend, FiMoreHorizontal, FiBookmark } from 'react-icons/fi';
import { HiBookmark } from 'react-icons/hi';
import { BsChevronLeft, BsChevronRight, BsImages, BsPlayCircle } from 'react-icons/bs';

export default function PostCard({ post: initialPost, onUpdate, onDelete }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(initialPost);
  const [showComments, setShowComments] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const lastTap = useRef(0);

  const isLiked = post.likes?.some(l => (l._id || l) === user?._id);
  const isSaved = user?.savedPosts?.includes(post._id);

  const handleLike = async () => {
    const wasLiked = isLiked;
    const newLikes = wasLiked
      ? post.likes.filter(l => (l._id || l) !== user._id)
      : [...(post.likes || []), { _id: user._id }];
    setPost(p => ({ ...p, likes: newLikes }));
    try { await postAPI.likePost(post._id); }
    catch { setPost(p => ({ ...p, likes: post.likes })); }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!isLiked) {
        handleLike();
        setHeartAnim(true);
        setTimeout(() => setHeartAnim(false), 900);
      }
    }
    lastTap.current = now;
  };

  const handleSave = async () => {
    try { await postAPI.savePost(post._id); toast.success(isSaved ? 'Removed from saved' : 'Saved'); }
    catch { toast.error('Failed'); }
  };

  const caption = post.caption || '';
  const needsTruncate = caption.length > 125;
  const displayCaption = captionExpanded || !needsTruncate ? caption : caption.slice(0, 125) + '…';

  const renderCaption = (text) =>
    text.split(/(\s)/).map((word, i) => {
      if (word.startsWith('#')) return <Link key={i} to={`/hashtag/${word.slice(1)}`} className="text-blue-500 font-medium hover:underline">{word}</Link>;
      if (word.startsWith('@')) return <Link key={i} to={`/${word.slice(1)}`} className="text-blue-500 font-medium hover:underline">{word}</Link>;
      return <span key={i}>{word}</span>;
    });

  return (
    <article className="bg-[var(--bg-primary)] border-b border-[var(--border)] lg:border lg:rounded-xl lg:mb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Link to={`/${post.author?.username}`}>
            <Avatar src={post.author?.avatar} size={36} alt={post.author?.fullName} />
          </Link>
          <div>
            <div className="flex items-center gap-1.5">
              <Link to={`/${post.author?.username}`} className="text-sm font-bold hover:opacity-70 transition-opacity">
                {post.author?.username}
              </Link>
              {post.author?.isVerified && (
                <span className="text-blue-500 text-xs" title="Verified account">✓</span>
              )}
            </div>
            {post.location?.name && (
              <p className="text-xs text-[var(--text-secondary)] leading-none">{post.location.name}</p>
            )}
          </div>
        </div>
        <button onClick={() => setShowOptions(true)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
          <FiMoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Media */}
      {post.media?.length > 0 && (
        <div className="relative bg-black select-none" onClick={handleDoubleTap}>
          <div className="relative aspect-square overflow-hidden">
            {post.media[mediaIndex]?.type === 'video' ? (
              <video src={post.media[mediaIndex].url} className="w-full h-full object-cover" controls muted playsInline />
            ) : (
              <img src={post.media[mediaIndex]?.url} alt={post.caption || 'Post'}
                className="w-full h-full object-cover" draggable={false} loading="lazy" />
            )}
          </div>

          {/* Double-tap heart */}
          {heartAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <FiHeart className="w-28 h-28 text-white drop-shadow-2xl animate-heart-burst"
                style={{ fill: 'white', stroke: 'white' }} />
            </div>
          )}

          {/* Multi-image indicator */}
          {post.media.length > 1 && (
            <div className="absolute top-3 right-3">
              <BsImages className="w-5 h-5 text-white drop-shadow-md" />
            </div>
          )}

          {/* Video indicator */}
          {post.media[mediaIndex]?.type === 'video' && post.media.length === 1 && (
            <div className="absolute top-3 right-3">
              <BsPlayCircle className="w-5 h-5 text-white drop-shadow-md" />
            </div>
          )}

          {/* Carousel nav */}
          {post.media.length > 1 && (
            <>
              {mediaIndex > 0 && (
                <button onClick={e => { e.stopPropagation(); setMediaIndex(i => i - 1); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-lg transition-all z-10">
                  <BsChevronLeft className="w-4 h-4 text-black" />
                </button>
              )}
              {mediaIndex < post.media.length - 1 && (
                <button onClick={e => { e.stopPropagation(); setMediaIndex(i => i + 1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-lg transition-all z-10">
                  <BsChevronRight className="w-4 h-4 text-black" />
                </button>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {post.media.map((_, i) => (
                  <button key={i} onClick={e => { e.stopPropagation(); setMediaIndex(i); }}
                    className={`rounded-full transition-all ${i === mediaIndex ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3.5">
            <button onClick={handleLike} className="transition-transform active:scale-90 hover:scale-110">
              {isLiked
                ? <FiHeart className="w-7 h-7 text-red-500 animate-bounce-subtle" style={{ fill: '#ef4444', stroke: '#ef4444' }} />
                : <FiHeart className="w-7 h-7 text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors" />
              }
            </button>
            <button onClick={() => setShowComments(true)}
              className="hover:text-[var(--text-secondary)] transition-colors active:scale-90">
              <FiMessageCircle className="w-7 h-7" />
            </button>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`).then(() => toast.success('Link copied!'))}
              className="hover:text-[var(--text-secondary)] transition-colors active:scale-90">
              <FiSend className="w-6 h-6" />
            </button>
          </div>
          <button onClick={handleSave} className="transition-transform active:scale-90 hover:scale-110">
            {isSaved
              ? <HiBookmark className="w-7 h-7" />
              : <FiBookmark className="w-7 h-7 hover:text-[var(--text-secondary)] transition-colors" />
            }
          </button>
        </div>

        {/* Likes count */}
        {!post.hideLikeCount && (
          <p className="text-sm font-bold mb-1.5">
            {(post.likes?.length || 0).toLocaleString()} {post.likes?.length === 1 ? 'like' : 'likes'}
          </p>
        )}

        {/* Caption */}
        {caption && (
          <p className="text-sm leading-relaxed mb-1">
            <Link to={`/${post.author?.username}`} className="font-bold mr-1 hover:opacity-70 transition-opacity">
              {post.author?.username}
            </Link>
            {renderCaption(displayCaption)}
            {needsTruncate && !captionExpanded && (
              <button onClick={() => setCaptionExpanded(true)}
                className="text-[var(--text-muted)] ml-1 hover:text-[var(--text-secondary)]">more</button>
            )}
          </p>
        )}

        {/* Comments count */}
        {post.comments?.filter(c => !c.isDeleted).length > 0 && (
          <button onClick={() => setShowComments(true)}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors block mb-1">
            View all {post.comments.filter(c => !c.isDeleted).length} comments
          </button>
        )}

        {/* Preview top comment */}
        {post.comments?.filter(c => !c.isDeleted)[0] && (
          <p className="text-sm mb-1 line-clamp-2">
            <span className="font-bold mr-1">{post.comments.find(c => !c.isDeleted)?.user?.username}</span>
            {post.comments.find(c => !c.isDeleted)?.text}
          </p>
        )}

        {/* Timestamp */}
        <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide mt-1">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Add comment input */}
      <AddCommentInput postId={post._id} onCommentAdded={c => {
        setPost(p => ({ ...p, comments: [...(p.comments || []), c] }));
      }} />

      {showComments && (
        <CommentsSheet post={post} onClose={() => setShowComments(false)}
          onUpdate={updated => setPost(updated)} />
      )}
      {showOptions && (
        <PostOptionsMenu post={post} onClose={() => setShowOptions(false)}
          onDelete={() => { setShowOptions(false); onDelete?.(post._id); }}
          onUpdate={updates => { setPost(p => ({ ...p, ...updates })); onUpdate?.(post._id, updates); setShowOptions(false); }} />
      )}
    </article>
  );
}

function AddCommentInput({ postId, onCommentAdded }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const { data } = await postAPI.addComment(postId, text.trim());
      onCommentAdded(data.comment);
      setText('');
    } catch { toast.error('Failed to add comment'); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border)]">
      <input type="text" placeholder="Add a comment…" value={text} onChange={e => setText(e.target.value)}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" maxLength={2200} />
      {text && (
        <button type="submit" disabled={loading}
          className="text-sm font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors">
          {loading ? '…' : 'Post'}
        </button>
      )}
    </form>
  );
}
