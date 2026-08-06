import { useState, useEffect, useCallback } from 'react';
import { postAPI, storyAPI } from '../../services/api';
import PostCard from '../../components/post/PostCard';
import StoriesBar from '../../components/story/StoriesBar';
import SuggestedUsers from '../../components/common/SuggestedUsers';
import PostSkeleton from '../../components/common/PostSkeleton';
import { useInView } from 'react-intersection-observer';
import { FiCamera } from 'react-icons/fi';

export default function FeedPage() {
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { ref, inView } = useInView({ threshold: 0.1 });

  const fetchPosts = useCallback(async (pg = 1) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true);
    try {
      const { data } = await postAPI.getFeed(pg);
      setPosts(prev => pg === 1 ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.pagination?.hasMore ?? false);
    } catch {} finally {
      setLoading(false); setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(1);
    storyAPI.getStories().then(({ data }) => setStories(data.storyGroups || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (inView && hasMore && !loadingMore && !loading) {
      const next = page + 1; setPage(next); fetchPosts(next);
    }
  }, [inView, hasMore, loadingMore, loading]);

  const handleUpdate = (postId, updates) => setPosts(prev => prev.map(p => p._id === postId ? { ...p, ...updates } : p));
  const handleDelete = postId => setPosts(prev => prev.filter(p => p._id !== postId));

  return (
    <div className="flex justify-center min-h-screen">
      <div className="w-full max-w-[470px] pt-4 pb-10">
        <StoriesBar stories={stories} />
        {loading
          ? Array(3).fill(0).map((_, i) => <PostSkeleton key={i} />)
          : posts.length === 0
            ? <EmptyFeed />
            : posts.map(post => <PostCard key={post._id} post={post} onUpdate={handleUpdate} onDelete={handleDelete} />)
        }
        <div ref={ref} className="py-6 flex justify-center">
          {loadingMore && <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />}
          {!hasMore && posts.length > 0 && <p className="text-sm text-[var(--text-muted)]">You're all caught up ✓</p>}
        </div>
      </div>
      <div className="hidden xl:block w-[320px] ml-16 pt-6 sticky top-0 self-start">
        <SuggestedUsers />
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <FiCamera className="w-14 h-14 mb-5 text-[var(--text-muted)]" />
      <h2 className="text-2xl font-bold mb-2">Welcome to NexVibe</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">Follow people to see their photos and videos here in your feed.</p>
    </div>
  );
}
