// frontend/src/pages/admin/AdminReviews.jsx
import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';
import { FiCheckCircle } from 'react-icons/fi';
import { AiFillStar, AiOutlineStar } from 'react-icons/ai';

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) =>
        n <= rating
          ? <AiFillStar key={n} className="w-3.5 h-3.5 text-yellow-400" />
          : <AiOutlineStar key={n} className="w-3.5 h-3.5 text-[var(--border)]" />
      )}
    </div>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const confirmDialog = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReviews({ status, page, limit: 20 });
      setReviews(data.reviews);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reviews'); }
    finally { setLoading(false); }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const handleModerate = async (review, action) => {
    const verb = action === 'approve' ? 'Approve' : 'Reject';
    if (!(await confirmDialog({ message: `${verb} this review?`, danger: action === 'reject', confirmLabel: verb }))) return;
    try {
      await adminAPI.moderateReview(review._id, action);
      toast.success(action === 'approve' ? 'Review approved' : 'Review rejected');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} {status}</p>
      </div>

      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => { setStatus(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${status === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            {status === 'pending' ? (
              <span className="flex items-center justify-center gap-1.5">
                <FiCheckCircle className="w-4 h-4 text-green-500" /> No pending reviews
              </span>
            ) : `No ${status} reviews yet`}
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r._id} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Avatar src={r.user?.avatar} size={44} alt={r.user?.fullName} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">@{r.user?.username || 'deleted user'}</p>
                  <StarRating rating={r.rating} />
                  <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">{r.text}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0 sm:items-end">
                {status === 'pending' ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleModerate(r, 'reject')}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      Reject
                    </button>
                    <button onClick={() => handleModerate(r, 'approve')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors">
                      Approve
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-right">
                    <p className="font-semibold capitalize">{status}</p>
                    <p className="text-[var(--text-muted)]">
                      by {r.moderatedBy ? `@${r.moderatedBy.username}` : 'unknown'}
                      {r.moderatedAt && ` · ${formatDistanceToNow(new Date(r.moderatedAt), { addSuffix: true })}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-[var(--text-muted)]">Page {page} of {pages} · {total} total</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
