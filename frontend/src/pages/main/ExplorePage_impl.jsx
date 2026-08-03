import { useState, useEffect, useCallback } from 'react';
import { postAPI } from '../../services/api';
import PostGrid from '../../components/post/PostGrid';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';

export default function ExplorePage() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const { ref, inView } = useInView({ threshold: 0.1 });
  const navigate = useNavigate();

  const load = useCallback(async (pg = 1) => {
    if (pg === 1) setLoading(true);
    try {
      const { data } = await postAPI.getExplore(pg);
      setPosts(prev => pg === 1 ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.posts.length === 18);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, []);
  useEffect(() => { if (inView && hasMore && !loading) { const next = page + 1; setPage(next); load(next); } }, [inView, hasMore, loading]);

  return (
    <div className="max-w-[935px] mx-auto px-0 pt-4 pb-20">
      {/* Search bar */}
      <div className="px-4 mb-6">
        <button onClick={() => navigate('/search')}
          className="w-full flex items-center gap-3 bg-[var(--bg-tertiary)] rounded-xl px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-opacity-80 transition-colors">
          <FiSearch className="w-4 h-4" />
          Search
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-px">
          {Array(18).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}
        </div>
      ) : (
        <PostGrid posts={posts} />
      )}

      <div ref={ref} className="py-4 flex justify-center">
        {!loading && !hasMore && posts.length > 0 && <p className="text-xs text-[var(--text-muted)]">No more posts</p>}
      </div>
    </div>
  );
}
