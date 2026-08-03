import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../common/Avatar';
import CreateStoryModal from './CreateStoryModal';
import { FiPlus } from 'react-icons/fi';

export default function StoriesBar({ stories = [] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const scrollRef = useRef(null);
  const myStory = stories.find(g => g.user?._id === user?._id);

  return (
    <div className="border-b border-[var(--border)] mb-4 lg:border lg:rounded-xl lg:mb-6 bg-[var(--bg-primary)]">
      <div ref={scrollRef} className="flex gap-4 px-4 py-3 overflow-x-auto hide-scrollbar">
        {/* My story */}
        <div className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0"
          onClick={() => myStory ? navigate(`/stories/${user._id}`) : setShowCreate(true)}>
          <div className="relative">
            {myStory
              ? <Avatar src={user?.avatar} size={56} alt={user?.fullName} ring />
              : (
                <div className="relative">
                  <Avatar src={user?.avatar} size={56} alt={user?.fullName} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-[var(--bg-primary)]">
                    <FiPlus className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                </div>
              )
            }
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] w-14 text-center truncate">
            {myStory ? 'Your story' : 'Add story'}
          </span>
        </div>

        {/* Others' stories */}
        {stories.filter(g => g.user?._id !== user?._id).map(group => (
          <div key={group.user._id} className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0"
            onClick={() => navigate(`/stories/${group.user._id}`)}>
            <Avatar src={group.user?.avatar} size={56} alt={group.user?.username} ring={group.hasUnviewed} />
            <span className="text-[11px] text-[var(--text-secondary)] w-14 text-center truncate">
              {group.user?.username}
            </span>
          </div>
        ))}
      </div>
      {showCreate && <CreateStoryModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
