import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';

const TABS = [
  { value: '', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'user', label: 'Users' },
];

export default function AdminReports() {
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReports({ page, limit: 20, ...(targetType ? { targetType } : {}) });
      setGroups(data.groups);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, [page, targetType]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (group, action) => {
    const verb = action === 'dismiss' ? 'Dismiss this report' : group.targetType === 'post' ? 'Remove this post' : 'Ban this user';
    if (!confirm(`${verb}?`)) return;
    try {
      await adminAPI.resolveReport({ targetType: group.targetType, targetId: group.targetId, action });
      setGroups(prev => prev.filter(g => !(g.targetType === group.targetType && g.targetId === group.targetId)));
      setTotal(t => t - 1);
      toast.success(action === 'dismiss' ? 'Dismissed' : 'Action taken');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} pending</p>
      </div>

      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button key={t.value} onClick={() => { setTargetType(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${targetType === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">No pending reports 🎉</div>
        ) : (
          groups.map(g => (
            <div key={`${g.targetType}-${g.targetId}`} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4">
              {g.targetMissing ? (
                <div className="flex-1 text-sm text-[var(--text-muted)]">This {g.targetType} no longer exists.</div>
              ) : g.targetType === 'post' ? (
                <>
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
                    {g.target.media?.[0] && (
                      g.target.media[0].type === 'video'
                        ? <video src={g.target.media[0].url} className="w-full h-full object-cover" muted />
                        : <img src={g.target.media[0].url} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">@{g.target.author?.username}</p>
                    {g.target.caption && <p className="text-xs text-[var(--text-secondary)] truncate">{g.target.caption}</p>}
                  </div>
                </>
              ) : (
                <>
                  <Avatar src={g.target.avatar} size={44} alt={g.target.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">@{g.target.username}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{g.target.fullName}</p>
                  </div>
                </>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold mb-1">{g.count} report{g.count > 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-1 mb-1">
                  {Object.entries(g.reasonCounts).map(([reason, count]) => (
                    <span key={reason} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {reason} ×{count}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {g.reporters.map(r => `@${r.username}`).join(', ')}{g.count > g.reporters.length ? ` +${g.count - g.reporters.length} more` : ''}
                </p>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                {!g.targetMissing && (
                  <Link to={g.targetType === 'post' ? `/p/${g.targetId}` : `/${g.target.username}`} target="_blank"
                    className="text-xs text-center btn-outline px-3 py-1.5 rounded-lg">
                    {g.targetType === 'post' ? 'View Post' : 'View Profile'}
                  </Link>
                )}
                <button onClick={() => handleResolve(g, 'dismiss')} className="text-xs btn-outline px-3 py-1.5 rounded-lg">
                  Dismiss
                </button>
                {!g.targetMissing && (
                  <button onClick={() => handleResolve(g, 'remove')} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                    {g.targetType === 'post' ? 'Remove Post' : 'Ban User'}
                  </button>
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
