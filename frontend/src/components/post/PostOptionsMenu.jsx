import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { postAPI, userAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ReportModal from '../common/ReportModal';

export default function PostOptionsMenu({ post, onClose, onDelete, onUpdate }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwn = post.author?._id === user?._id || post.author === user?._id;
  const [reportTarget, setReportTarget] = useState(null); // null | 'post' | 'author'

  const actions = isOwn ? [
    {
      label: 'Delete', danger: true, onClick: async () => {
        if (!window.confirm('Delete this post? This cannot be undone.')) return;
        try { await postAPI.deletePost(post._id); toast.success('Post deleted'); onDelete?.(); }
        catch { toast.error('Failed to delete'); }
      }
    },
    {
      label: post.isArchived ? 'Unarchive' : 'Archive', onClick: async () => {
        try { const { data } = await postAPI.archivePost(post._id); onUpdate?.({ isArchived: data.isArchived }); toast.success(data.isArchived ? 'Archived' : 'Unarchived'); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    {
      label: post.isPinned ? 'Unpin from profile' : 'Pin to profile', onClick: async () => {
        try { await postAPI.pinPost(post._id); onUpdate?.({ isPinned: !post.isPinned }); toast.success(post.isPinned ? 'Unpinned' : 'Pinned to profile'); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    { label: 'Go to post', onClick: () => { navigate(`/p/${post._id}`); onClose(); } },
    {
      label: 'Copy link', onClick: () => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`);
        toast.success('Link copied!');
        onClose();
      }
    },
    { label: 'Cancel', onClick: onClose },
  ] : [
    { label: 'Report', danger: true, onClick: () => setReportTarget('post') },
    { label: `Report @${post.author?.username}`, danger: true, onClick: () => setReportTarget('author') },
    { label: 'Not interested', onClick: () => { onDelete?.(); onClose(); toast('Got it, we\'ll show you fewer posts like this'); } },
    {
      label: `Unfollow @${post.author?.username}`, danger: true, onClick: async () => {
        try { await userAPI.followUser(post.author?._id); toast.success(`Unfollowed @${post.author?.username}`); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    { label: 'Go to post', onClick: () => { navigate(`/p/${post._id}`); onClose(); } },
    {
      label: 'Copy link', onClick: () => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`);
        toast.success('Link copied!');
        onClose();
      }
    },
    { label: 'Cancel', onClick: onClose },
  ];

  if (reportTarget) {
    return (
      <ReportModal
        targetType={reportTarget === 'post' ? 'post' : 'user'}
        targetId={reportTarget === 'post' ? post._id : post.author?._id}
        label={reportTarget === 'post' ? 'Report this post' : `Report @${post.author?.username}`}
        onClose={() => { setReportTarget(null); onClose(); }}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {actions.map((action, i) => (
          <button key={i} onClick={action.onClick}
            className={`w-full py-4 px-6 text-center text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]
              ${action.danger ? 'text-red-500 font-bold' : action.label === 'Cancel' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}
              ${i < actions.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
