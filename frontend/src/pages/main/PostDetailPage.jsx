import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';
import CommentsSheet from '../../components/post/CommentsSheet';
import PostOptionsMenu from '../../components/post/PostOptionsMenu';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FiHeart, FiMessageCircle, FiSend, FiBookmark, FiMoreHorizontal, FiArrowLeft } from 'react-icons/fi';
import { HiBookmark } from 'react-icons/hi';
import { BsChevronLeft, BsChevronRight } from 'react-icons/bs';

export default function PostDetailPage() {
  const { postId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);

  useEffect(() => {
    postAPI.getPost(postId)
      .then(({ data }) => setPost(data.post))
      .catch(() => navigate('/feed'))
      .finally(() => setLoading(false));
  }, [postId]);

  const isLiked = post?.likes?.some(l => (l._id || l) === user?._id);
  const isSaved = user?.savedPosts?.includes(postId);

  const handleLike = async () => {
    const wasLiked = isLiked;
    setPost(p => ({
      ...p,
      likes: wasLiked
        ? p.likes.filter(l => (l._id || l) !== user._id)
        : [...(p.likes || []), { _id: user._id }]
    }));
    await postAPI.likePost(postId).catch(() => {
      setPost(p => ({ ...p, likes: wasLiked ? [...p.likes, { _id: user._id }] : p.likes.slice(0, -1) }));
    });
  };

  const handleSave = async () => {
    await postAPI.savePost(postId);
    toast.success(isSaved ? 'Removed from saved' : 'Saved');
  };

  const handleComment = async e => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommenting(true);
    try {
      const { data } = await postAPI.addComment(postId, commentText.trim());
      setPost(p => ({ ...p, comments: [...(p.comments || []), data.comment] }));
      setCommentText('');
    } catch { toast.error('Failed to comment'); }
    finally { setCommenting(false); }
  };

  const renderCaption = text => text.split(/(\s)/).map((w, i) => {
    if (w.startsWith('#')) return <Link key={i} to={`/hashtag/${w.slice(1)}`} className="text-blue-500 hover:underline">{w}</Link>;
    if (w.startsWith('@')) return <Link key={i} to={`/${w.slice(1)}`} className="text-blue-500 hover:underline">{w}</Link>;
    return <span key={i}>{w}</span>;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!post) return null;

  const comments = post.comments?.filter(c => !c.isDeleted) || [];

  return (
    <div className="max-w-[935px] mx-auto pb-20 pt-4 px-4 lg:px-0 animate-fade-in">
      {/* Back btn mobile */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4 lg:hidden hover:opacity-70 transition-opacity">
        <FiArrowLeft className="w-5 h-5" />
        <span className="font-semibold">Post</span>
      </button>

      <div className="flex flex-col lg:flex-row border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--bg-primary)]">
        {/* Media panel */}
        {post.media?.length > 0 && (
          <div className="lg:flex-1 bg-black flex items-center justify-center relative" style={{ minHeight: 300, maxHeight: 600 }}>
            {post.media[mediaIndex]?.type === 'video' ? (
              <video src={post.media[mediaIndex].url} className="w-full h-full object-contain" style={{ maxHeight: 600 }} controls />
            ) : (
              <img src={post.media[mediaIndex].url} alt={post.caption || 'Post'}
                className="w-full h-full object-contain" style={{ maxHeight: 600 }} />
            )}
            {post.media.length > 1 && (
              <>
                {mediaIndex > 0 && (
                  <button onClick={() => setMediaIndex(i => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow z-10">
                    <BsChevronLeft className="w-4 h-4 text-black" />
                  </button>
                )}
                {mediaIndex < post.media.length - 1 && (
                  <button onClick={() => setMediaIndex(i => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow z-10">
                    <BsChevronRight className="w-4 h-4 text-black" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                  {post.media.map((_, i) => (
                    <button key={i} onClick={() => setMediaIndex(i)}
                      className={`rounded-full transition-all ${i === mediaIndex ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Right panel */}
        <div className="lg:w-[360px] flex-shrink-0 flex flex-col" style={{ maxHeight: 600 }}>
          {/* Author */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <Link to={`/${post.author?.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar src={post.author?.avatar} size={32} alt={post.author?.fullName} />
              <div>
                <p className="font-bold text-sm flex items-center gap-1">
                  {post.author?.username}
                  {post.author?.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                </p>
                {post.location?.name && (
                  <p className="text-[11px] text-[var(--text-muted)]">{post.location.name}</p>
                )}
              </div>
            </Link>
            <button onClick={() => setShowOptions(true)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <FiMoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Caption + comments scroll */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {post.caption && (
              <div className="flex gap-3">
                <Link to={`/${post.author?.username}`} className="flex-shrink-0">
                  <Avatar src={post.author?.avatar} size={32} alt={post.author?.fullName} />
                </Link>
                <div>
                  <p className="text-sm leading-relaxed">
                    <Link to={`/${post.author?.username}`} className="font-bold mr-1 hover:opacity-70">{post.author?.username}</Link>
                    {renderCaption(post.caption)}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )}

            {comments.map(comment => (
              <div key={comment._id} className="flex gap-3">
                <Link to={`/${comment.user?.username}`} className="flex-shrink-0">
                  <Avatar src={comment.user?.avatar} size={32} alt={comment.user?.username} />
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">
                    <Link to={`/${comment.user?.username}`} className="font-bold mr-1 hover:opacity-70">{comment.user?.username}</Link>
                    {comment.text}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </p>
                  {comment.replies?.filter(r => !r.isDeleted).map((reply, i) => (
                    <div key={i} className="flex gap-2 mt-2 ml-2">
                      <Avatar src={reply.user?.avatar} size={24} alt={reply.user?.username} />
                      <p className="text-sm">
                        <span className="font-bold mr-1">{reply.user?.username}</span>{reply.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-[var(--border)] px-4 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button onClick={handleLike} className="hover:scale-110 transition-transform active:scale-90">
                  <FiHeart className="w-7 h-7" style={isLiked ? { fill: '#ef4444', stroke: '#ef4444' } : {}} />
                </button>
                <button onClick={() => setShowComments(true)} className="hover:scale-110 transition-transform">
                  <FiMessageCircle className="w-7 h-7" />
                </button>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`); toast.success('Link copied!'); }}
                  className="hover:scale-110 transition-transform">
                  <FiSend className="w-6 h-6" />
                </button>
              </div>
              <button onClick={handleSave} className="hover:scale-110 transition-transform active:scale-90">
                {isSaved
                  ? <HiBookmark className="w-7 h-7" />
                  : <FiBookmark className="w-7 h-7" />}
              </button>
            </div>
            {!post.hideLikeCount && (
              <p className="text-sm font-bold mb-1">{(post.likes?.length || 0).toLocaleString()} likes</p>
            )}
            <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide mb-2">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </p>
          </div>

          {/* Add comment */}
          {post.allowComments !== false && (
            <form onSubmit={handleComment}
              className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment…" maxLength={2200}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" />
              {commentText && (
                <button type="submit" disabled={commenting}
                  className="text-sm font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors">
                  {commenting ? '…' : 'Post'}
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {showComments && (
        <CommentsSheet post={post} onClose={() => setShowComments(false)}
          onUpdate={updated => setPost(updated)} />
      )}
      {showOptions && (
        <PostOptionsMenu post={post} onClose={() => setShowOptions(false)}
          onDelete={() => navigate(-1)}
          onUpdate={updates => setPost(p => ({ ...p, ...updates }))} />
      )}
    </div>
  );
}
