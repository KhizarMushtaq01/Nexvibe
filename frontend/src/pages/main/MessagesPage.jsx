import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { messageAPI, searchAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useConfirm } from '../../context/DialogContext';
import Avatar from '../../components/common/Avatar';
import ReportModal from '../../components/common/ReportModal';
import ChatListItem from '../../components/message/ChatListItem';
import ConversationActionsSheet from '../../components/message/ConversationActionsSheet';
import SelectionTopBar from '../../components/message/SelectionTopBar';
import SelectionBottomBar from '../../components/message/SelectionBottomBar';
import MessageTabs from '../../components/message/MessageTabs';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiSend, FiSmile, FiCamera, FiPhone,
  FiVideo, FiSearch, FiEdit, FiMoreHorizontal, FiX,
  FiMessageCircle, FiMic, FiPlusCircle, FiLock
} from 'react-icons/fi';
import { BsCheck2All, BsCheck2 } from 'react-icons/bs';
import { ratchetEncrypt } from '../../lib/e2eCrypto';
import { getOrCreateSenderSession, decryptIncomingMessage, withSessionLock } from '../../lib/e2eSession';
import { saveSession } from '../../lib/e2eStorage';

export default function MessagesPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { on, joinRoom, leaveRoom, emit } = useSocket();
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const [conversations, setConversations] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectionMode = selectedIds.size > 0;
  const [activeTab, setActiveTab] = useState('primary');
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
  const [isSending, setIsSending] = useState(false);
  const [reportingMessage, setReportingMessage] = useState(null);
  // Server-authoritative encryption flag per conversation, learned from
  // GET messages. The conversation list can be stale (encryption is activated
  // lazily server-side the first time both participants have published keys),
  // so this is OR-ed with the cached conversation flag.
  const [serverEncrypted, setServerEncrypted] = useState({});
  const messagesEndRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  // Encryption is activated lazily server-side, so trust either the cached
  // conversation flag or the fresher one returned by GET messages.
  const isActiveEncrypted = !!(activeConv?.isEncrypted || serverEncrypted[conversationId]);

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
      if (typeof data.isEncrypted === 'boolean') {
        setServerEncrypted(prev => (prev[id] === data.isEncrypted ? prev : { ...prev, [id]: data.isEncrypted }));
      }
      // Decrypt SEQUENTIALLY: each message advances the shared ratchet session
      // for this conversation, so message N+1 must not read the session before
      // message N has written its update back (Promise.all would let every
      // message read the same pre-handshake state and fail).
      const decrypted = [];
      for (const msg of (data.messages || [])) {
        if (!msg.encrypted) { decrypted.push(msg); continue; }
        const isMine = (msg.sender?._id || msg.sender) === user?._id;
        if (isMine) { decrypted.push({ ...msg, content: '', decryptError: true, isOwnEncrypted: true }); continue; }
        const result = await decryptIncomingMessage(id, msg);
        decrypted.push(result.decryptError
          ? { ...msg, decryptError: true }
          : { ...msg, content: result.content });
      }
      setMessages(decrypted);
    } catch {} finally { setMsgLoading(false); }
  };

  // Socket events
  useEffect(() => {
    if (!on) return;
    const u1 = on('message:receive', async msg => {
      const isMine = (msg.sender?._id || msg.sender) === user?._id;
      let displayMsg = msg;
      if (msg.encrypted && !isMine) {
        const result = await decryptIncomingMessage(msg.conversation, msg);
        displayMsg = result.decryptError ? { ...msg, decryptError: true } : { ...msg, content: result.content };
      }
      if (msg.conversation === conversationId && !isMine) {
        setMessages(prev => [...prev, displayMsg]);
      }
      setConversations(prev =>
        prev.map(c => c._id === msg.conversation
          ? { ...c, lastMessage: displayMsg, lastMessageAt: msg.createdAt }
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
    if (!text.trim() || !conversationId || isSending) return;
    const msgText = text;
    setText('');
    setIsSending(true);
    try {
      const sendPlain = async () => {
        const fd = new FormData();
        fd.append('type', 'text');
        fd.append('content', msgText);
        const { data } = await messageAPI.sendMessage(conversationId, fd);
        return data;
      };

      // The whole read-session → encrypt → send → save-session span runs under
      // the conversation's session lock, so a concurrent decrypt (thread load
      // or socket receive) can't read/overwrite the session mid-span.
      const sendEncrypted = () => withSessionLock(conversationId, async () => {
        const fd = new FormData();
        fd.append('type', 'text');
        const other = getOtherParticipant(activeConv);
        // Fail the send (the caller restores the draft) rather than silently
        // downgrading to plaintext if the conversation isn't loaded yet.
        if (!other?._id) throw new Error('Conversation not ready for encryption');
        const { session, handshakeHeader } = await getOrCreateSenderSession(conversationId, other._id);
        const encryptedData = ratchetEncrypt(session, msgText);
        const fullHeader = handshakeHeader ? { ...encryptedData.header, ...handshakeHeader } : encryptedData.header;
        fd.append('encrypted', 'true');
        fd.append('encryptedContent', JSON.stringify({ ciphertext: encryptedData.ciphertext, header: fullHeader }));

        const { data } = await messageAPI.sendMessage(conversationId, fd);

        // Only persist session state after successful send to prevent orphaned handshakes
        await saveSession(conversationId, encryptedData.session);
        return data;
      });

      const data = isActiveEncrypted ? await sendEncrypted() : await sendPlain();

      setMessages(prev => [...prev, { ...data.message, content: msgText }]);
      setConversations(prev =>
        prev.map(c => c._id === conversationId
          ? { ...c, lastMessage: { ...data.message, content: msgText }, lastMessageAt: new Date().toISOString() }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    } catch { toast.error('Failed to send'); setText(msgText); }
    finally { setIsSending(false); }
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
      const fresh = data.conversation;
      setNewConvoModal(false);
      setSearchQuery('');
      navigate(`/messages/${fresh._id}`);
      // Always merge the server's copy over the cached list entry -- this
      // endpoint may have just flipped isEncrypted to true, and keeping the
      // stale entry would leave the UI (and the send path) on plaintext.
      setConversations(prev => prev.some(c => c._id === fresh._id)
        ? prev.map(c => (c._id === fresh._id ? { ...c, ...fresh } : c))
        : [fresh, ...prev]);
      setActiveConv(prev => (prev && prev._id === fresh._id ? { ...prev, ...fresh } : prev));
      if (typeof fresh.isEncrypted === 'boolean') {
        setServerEncrypted(prev => ({ ...prev, [fresh._id]: fresh.isEncrypted }));
      }
    } catch { toast.error('Failed to open conversation'); }
  };

  const getOtherParticipant = (conv) => {
    if (!conv || conv.type === 'group') return null;
    return conv.participants?.find(p => (p._id || p) !== user?._id);
  };

  const conversationDisplayName = (conv) => {
    if (conv.type === 'group') return conv.groupName;
    const other = getOtherParticipant(conv);
    return other?.username || other?.fullName || 'Conversation';
  };

  // Long-pressing while already in selection mode extends the selection
  // instead of collapsing it to the pressed row. Uses the functional updater
  // so it reads the live selection: ChatListItem caches its long-press
  // callback for the lifetime of the row, so a `selectionMode` read from this
  // render's closure would be frozen at whatever it was when the row mounted.
  const enterSelection = (id) => {
    setSelectedIds(prev => {
      if (prev.size === 0) return new Set([id]);
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelection = () => setSelectedIds(new Set());

  const updateConv = (id, patch) =>
    setConversations(prev => prev.map(c => (c._id === id ? { ...c, ...patch } : c)));

  const removeConv = (id) => setConversations(prev => prev.filter(c => c._id !== id));

  const folderOf = (conv) => conv.folder || 'primary';
  const tabToFolder = { primary: 'primary', general: 'general', requests: 'request' };
  const filteredConversations = conversations.filter(c => folderOf(c) === tabToFolder[activeTab]);
  const tabCounts = {
    primary: conversations.filter(c => folderOf(c) === 'primary').length,
    general: conversations.filter(c => folderOf(c) === 'general').length,
    requests: conversations.filter(c => folderOf(c) === 'request').length,
  };
  const selectedConv = selectedIds.size === 1
    ? conversations.find(c => c._id === [...selectedIds][0])
    : null;

  // Bulk actions fire one request per selected chat, and any single one can
  // fail on its own (e.g. the other participant deleted the conversation
  // meanwhile). Promise.allSettled + a per-id success list keeps the list in
  // sync with what actually happened server-side instead of discarding every
  // successful update because one sibling rejected.
  const settleBulk = async (ids, run) => {
    const results = await Promise.allSettled(ids.map(run));
    const succeeded = ids.filter((id, i) => results[i].status === 'fulfilled');
    return { results, succeededIds: succeeded, failedCount: ids.length - succeeded.length };
  };

  const reportBulk = (succeededIds, failedCount, successMsg, failMsg, verb) => {
    if (failedCount === 0) { toast.success(successMsg); exitSelection(); }
    else if (succeededIds.length === 0) { toast.error(failMsg); }
    else { toast.error(`${verb} ${succeededIds.length}, ${failedCount} failed`); exitSelection(); }
  };

  const bulkDelete = async () => {
    if (!(await confirmDialog({ message: `Delete ${selectedIds.size} chats? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    const ids = [...selectedIds];
    const { succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.deleteConversation(id));
    if (succeededIds.length > 0) {
      setConversations(prev => prev.filter(c => !succeededIds.includes(c._id)));
    }
    reportBulk(succeededIds, failedCount, 'Chats deleted', 'Failed to delete chats', 'Deleted');
  };

  const bulkMoveFolder = async (folder) => {
    const ids = [...selectedIds];
    const { succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.setConversationFolder(id, folder));
    if (succeededIds.length > 0) {
      setConversations(prev => prev.map(c => (succeededIds.includes(c._id) ? { ...c, folder } : c)));
    }
    reportBulk(
      succeededIds, failedCount,
      folder === 'general' ? 'Moved to General' : 'Moved to Primary',
      'Failed to move chats', 'Moved'
    );
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds];
    const { succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.markConversationUnread(id, false));
    if (succeededIds.length > 0) {
      setConversations(prev => prev.map(c => (succeededIds.includes(c._id) ? { ...c, unreadCount: 0 } : c)));
    }
    reportBulk(succeededIds, failedCount, 'Marked as read', 'Failed to update', 'Updated');
  };

  const bulkMarkUnread = async () => {
    const ids = [...selectedIds];
    const { succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.markConversationUnread(id, true));
    if (succeededIds.length > 0) {
      setConversations(prev => prev.map(c => (succeededIds.includes(c._id)
        ? { ...c, unreadCount: Math.max(c.unreadCount || 0, 1) }
        : c)));
    }
    reportBulk(succeededIds, failedCount, 'Marked as unread', 'Failed to update', 'Updated');
  };

  const bulkMuteMessages = async () => {
    const ids = [...selectedIds];
    const { results, succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.muteConversation(id));
    if (succeededIds.length > 0) {
      // Mute is a per-conversation TOGGLE, so the resulting state differs per
      // chat -- read each one's own response rather than assuming a value.
      const muteById = new Map(
        ids.flatMap((id, i) => (results[i].status === 'fulfilled' ? [[id, results[i].value.data.isMuted]] : []))
      );
      setConversations(prev => prev.map(c => (muteById.has(c._id) ? { ...c, isMuted: muteById.get(c._id) } : c)));
    }
    reportBulk(succeededIds, failedCount, 'Updated mute settings', 'Failed to update', 'Updated');
  };

  const bulkMuteCalls = async () => {
    const ids = [...selectedIds];
    const { results, succeededIds, failedCount } = await settleBulk(ids, id => messageAPI.muteCallNotifications(id));
    if (succeededIds.length > 0) {
      const callMuteById = new Map(
        ids.flatMap((id, i) => (results[i].status === 'fulfilled' ? [[id, results[i].value.data.isCallMuted]] : []))
      );
      setConversations(prev => prev.map(c => (callMuteById.has(c._id) ? { ...c, isCallMuted: callMuteById.get(c._id) } : c)));
    }
    reportBulk(succeededIds, failedCount, 'Updated call notification settings', 'Failed to update', 'Updated');
  };

  const formatMsgTime = (date) => {
    const d = new Date(date);
    if (isToday(d)) return format(d, 'h:mm a');
    return formatDistanceToNow(d, { addSuffix: true });
  };

  const allEncryptedUnreadable = (() => {
    const relevant = messages.filter(m => m.encrypted && !m.isOwnEncrypted);
    return relevant.length > 0 && relevant.every(m => m.decryptError);
  })();

  const showList = !conversationId || !isMobile;
  const showChat = !!conversationId;

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden bg-[var(--bg-primary)]">
      {/* ── Conversation List ── */}
      {showList && (
        <div className={`relative flex flex-col border-r border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0
          ${showChat && !isMobile ? 'w-[350px]' : 'w-full md:w-[350px]'}`}>

          {/* Header */}
          {selectionMode ? (
            <SelectionTopBar count={selectedIds.size} onCancel={exitSelection} />
          ) : (
            <>
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
            </>
          )}

          <MessageTabs activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />

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
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center py-16 px-4">
                <p className="text-sm text-[var(--text-muted)]">No conversations here</p>
              </div>
            ) : filteredConversations.map(conv => (
              <ChatListItem
                key={conv._id}
                conv={conv}
                isActive={conv._id === conversationId}
                currentUserId={user?._id}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(conv._id)}
                onOpen={(id) => navigate(`/messages/${id}`)}
                onLongPress={enterSelection}
                onToggleSelect={toggleSelect}
                formatMsgTime={formatMsgTime}
              />
            ))}
          </div>

          {/* At exactly 1 selected, ConversationActionsSheet covers this bar.
              Rendering it anyway would leave invisible buttons in the tab
              order, so gate on the count at which it's actually visible. */}
          {selectedIds.size > 1 && (
            <SelectionBottomBar
              count={selectedIds.size}
              activeTab={activeTab}
              onDelete={bulkDelete}
              onMoveFolder={bulkMoveFolder}
              onMarkRead={bulkMarkRead}
              onMarkUnread={bulkMarkUnread}
              onMuteMessages={bulkMuteMessages}
              onMuteCalls={bulkMuteCalls}
            />
          )}

          {selectedConv && (
            <ConversationActionsSheet
              conversation={selectedConv}
              title={conversationDisplayName(selectedConv)}
              onClose={exitSelection}
              onUpdate={updateConv}
              onDelete={(id) => { removeConv(id); exitSelection(); }}
            />
          )}
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
                {isActiveEncrypted ? (
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2">
                    {/* Photos and videos in this thread are NOT encrypted (out of
                        scope for Phase 1), so the copy is deliberately narrowed
                        to text messages. */}
                    <FiLock className="w-3.5 h-3.5 flex-shrink-0" /><span>Text messages are end-to-end encrypted</span>
                  </div>
                ) : activeConv.type === 'direct' && (
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2">
                    <span>Encryption starts once the other person sets up NexVibe on a device</span>
                  </div>
                )}
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
              <>
                {allEncryptedUnreadable && (
                  <div className="text-center text-xs text-[var(--text-muted)] py-2 px-4">
                    You're on a new device — older encrypted messages from before today can't be shown here.
                  </div>
                )}
                {messages.map((msg, i) => {
                const isMine = (msg.sender?._id || msg.sender) === user?._id;
                const prevMsg = messages[i - 1];
                const showAvatar = !isMine && (msg.sender?._id || msg.sender) !== (prevMsg?.sender?._id || prevMsg?.sender);
                const isRead = msg.readBy?.some(r => (r.user?._id || r.user) !== user?._id);

                return (
                  <div key={msg._id} className={`group flex gap-2 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'} animate-fade-in`}>
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
                      ) : msg.isOwnEncrypted ? (
                        <div className="px-4 py-2.5 rounded-2xl text-sm italic text-[var(--text-muted)] border border-[var(--border)]">
                          You sent an encrypted message
                        </div>
                      ) : msg.decryptError ? (
                        <div className="px-4 py-2.5 rounded-2xl text-sm italic text-[var(--text-muted)] border border-[var(--border)] flex items-center gap-1.5">
                          <FiLock className="w-3.5 h-3.5 flex-shrink-0" /> Couldn't decrypt this message
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

                    {!isMine && !msg.isUnsent && !msg.decryptError && msg.type === 'text' && (
                      <button
                        onClick={() => setReportingMessage(msg)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[var(--text-muted)] hover:text-red-500 flex-shrink-0 self-center"
                        title="Report message"
                      >
                        <FiMoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              </>
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

      {/* Report message modal */}
      {reportingMessage && (
        <ReportModal
          targetType="message"
          targetId={reportingMessage._id}
          label="Report this message"
          evidenceContent={reportingMessage.content}
          onClose={() => setReportingMessage(null)}
        />
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
