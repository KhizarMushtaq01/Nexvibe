import { useState, useEffect } from 'react';
import { postAPI } from '../../services/api';
import PostGrid from '../../components/post/PostGrid';
import { HiOutlineBookmark } from 'react-icons/hi';

export default function SavedPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postAPI.getSaved().then(({ data }) => setPosts(data.posts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[935px] mx-auto pt-6 pb-20 px-4">
      <div className="flex items-center gap-3 mb-6">
        <HiOutlineBookmark className="w-6 h-6" />
        <h1 className="text-xl font-bold">Saved</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Only you can see what you've saved</p>
      {loading ? (
        <div className="grid grid-cols-3 gap-px">{Array(9).fill(0).map((_, i) => <div key={i} className="aspect-square shimmer" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <HiOutlineBookmark className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4" />
          <h2 className="text-xl font-bold mb-2">Save</h2>
          <p className="text-sm text-[var(--text-secondary)]">Save photos and videos that you want to see again.</p>
        </div>
      ) : <PostGrid posts={posts} />}
    </div>
  );
}
