import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { messageAPI, searchAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../../components/common/Avatar';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiSend, FiSmile, FiCamera, FiPhone,
  FiVideo, FiSearch, FiEdit, FiMoreHorizontal, FiX,
  FiMessageCircle, FiMic, FiPlusCircle
} from 'react-icons/fi';
import { BsCheck2All, BsCheck2 } from 'react-icons/bs';

export default function MessagesPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { on, joinRoom, leaveRoom, emit } = useSocket();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [newConvoModal, setNewConvoModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Load conversations
  useEffect(() => {
    messageAPI.getConversations()
      .then(({ data }) => setConversations(data.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) return;
    const found = conversations.find(c => c._id === conversationId);
    if (found) setActiveConv(found);
    loadMessages(conversationId);
    joinRoom(conversationId);
    return () => leaveRoom(conversationId);
  }, [conversationId]);

  // Update active conv when conversations load
  useEffect(() => {
    if (conversationId && conversations.length) {
      const found = conversations.find(c => c._id === conversationId);
      if (found && !activeConv) setActiveConv(found);
    }
  }, [conversations, conversationId]);

  const loadMessages = async (id) => {
    setMsgLoading(true);
    try {
      const { data } = await messageAPI.getMessages(id);
      setMessages(data.messages || []);
    } catch {} finally { setMsgLoading(false); }
  };

  // Socket events
  useEffect(() => {
    if (!on) return;
    const u1 = on('message:receive', msg => {
      if (msg.conversation === conversationId) {
        setMessages(prev => [...prev, msg]);
      }
      setConversations(prev =>
        prev.map(c => c._id === msg.conversation
          ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    });
    const u2 = on('typing:start', ({ userId: uid }) => { if (uid !== user?._id) setIsTyping(true); });
    const u3 = on('typing:stop', ({ userId: uid }) => { if (uid !== user?._id) setIsTyping(false); });
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [on, conversationId, user?._id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTyping = () => {
    if (!conversationId) return;
    emit('typing:start', { conversationId, userId: user?._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() =>
      emit('typing:stop', { conversationId, userId: user?._id }), 1500);
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!text.trim() || !conversationId) return;
    const msgText = text;
    setText('');
    try {
      const fd = new FormData();
      fd.append('content', msgText);
      fd.append('type', 'text');
      const { data } = await messageAPI.sendMessage(conversationId, fd);
      setMessages(prev => [...prev, data.message]);
      setConversations(prev =>
        prev.map(c => c._id === conversationId
          ? { ...c, lastMessage: data.message, lastMessageAt: new Date().toISOString() }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    } catch { toast.error('Failed to send'); setText(msgText); }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;
    try {
      const fd = new FormData();
      fd.append('media', file);
      fd.append('type', file.type.startsWith('image') ? 'image' : 'video');
      const { data } = await messageAPI.sendMessage(conversationId, fd);
      setMessages(prev => [...prev, data.message]);
    } catch { toast.error('Failed to send file'); }
  };

  // Search for new conversation
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      searchAPI.getSuggestions(searchQuery)
        .then(({ data }) => setSearchResults(data.suggestions || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const openConversation = async (participantId) => {
    try {
      const { data } = await messageAPI.getOrCreate(participantId);
      setNewConvoModal(false);
      setSearchQuery('');
      navigate(`/messages/${data.conversation._id}`);
      if (!conversations.find(c => c._id === data.conversation._id)) {
        setConversations(prev => [data.conversation, ...prev]);
      }
    } catch { toast.error('Failed to open conversation'); }
  };

  const getOtherParticipant = (conv) => {
    if (!conv || conv.type === 'group') return null;
    return conv.participants?.find(p => (p._id || p) !== user?._id);
  };

  const formatMsgTime = (date) => {
    const d = new Date(date);
    if (isToday(d)) return format(d, 'h:mm a');
    return formatDistanceToNow(d, { addSuffix: true });
  };

  const showList = !conversationId || !isMobile;
  const showChat = !!conversationId;

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden bg-[var(--bg-primary)]">
      {/* ── Conversation List ── */}
      {showList && (
        <div className={`flex flex-col border-r border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0
          ${showChat && !isMobile ? 'w-[350px]' : 'w-full md:w-[350px]'}`}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
            <h1 className="font-bold text-lg">{user?.username}</h1>
            <button onClick={() => setNewConvoModal(true)}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <FiEdit className="w-5 h-5" />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-xl px-3 py-2">
              <FiSearch className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              <input placeholder="Search messages" className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-14 h-14 rounded-full shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded shimmer" />
                    <div className="h-2.5 w-48 rounded shimmer" />
                  </div>
                </div>
              ))
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 px-4 gap-3">
                <div className="w-20 h-20 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
                  <FiMessageCircle className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <p className="font-bold">Your messages</p>
                <p className="text-sm text-[var(--text-secondary)] text-center">Send private photos and messages to friends.</p>
                <button onClick={() => setNewConvoModal(true)} className="btn-primary px-5 py-2 rounded-xl text-sm mt-1">
                  Send message
                </button>
              </div>
            ) : conversations.map(conv => {
              const other = getOtherParticipant(conv);
              const isActive = conv._id === conversationId;
              const lastMsg = conv.lastMessage;
              return (
                <div key={conv._id}
                  onClick={() => navigate(`/messages/${conv._id}`)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isActive ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`}>
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={conv.type === 'group' ? conv.groupAvatar : other?.avatar}
                      size={56} alt={conv.type === 'group' ? conv.groupName : other?.fullName} />
                    {other?.isOnline && (
                      <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${conv.unreadCount ? 'font-bold' : 'font-semibold'}`}>
                        {conv.type === 'group' ? conv.groupName : other?.username}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 ml-2">
                        {conv.lastMessageAt && formatMsgTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate ${conv.unreadCount ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                        {lastMsg?.isUnsent ? 'Message unsent'
                          : lastMsg?.type === 'image' ? '📷 Photo'
                          : lastMsg?.type === 'video' ? '🎥 Video'
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
            })}
          </div>
        </div>
      )}

      {/* ── Chat Window ── */}
      {showChat ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          {activeConv && (() => {
            const other = getOtherParticipant(activeConv);
            return (
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                <button onClick={() => navigate('/messages')} className="md:hidden p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full">
                  <FiArrowLeft className="w-5 h-5" />
                </button>
                <Link to={other ? `/${other.username}` : '#'} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={activeConv.type === 'group' ? activeConv.groupAvatar : other?.avatar}
                      size={40} alt={other?.fullName} />
                    {other?.isOnline && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {activeConv.type === 'group' ? activeConv.groupName : other?.username}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {other?.isOnline ? 'Active now'
                        : other?.lastSeen ? `Active ${formatDistanceToNow(new Date(other.lastSeen), { addSuffix: true })}`
                        : ''}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                    <FiPhone className="w-5 h-5" />
                  </button>
                  <button className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                    <FiVideo className="w-5 h-5" />
                  </button>
                  <button className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                    <FiMoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-[var(--bg-primary)]">
            {msgLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
                {activeConv && (() => {
                  const other = getOtherParticipant(activeConv);
                  return (
                    <>
                      <Avatar src={other?.avatar} size={64} alt={other?.fullName} />
                      <p className="font-bold">{other?.username}</p>
                      <p className="text-sm text-[var(--text-muted)]">Start your conversation</p>
                    </>
                  );
                })()}
              </div>
            ) : (
              messages.map((msg, i) => {
                const isMine = (msg.sender?._id || msg.sender) === user?._id;
                const prevMsg = messages[i - 1];
                const showAvatar = !isMine && (msg.sender?._id || msg.sender) !== (prevMsg?.sender?._id || prevMsg?.sender);
                const isRead = msg.readBy?.some(r => (r.user?._id || r.user) !== user?._id);

                return (
                  <div key={msg._id} className={`flex gap-2 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'} animate-fade-in`}>
                    {/* Avatar space for group chats */}
                    {!isMine && (
                      <div className="w-7 flex-shrink-0">
                        {showAvatar && <Avatar src={msg.sender?.avatar} size={28} alt={msg.sender?.fullName} />}
                      </div>
                    )}

                    <div className={`max-w-[65%] flex flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                      {msg.isUnsent ? (
                        <div className="px-4 py-2.5 rounded-2xl text-sm italic text-[var(--text-muted)] border border-[var(--border)]">
                          Message unsent
                        </div>
                      ) : msg.type === 'image' ? (
                        <img src={msg.media?.url} className="rounded-2xl max-w-[240px] max-h-[320px] object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                      ) : msg.type === 'video' ? (
                        <video src={msg.media?.url} className="rounded-2xl max-w-[240px]" controls />
                      ) : (
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                          ${isMine
                            ? 'bg-blue-500 text-white rounded-br-md'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'}`}>
                          {msg.content}
                        </div>
                      )}

                      {/* Reactions */}
                      {msg.reactions?.length > 0 && (
                        <div className={`flex gap-0.5 -mt-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                          {msg.reactions.slice(0, 3).map((r, ri) => (
                            <span key={ri} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-full px-1 text-xs shadow-sm">{r.emoji}</span>
                          ))}
                        </div>
                      )}

                      <span className="text-[10px] text-[var(--text-muted)] px-1">
                        {format(new Date(msg.createdAt), 'h:mm a')}
                        {isMine && (
                          isRead
                            ? <BsCheck2All className="inline ml-1 text-blue-400" />
                            : <BsCheck2 className="inline ml-1" />
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 pl-9">
                <div className="bg-[var(--bg-tertiary)] rounded-2xl px-4 py-3 flex gap-1 items-center">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)] relative">
            <div className="flex items-center gap-3">
              {/* Left actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setShowEmoji(v => !v)}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <FiSmile className="w-6 h-6" />
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <FiCamera className="w-6 h-6" />
                </button>
                <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
              </div>

              {/* Text input */}
              <form onSubmit={handleSend} className="flex-1 flex items-center bg-[var(--bg-tertiary)] rounded-full px-4 py-2.5 gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => { setText(e.target.value); handleTyping(); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Message…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                />
              </form>

              {/* Send/mic button */}
              {text.trim() ? (
                <button onClick={handleSend}
                  className="p-2 text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0">
                  <FiSend className="w-6 h-6" />
                </button>
              ) : (
                <button className="p-1.5 flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <FiMic className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Emoji picker */}
            {showEmoji && (
              <div className="absolute bottom-16 left-4 z-50">
                <SimpleEmojiPicker onSelect={e => { setText(p => p + e); setShowEmoji(false); }} />
              </div>
            )}
          </div>
        </div>
      ) : !isMobile && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-[var(--bg-primary)]">
          <div className="w-24 h-24 rounded-full border-2 border-[var(--text-primary)] flex items-center justify-center">
            <FiMessageCircle className="w-12 h-12" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-light mb-1">Your messages</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Send private photos and messages to a friend or group.
            </p>
          </div>
          <button onClick={() => setNewConvoModal(true)} className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">
            Send message
          </button>
        </div>
      )}

      {/* New conversation modal */}
      {newConvoModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNewConvoModal(false)}>
          <div className="modal-content w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold">New message</h2>
              <button onClick={() => setNewConvoModal(false)}>
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
              <span className="font-semibold text-sm text-[var(--text-muted)]">To:</span>
              <input autoFocus placeholder="Search…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {searchResults.length === 0 && searchQuery && (
                <p className="text-center py-8 text-sm text-[var(--text-muted)]">No results for "{searchQuery}"</p>
              )}
              {searchResults.map(u => (
                <div key={u._id} onClick={() => openConversation(u._id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <Avatar src={u.avatar} size={44} alt={u.fullName} />
                  <div>
                    <p className="font-semibold text-sm">{u.username}</p>
                    <p className="text-xs text-[var(--text-muted)]">{u.fullName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleEmojiPicker({ onSelect }) {
  const emojis = ['❤️','😂','😍','🔥','👏','😢','😮','😡','🎉','👍','👎','😊',
                   '🙏','💯','✨','🤔','😎','🥰','😭','🤣','💪','🤝','🎊','🤗'];
  return (
    <div className="grid grid-cols-6 gap-1 p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-xl">
      {emojis.map(e => (
        <button key={e} onClick={() => onSelect(e)}
          className="w-9 h-9 flex items-center justify-center text-xl hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
          {e}
        </button>
      ))}
    </div>
  );
}
