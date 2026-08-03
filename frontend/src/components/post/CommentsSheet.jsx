import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FiHeart, FiX, FiSmile } from 'react-icons/fi';

export default function CommentsSheet({ post: initialPost, onClose, onUpdate }) {
  const { user } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const comments = post.comments?.filter(c => !c.isDeleted) || [];

  const handleSubmit = async e => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      if (replyTo) {
        const { data } = await postAPI.replyToComment(post._id, replyTo._id, text.trim());
        setPost(data.post || post);
        setReplyTo(null);
      } else {
        const { data } = await postAPI.addComment(post._id, text.trim());
        setPost(p => ({ ...p, comments: [...(p.comments || []), data.comment] }));
      }
      setText('');
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 100);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  const handleLike = async commentId => {
    setPost(p => ({
      ...p,
      comments: p.comments.map(c => {
        if (c._id !== commentId) return c;
        const liked = c.likes?.some(l => (l._id || l) === user._id);
        return { ...c, likes: liked ? c.likes.filter(l => (l._id || l) !== user._id) : [...(c.likes || []), { _id: user._id }] };
      })
    }));
    await postAPI.likeComment(post._id, commentId).catch(() => {});
  };

  const handleDelete = async commentId => {
    try {
      await postAPI.deleteComment(post._id, commentId);
      setPost(p => ({ ...p, comments: p.comments.map(c => c._id === commentId ? { ...c, isDeleted: true } : c) }));
      toast.success('Comment deleted');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:rounded-2xl bg-[var(--bg-primary)] rounded-t-3xl shadow-2xl flex flex-col"
        style={{ height: '82vh', maxHeight: '82vh' }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-bold">Comments</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <FiMessageCircle className="w-12 h-12 text-[var(--text-muted)]" />
              <p className="font-bold text-lg">No comments yet</p>
              <p className="text-sm text-[var(--text-secondary)]">Be the first to comment.</p>
            </div>
          ) : comments.map(c => (
            <CommentItem key={c._id} comment={c} postAuthorId={post.author?._id || post.author}
              currentUser={user} onLike={() => handleLike(c._id)} onDelete={() => handleDelete(c._id)}
              onReply={() => { setReplyTo(c); setText(`@${c.user?.username} `); inputRef.current?.focus(); }} />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] px-3 py-3">
          {replyTo && (
            <div className="flex items-center justify-between bg-[var(--bg-tertiary)] rounded-lg px-3 py-1.5 mb-2">
              <span className="text-xs text-[var(--text-secondary)]">
                Replying to <strong>@{replyTo.user?.username}</strong>
              </span>
              <button onClick={() => { setReplyTo(null); setText(''); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-2">
                <FiX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
            <Avatar src={user?.avatar} size={32} alt={user?.fullName} />
            <div className="flex-1 flex items-center bg-[var(--bg-tertiary)] rounded-full px-4 py-2 gap-2">
              <input ref={inputRef} type="text" placeholder="Add a comment…"
                value={text} onChange={e => setText(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                maxLength={2200} />
              <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex-shrink-0">
                <FiSmile className="w-5 h-5" />
              </button>
            </div>
            <button type="submit" disabled={!text.trim() || loading}
              className="text-sm font-bold text-blue-500 hover:text-blue-600 disabled:opacity-40 transition-colors flex-shrink-0">
              {loading ? '…' : 'Post'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FiMessageCircle({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function CommentItem({ comment, postAuthorId, currentUser, onLike, onDelete, onReply }) {
  const [showReplies, setShowReplies] = useState(false);
  const isLiked = comment.likes?.some(l => (l._id || l) === currentUser?._id);
  const canDelete = comment.user?._id === currentUser?._id || postAuthorId === currentUser?._id;
  const validReplies = comment.replies?.filter(r => !r.isDeleted) || [];

  return (
    <div className="flex gap-3 py-2.5 group">
      <Link to={`/${comment.user?.username}`} className="flex-shrink-0">
        <Avatar src={comment.user?.avatar} size={32} alt={comment.user?.username} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed break-words">
              <Link to={`/${comment.user?.username}`} className="font-bold mr-1 hover:opacity-70 transition-opacity">
                {comment.user?.username}
              </Link>
              {comment.text}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {comment.likes?.length > 0 && (
                <span className="text-[11px] text-[var(--text-muted)] font-semibold">{comment.likes.length} likes</span>
              )}
              <button onClick={onReply} className="text-[11px] text-[var(--text-muted)] font-semibold hover:text-[var(--text-primary)] transition-colors">
                Reply
              </button>
              {canDelete && (
                <button onClick={onDelete}
                  className="text-[11px] text-red-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  Delete
                </button>
              )}
            </div>
          </div>
          <button onClick={onLike} className="flex-shrink-0 pt-0.5 hover:scale-110 transition-transform">
            <FiHeart className={`w-3.5 h-3.5 transition-colors ${isLiked ? 'text-red-500' : 'text-[var(--text-muted)]'}`}
              style={isLiked ? { fill: '#ef4444', stroke: '#ef4444' } : {}} />
          </button>
        </div>

        {validReplies.length > 0 && (
          <>
            <button onClick={() => setShowReplies(v => !v)}
              className="flex items-center gap-2 mt-2 text-[11px] text-[var(--text-muted)] font-semibold hover:text-[var(--text-primary)] transition-colors">
              <div className="w-6 h-px bg-[var(--border)]" />
              {showReplies ? 'Hide replies' : `View ${validReplies.length} ${validReplies.length === 1 ? 'reply' : 'replies'}`}
            </button>
            {showReplies && (
              <div className="mt-2 space-y-2">
                {validReplies.map((reply, i) => (
                  <div key={i} className="flex gap-2">
                    <Avatar src={reply.user?.avatar} size={24} alt={reply.user?.username} />
                    <div>
                      <p className="text-sm">
                        <Link to={`/${reply.user?.username}`} className="font-bold mr-1 hover:opacity-70">{reply.user?.username}</Link>
                        {reply.text}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
