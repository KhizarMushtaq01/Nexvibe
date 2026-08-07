import { useState, useEffect, useCallback } from 'react';
import { FiEye, FiHeart, FiMessageCircle, FiSearch, FiTrash2 } from 'react-icons/fi';
import { adminAPI } from '../../services/api';
import { Link } from 'react-router-dom';
import Avatar from '../../components/common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';

export default function AdminPosts() {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const confirmDialog = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getPosts({ page, limit: 20, search });
      setPosts(data.posts);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: 'Remove this post?', danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await adminAPI.deletePost(id);
      setPosts(prev => prev.filter(p => p._id !== id));
      toast.success('Post removed');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Posts</h1>
          <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} total posts</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-md">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search posts by caption..."
          className="input-field pl-9 w-full" />
      </div>

      {/* Posts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          Array(12).fill(0).map((_, i) => <div key={i} className="aspect-square rounded-2xl shimmer" />)
        ) : posts.length === 0 ? (
          <div className="col-span-full text-center py-16 text-[var(--text-muted)]">No posts found</div>
        ) : (
          posts.map(post => (
            <div key={post._id} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl overflow-hidden group">
              {/* Media */}
              <div className="aspect-square relative bg-[var(--bg-tertiary)]">
                {post.media?.[0] ? (
                  post.media[0].type === 'video' ? (
                    <video src={post.media[0].url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={post.media[0].url} className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm p-4 text-center">
                    {post.caption?.slice(0, 60) || 'No media'}
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <span className="text-white text-sm flex items-center gap-1">
                    <FiHeart className="w-4 h-4" /> {post.likes?.length || 0}
                  </span>
                  <span className="text-white text-sm flex items-center gap-1">
                    <FiMessageCircle className="w-4 h-4" /> {post.comments?.length || 0}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar src={post.author?.avatar} size={24} alt={post.author?.fullName} />
                  <Link to={`/${post.author?.username}`} className="text-xs font-semibold hover:underline truncate">
                    @{post.author?.username}
                  </Link>
                </div>
                {post.caption && (
                  <p className="text-xs text-[var(--text-secondary)] mb-2 line-clamp-2">{post.caption}</p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </p>
                  <div className="flex gap-1">
                    <Link to={`/p/${post._id}`} target="_blank"
                      className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
                      <FiEye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </Link>
                    <button onClick={() => handleDelete(post._id)}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors">
                      <FiTrash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6">
          <p className="text-sm text-[var(--text-muted)]">
            Page {page} of {pages} · {total} total
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
