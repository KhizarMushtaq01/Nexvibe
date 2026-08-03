import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { postAPI } from '../../services/api';
import PostGrid from '../../components/post/PostGrid';
import { useInView } from 'react-intersection-observer';

export default function HashtagPage() {
  const { tag } = useParams();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { ref, inView } = useInView({ threshold: 0.1 });

  const load = async (pg = 1) => {
    if (pg === 1) setLoading(true);
    try {
      const { data } = await postAPI.getHashtagPosts(tag, pg);
      setPosts(prev => pg === 1 ? data.posts : [...prev, ...data.posts]);
      setTotal(data.total);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, [tag]);
  useEffect(() => { if (inView && !loading && posts.length < total) { const next = page + 1; setPage(next); load(next); } }, [inView]);

  return (
    <div className="max-w-[935px] mx-auto pt-6 pb-20 px-4">
      <div className="flex items-center gap-6 mb-8 pb-6 border-b border-[var(--border)]">
        <div className="w-20 h-20 rounded-full ig-gradient flex items-center justify-center text-white text-3xl font-bold">#</div>
        <div>
          <h1 className="text-2xl font-bold">#{tag}</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">{total.toLocaleString()} posts</p>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-px">{Array(9).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20"><p className="text-4xl mb-3">#</p><p className="text-[var(--text-secondary)] text-sm">No posts for #{tag}</p></div>
      ) : <PostGrid posts={posts} />}
      <div ref={ref} />
    </div>
  );
}
