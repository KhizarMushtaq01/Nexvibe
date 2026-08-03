import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiHeart, FiMessageCircle } from 'react-icons/fi';
import { BsImages, BsPlayCircleFill } from 'react-icons/bs';

export default function PostGrid({ posts }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-3 gap-px">
      {posts.map(post => (
        <PostGridItem key={post._id} post={post} onClick={() => navigate(`/p/${post._id}`)} />
      ))}
    </div>
  );
}

function PostGridItem({ post, onClick }) {
  const [hovered, setHovered] = useState(false);
  const media = post.media?.[0];
  const isVideo = media?.type === 'video';
  const isCarousel = post.media?.length > 1;

  return (
    <div className="relative aspect-square cursor-pointer overflow-hidden bg-[var(--bg-tertiary)]"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {isVideo ? (
        <video src={media.url} className="w-full h-full object-cover" muted preload="metadata" />
      ) : media?.url ? (
        <img src={media.url} alt={post.caption || 'Post'} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-[var(--bg-tertiary)] flex items-center justify-center">
          <p className="text-xs text-[var(--text-muted)] p-2 text-center line-clamp-3">{post.caption}</p>
        </div>
      )}

      {/* Type indicator */}
      {isCarousel && (
        <div className="absolute top-2 right-2 drop-shadow-md">
          <BsImages className="w-4 h-4 text-white" />
        </div>
      )}
      {isVideo && !isCarousel && (
        <div className="absolute top-2 right-2 drop-shadow-md">
          <BsPlayCircleFill className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Hover overlay */}
      {hovered && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-5 animate-fade-in">
          <span className="flex items-center gap-1.5 text-white font-bold text-sm drop-shadow">
            <FiHeart className="w-5 h-5" style={{ fill: 'white', stroke: 'white' }} />
            {(post.likes?.length || 0).toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 text-white font-bold text-sm drop-shadow">
            <FiMessageCircle className="w-5 h-5" style={{ fill: 'white', stroke: 'white' }} />
            {(post.comments?.filter(c => !c.isDeleted).length || 0).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
