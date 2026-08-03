import { useState, useEffect } from 'react';
import { postAPI } from '../../services/api';
import PostGrid from '../../components/post/PostGrid';

export default function ArchivedPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postAPI.getArchived().then(({ data }) => setPosts(data.posts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[935px] mx-auto pt-6 pb-20 px-4">
      <h1 className="text-xl font-bold mb-2">Archive</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Only you can see what's in your archive</p>
      {loading ? (
        <div className="grid grid-cols-3 gap-px">{Array(9).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🗄</p>
          <h2 className="text-xl font-bold mb-2">No archived posts</h2>
          <p className="text-sm text-[var(--text-secondary)]">Archived posts will appear here.</p>
        </div>
      ) : <PostGrid posts={posts} />}
    </div>
  );
}
