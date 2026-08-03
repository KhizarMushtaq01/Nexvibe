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
  const [loadingMore, setLoadingMore] = useState(false);
  const { ref, inView } = useInView({ threshold: 0.1 });
  const navigate = useNavigate();

  const load = useCallback(async (pg = 1) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true);
    try {
      const { data } = await postAPI.getExplore(pg);
      setPosts(prev => pg === 1 ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.posts.length >= 18);
    } catch {} finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(1); }, []);

  useEffect(() => {
    if (inView && hasMore && !loadingMore && !loading) {
      const next = page + 1; setPage(next); load(next);
    }
  }, [inView, hasMore, loadingMore, loading]);

  return (
    <div className="max-w-[935px] mx-auto pt-4 pb-20">
      {/* Search bar */}
      <div className="px-4 mb-4">
        <button onClick={() => navigate('/search')}
          className="w-full flex items-center gap-3 bg-[var(--bg-tertiary)] rounded-xl px-4 py-3 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
          <FiSearch className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Search</span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-px px-0">
          {Array(18).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🌍</p>
          <h2 className="text-xl font-bold mb-2">Nothing to explore yet</h2>
          <p className="text-sm text-[var(--text-secondary)]">Posts from the community will appear here.</p>
        </div>
      ) : (
        <PostGrid posts={posts} />
      )}

      <div ref={ref} className="py-6 flex justify-center">
        {loadingMore && <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />}
      </div>
    </div>
  );
}
