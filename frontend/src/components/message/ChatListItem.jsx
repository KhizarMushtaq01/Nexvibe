import { useRef } from 'react';
import { FiCamera, FiVideo, FiLock, FiFlag, FiCheck } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import { createLongPressHandlers } from '../../lib/longPress';

export default function ChatListItem({
  conv, isActive, currentUserId, selectionMode, isSelected,
  onOpen, onLongPress, onToggleSelect, formatMsgTime
}) {
  const other = conv.type === 'group' ? null : conv.participants?.find(p => (p._id || p) !== currentUserId);
  const lastMsg = conv.lastMessage;

  // The handler set is created once per row (a fresh one each render would
  // lose the in-flight press timer), but it must call the CURRENT onLongPress
  // prop -- the parent's handler closes over selection state that changes
  // between renders, so capturing the first render's copy would freeze it.
  const longPressRef = useRef(null);
  longPressRef.current = () => onLongPress(conv._id);

  const pressHandlersRef = useRef(null);
  if (pressHandlersRef.current === null) {
    pressHandlersRef.current = createLongPressHandlers(() => longPressRef.current());
  }
  const pressHandlers = pressHandlersRef.current;
  // consumeSuppressedClick is an imperative query, not a DOM event handler --
  // keep it out of the props spread below.
  const { consumeSuppressedClick, ...domPressHandlers } = pressHandlers;

  const handleClick = () => {
    if (consumeSuppressedClick()) return;
    if (selectionMode) onToggleSelect(conv._id);
    else onOpen(conv._id);
  };

  return (
    <div
      onClick={handleClick}
      {...domPressHandlers}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none
        ${isActive ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`}>
      <div className="relative flex-shrink-0">
        <Avatar
          src={conv.type === 'group' ? conv.groupAvatar : other?.avatar}
          size={56} alt={conv.type === 'group' ? conv.groupName : other?.fullName} />
        {other?.isOnline && !selectionMode && (
          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />
        )}
        {selectionMode && (
          <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all animate-scale-in
            ${isSelected ? 'bg-blue-500 border-[var(--bg-primary)]' : 'bg-[var(--bg-primary)] border-[var(--text-muted)]'}`}>
            {isSelected && <FiCheck className="w-3 h-3 text-white" />}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate flex items-center gap-1 ${conv.unreadCount ? 'font-bold' : 'font-semibold'}`}>
            {conv.type === 'group' ? conv.groupName : other?.username}
            {conv.isFlagged && <FiFlag className="w-3 h-3 text-red-500 flex-shrink-0" />}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 ml-2">
            {conv.lastMessageAt && formatMsgTime(conv.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className={`text-xs truncate flex items-center gap-1 ${conv.unreadCount ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
            {lastMsg?.isUnsent ? 'Message unsent'
              : lastMsg?.type === 'image' ? <><FiCamera className="w-3 h-3 flex-shrink-0" /> Photo</>
              : lastMsg?.type === 'video' ? <><FiVideo className="w-3 h-3 flex-shrink-0" /> Video</>
              : lastMsg?.encrypted ? <><FiLock className="w-3 h-3 flex-shrink-0" /> Encrypted message</>
              : lastMsg?.content || 'Start a conversation'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ml-2 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
