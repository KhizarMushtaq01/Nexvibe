import { Message, Conversation } from '../models/Message.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { sendNewMessageEmail } from '../utils/email.js';
import { getSocketId } from '../config/socket.js';
import fs from 'fs';

// These per-user arrays record one participant's private state about a
// conversation (mute/flag/delete/folder/etc preferences, pending-request
// status). They must never be sent to a *different* participant -- doing so
// would leak e.g. "the other person flagged/muted/deleted this chat" or
// "you're in their message requests". Callers that need one participant's
// own status compute a derived boolean/string field instead (see
// getConversations) and this strips the raw arrays from what's returned.
const PRIVATE_PER_USER_FIELDS = ['mutedBy', 'archivedBy', 'deletedBy', 'flaggedBy', 'forcedUnreadBy', 'callMutedBy', 'folderBy', 'pendingFor'];

const stripPrivateFields = (convObj) => {
  const copy = { ...convObj };
  for (const field of PRIVATE_PER_USER_FIELDS) delete copy[field];
  return copy;
};

// Loads a conversation the requester must be a participant of. On failure,
// writes the appropriate error response itself and returns null -- callers
// just do `const conversation = await loadParticipantConversation(req, res); if (!conversation) return;`.
// Centralizing this closes the gap where a new conversation-action endpoint
// could be added without an authorization check.
const loadParticipantConversation = async (req, res) => {
  const conversation = await Conversation.findById(req.params.conversationId);
  if (!conversation) {
    res.status(404).json({ success: false, message: 'Conversation not found' });
    return null;
  }
  if (!conversation.participants.includes(req.user._id)) {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return null;
  }
  return conversation;
};

// Lazily activate E2E encryption on a direct conversation once BOTH
// participants have published an identity key. Called from every path that
// opens a thread (get-or-create AND plain message fetch) so a conversation
// that predates key publication doesn't stay plaintext forever just because
// the user reached it by clicking the conversation list.
// Returns the (possibly updated) isEncrypted value.
const activateEncryptionIfReady = async (conversation) => {
  if (!conversation) return false;
  if (conversation.isEncrypted) return true;
  if (conversation.type !== 'direct') return false;

  const participantIds = conversation.participants.map(p => p._id || p);
  const withKeys = await User.countDocuments({
    _id: { $in: participantIds },
    'e2e.identityKey': { $exists: true, $nin: [null, ''] }
  });
  if (withKeys < participantIds.length) return false;

  conversation.isEncrypted = true;
  await conversation.save();
  return true;
};

// @desc    Get or create conversation
// @route   POST /api/messages/conversations
export const getOrCreateConversation = async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ success: false, message: 'Participant required' });

    if (participantId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot message yourself' });
    }

    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [req.user._id, participantId], $size: 2 }
    })
      .populate('participants', 'username fullName avatar isVerified isOnline lastSeen e2e.identityKey')
      .populate('lastMessage');

    if (!conversation) {
      const recipient = await User.findById(participantId).select('following');
      if (!recipient) return res.status(404).json({ success: false, message: 'User not found' });

      // A message from someone the recipient doesn't follow is a request,
      // matching Instagram's actual rule.
      const recipientFollowsSender = recipient.following.some(id => id.toString() === req.user._id.toString());

      conversation = await Conversation.create({
        participants: [req.user._id, participantId],
        type: 'direct',
        pendingFor: recipientFollowsSender ? [] : [participantId]
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username fullName avatar isVerified isOnline lastSeen e2e.identityKey');
    } else if (conversation.deletedBy?.some(id => id.toString() === req.user._id.toString())) {
      // Deliberately re-opening a conversation you previously deleted brings
      // it back: otherwise the thread you're being navigated into would be
      // missing from your list on the very next fetch.
      conversation.deletedBy.pull(req.user._id);
      await conversation.save();
    }

    await activateEncryptionIfReady(conversation);

    res.json({ success: true, conversation: stripPrivateFields(conversation.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all conversations
// @route   GET /api/messages/conversations
export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      deletedBy: { $ne: req.user._id }
    })
      .populate('participants', 'username fullName avatar isVerified isOnline lastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username fullName' } })
      .sort({ lastMessageAt: -1 });

    const uid = req.user._id.toString();
    const now = Date.now();

    const convWithExtras = await Promise.all(conversations.map(async (conv) => {
      const realUnreadCount = await Message.countDocuments({
        conversation: conv._id,
        sender: { $ne: req.user._id },
        readBy: { $not: { $elemMatch: { user: req.user._id } } },
        isDeleted: false
      });

      const isPending = conv.pendingFor?.some(id => id.toString() === uid);
      const folderEntry = conv.folderBy?.find(f => f.user.toString() === uid);
      const folder = isPending ? 'request' : (folderEntry?.folder || 'primary');

      const isFlagged = !!conv.flaggedBy?.some(id => id.toString() === uid);

      const muteEntry = conv.mutedBy?.find(m => m.user.toString() === uid);
      const isMuted = !!muteEntry && (!muteEntry.until || new Date(muteEntry.until).getTime() > now);

      const callMuteEntry = conv.callMutedBy?.find(m => m.user.toString() === uid);
      const isCallMuted = !!callMuteEntry && (!callMuteEntry.until || new Date(callMuteEntry.until).getTime() > now);

      const isForcedUnread = conv.forcedUnreadBy?.some(id => id.toString() === uid);
      const unreadCount = isForcedUnread ? Math.max(realUnreadCount, 1) : realUnreadCount;

      return { ...stripPrivateFields(conv.toObject()), unreadCount, folder, isFlagged, isMuted, isCallMuted };
    }));

    res.json({ success: true, conversations: convWithExtras });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get messages in a conversation
// @route   GET /api/messages/conversations/:conversationId/messages
export const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (conversation.forcedUnreadBy?.some(id => id.toString() === req.user._id.toString())) {
      conversation.forcedUnreadBy.pull(req.user._id);
      await conversation.save();
    }

    // Opening a thread is the other entry point (besides get-or-create) where
    // encryption can become possible, so run the activation check here too.
    const isEncrypted = await activateEncryptionIfReady(conversation);

    const messages = await Message.find({
      conversation: req.params.conversationId,
      deletedFor: { $ne: req.user._id }
    })
      .populate('sender', 'username fullName avatar isVerified')
      .populate('replyTo')
      .populate('sharedPost', 'caption media author')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: req.params.conversationId,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      },
      { $addToSet: { readBy: { user: req.user._id, readAt: new Date() } } }
    );

    const total = await Message.countDocuments({ conversation: req.params.conversationId });

    res.json({
      success: true,
      messages: messages.reverse(),
      hasMore: page * limit < total,
      // Server-authoritative: the client's cached conversation list may predate
      // the lazy activation above.
      isEncrypted
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send message
// @route   POST /api/messages/conversations/:conversationId/messages
export const sendMessage = async (req, res) => {
  try {
    const { content, type = 'text', replyTo, sharedPost, encrypted, encryptedContent } = req.body;
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Replying to a pending request accepts it, matching Instagram's rule.
    // No-op (and no extra save) if the sender isn't in pendingFor.
    conversation.pendingFor?.pull(req.user._id);

    let mediaData = {};
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const result = await uploadToCloudinary(req.file.path, 'nexvibe/messages', {
        resource_type: isVideo ? 'video' : 'image'
      });
      mediaData = {
        url: result.secure_url,
        publicId: result.public_id,
        thumbnail: result.thumbnail_url || result.secure_url,
        name: req.file.originalname,
        size: req.file.size
      };
      fs.unlinkSync(req.file.path);
    }

    const isEncrypted = encrypted === true || encrypted === 'true';

    if (isEncrypted && !encryptedContent) {
      return res.status(400).json({ success: false, message: 'encryptedContent is required when encrypted is true' });
    }

    let parsedEncryptedContent;
    if (isEncrypted) {
      try {
        parsedEncryptedContent = JSON.parse(encryptedContent);
      } catch {
        return res.status(400).json({ success: false, message: 'encryptedContent must be valid JSON' });
      }
    }

    const message = await Message.create({
      conversation: req.params.conversationId,
      sender: req.user._id,
      type,
      content: isEncrypted ? undefined : content,
      encrypted: isEncrypted,
      encryptedContent: isEncrypted ? parsedEncryptedContent : undefined,
      media: Object.keys(mediaData).length ? mediaData : undefined,
      replyTo,
      sharedPost
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();

    // A new message un-deletes the conversation for everyone receiving it --
    // otherwise a conversation someone deleted would silently swallow every
    // future incoming message with no way to ever see it again.
    const messageRecipients = conversation.participants.filter(
      p => p.toString() !== req.user._id.toString()
    );
    for (const recipientId of messageRecipients) {
      conversation.deletedBy.pull(recipientId);
    }

    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'username fullName avatar isVerified')
      .populate('replyTo');

    // Emit to conversation room via socket
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.conversationId).emit('message:receive', populated);
    }

    // The message is persisted and broadcast at this point, so the send has
    // succeeded -- answer the client BEFORE doing best-effort side work.
    // A failure below must never turn into a 500: the sender's client only
    // persists its ratchet state after a successful response, and discarding
    // that state after the recipient already received the message permanently
    // desynchronizes the session in that direction.
    res.status(201).json({ success: true, message: populated });

    // Best-effort: in-app notifications for recipients, plus an email to
    // offline recipients if this is the first unread message (avoid spamming
    // back-to-back sends). Never throws into the request lifecycle.
    try {
      // Same set computed above for the un-delete pass.
      for (const recipientId of messageRecipients) {
        // "Mute Messages" on a conversation suppresses its notifications and
        // emails for that participant only, until the mute expires.
        const isMutedForRecipient = conversation.mutedBy?.some(m => {
          if (m.user.toString() !== recipientId.toString()) return false;
          return !m.until || new Date(m.until).getTime() > Date.now();
        });
        if (isMutedForRecipient) continue;

        const recipientUser = await User.findById(recipientId).select('email fullName settings.notifications.messages');
        if (recipientUser?.settings?.notifications?.messages === false) continue;

        await Notification.create({
          recipient: recipientId,
          sender: req.user._id,
          type: 'message',
          text: `${req.user.fullName} sent you a message`
        });

        const isOnline = !!getSocketId(recipientId.toString());
        if (!isOnline) {
          const priorUnread = await Message.countDocuments({
            conversation: conversation._id,
            sender: { $ne: recipientId },
            'readBy.user': { $ne: recipientId },
            isDeleted: false,
            _id: { $ne: message._id }
          });
          if (priorUnread === 0 && recipientUser?.email) {
            await sendNewMessageEmail(recipientUser, req.user.fullName);
          }
        }
      }
    } catch (notifyError) {
      // Never log message content (plaintext or ciphertext).
      console.error('Message notification side-effects failed:', notifyError.message);
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// @desc    Delete message
// @route   DELETE /api/messages/:messageId
export const deleteMessage = async (req, res) => {
  try {
    const { deleteFor } = req.query; // 'me' or 'everyone'
    const message = await Message.findById(req.params.messageId);

    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (deleteFor === 'everyone') {
      if (message.sender.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Can only unsend your own messages' });
      }
      message.isUnsent = true;
      message.content = '';
      message.media = undefined;
    } else {
      message.deletedFor.push(req.user._id);
    }

    await message.save();
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    React to message
// @route   POST /api/messages/:messageId/react
export const reactToMessage = async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const existingReaction = message.reactions.find(r => r.user.toString() === req.user._id.toString());
    if (existingReaction) {
      if (existingReaction.emoji === emoji) {
        message.reactions = message.reactions.filter(r => r.user.toString() !== req.user._id.toString());
      } else {
        existingReaction.emoji = emoji;
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();
    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create group conversation
// @route   POST /api/messages/groups
export const createGroup = async (req, res) => {
  try {
    const { name, participants, description } = req.body;
    if (!name || !participants || participants.length < 2) {
      return res.status(400).json({ success: false, message: 'Group needs a name and at least 2 participants' });
    }

    const group = await Conversation.create({
      type: 'group',
      groupName: name,
      groupDescription: description,
      participants: [...participants, req.user._id],
      groupAdmins: [req.user._id],
      createdBy: req.user._id
    });

    const populated = await Conversation.findById(group._id).populate('participants', 'username fullName avatar isVerified');
    res.status(201).json({ success: true, conversation: stripPrivateFields(populated.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update group settings
// @route   PUT /api/messages/groups/:groupId
export const updateGroup = async (req, res) => {
  try {
    const { groupName, groupDescription } = req.body;
    const conversation = await Conversation.findById(req.params.groupId);

    if (!conversation || !conversation.groupAdmins.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (groupName) conversation.groupName = groupName;
    if (groupDescription) conversation.groupDescription = groupDescription;
    await conversation.save();

    res.json({ success: true, conversation: stripPrivateFields(conversation.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add members to group
// @route   POST /api/messages/groups/:groupId/members
export const addGroupMembers = async (req, res) => {
  try {
    const { userIds } = req.body;
    const conversation = await Conversation.findById(req.params.groupId);

    if (!conversation || !conversation.groupAdmins.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    for (const userId of userIds) {
      if (!conversation.participants.includes(userId)) {
        conversation.participants.push(userId);
      }
    }

    await conversation.save();
    const populated = await Conversation.findById(conversation._id).populate('participants', 'username fullName avatar isVerified');
    res.json({ success: true, conversation: stripPrivateFields(populated.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Leave group
// @route   POST /api/messages/groups/:groupId/leave
export const leaveGroup = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.groupId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Group not found' });

    conversation.participants.pull(req.user._id);
    conversation.groupAdmins.pull(req.user._id);
    await conversation.save();

    res.json({ success: true, message: 'Left group' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mute conversation
// @route   POST /api/messages/conversations/:conversationId/mute
export const muteConversation = async (req, res) => {
  try {
    const { duration } = req.body; // hours
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const existing = conversation.mutedBy.find(m => m.user.toString() === req.user._id.toString());
    if (existing) {
      conversation.mutedBy = conversation.mutedBy.filter(m => m.user.toString() !== req.user._id.toString());
    } else {
      conversation.mutedBy.push({
        user: req.user._id,
        until: duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null
      });
    }

    await conversation.save();
    res.json({ success: true, isMuted: !existing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Archive conversation
// @route   POST /api/messages/conversations/:conversationId/archive
export const archiveConversation = async (req, res) => {
  try {
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const isArchived = conversation.archivedBy.includes(req.user._id);
    isArchived
      ? conversation.archivedBy.pull(req.user._id)
      : conversation.archivedBy.push(req.user._id);

    await conversation.save();
    res.json({ success: true, isArchived: !isArchived });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a conversation (for the requesting user only)
// @route   DELETE /api/messages/conversations/:conversationId
export const deleteConversation = async (req, res) => {
  try {
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    if (!conversation.deletedBy.includes(req.user._id)) {
      conversation.deletedBy.push(req.user._id);
      await conversation.save();
    }

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Set a conversation's read/unread state (per-user)
// @route   POST /api/messages/conversations/:conversationId/mark-unread
export const markConversationUnread = async (req, res) => {
  try {
    const { unread } = req.body;
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    if (unread) {
      if (!conversation.forcedUnreadBy.includes(req.user._id)) {
        conversation.forcedUnreadBy.push(req.user._id);
        await conversation.save();
      }
    } else {
      conversation.forcedUnreadBy.pull(req.user._id);
      await conversation.save();
      // A blind toggle can't distinguish "genuinely has unread messages"
      // from "only force-flagged" -- explicitly mark real messages read too
      // so "Mark as Read" actually clears a non-zero unread count.
      await Message.updateMany(
        {
          conversation: conversation._id,
          sender: { $ne: req.user._id },
          'readBy.user': { $ne: req.user._id }
        },
        { $addToSet: { readBy: { user: req.user._id, readAt: new Date() } } }
      );
    }

    res.json({ success: true, isUnread: !!unread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle flag on a conversation
// @route   POST /api/messages/conversations/:conversationId/flag
export const flagConversation = async (req, res) => {
  try {
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const isFlagged = conversation.flaggedBy.includes(req.user._id);
    isFlagged
      ? conversation.flaggedBy.pull(req.user._id)
      : conversation.flaggedBy.push(req.user._id);

    await conversation.save();
    res.json({ success: true, isFlagged: !isFlagged });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mute/unmute call notifications for a conversation
// @route   POST /api/messages/conversations/:conversationId/mute-calls
export const muteCallNotifications = async (req, res) => {
  try {
    const { duration } = req.body; // hours
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const existing = conversation.callMutedBy.find(m => m.user.toString() === req.user._id.toString());
    if (existing) {
      conversation.callMutedBy = conversation.callMutedBy.filter(m => m.user.toString() !== req.user._id.toString());
    } else {
      conversation.callMutedBy.push({
        user: req.user._id,
        until: duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null
      });
    }

    await conversation.save();
    res.json({ success: true, isCallMuted: !existing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Move a conversation between the Primary and General folders
// @route   POST /api/messages/conversations/:conversationId/folder
export const setConversationFolder = async (req, res) => {
  try {
    const { folder } = req.body;
    if (!['primary', 'general'].includes(folder)) {
      return res.status(400).json({ success: false, message: "folder must be 'primary' or 'general'" });
    }

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const existing = conversation.folderBy.find(f => f.user.toString() === req.user._id.toString());
    if (existing) {
      existing.folder = folder;
    } else {
      conversation.folderBy.push({ user: req.user._id, folder });
    }
    // Explicitly filing a request into Primary/General is itself an accept
    // action, same principle as replying accepting it (see sendMessage).
    conversation.pendingFor.pull(req.user._id);

    await conversation.save();
    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    // Mirrors getConversations: a conversation the user deleted contributes
    // nothing, and one they explicitly marked unread counts as at least 1, so
    // the global badge agrees with the per-conversation badges in the list.
    const conversations = await Conversation.find({
      participants: req.user._id,
      deletedBy: { $ne: req.user._id }
    });
    let totalUnread = 0;
    for (const conv of conversations) {
      const count = await Message.countDocuments({
        conversation: conv._id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id },
        isDeleted: false
      });
      const isForcedUnread = conv.forcedUnreadBy?.some(id => id.toString() === req.user._id.toString());
      totalUnread += isForcedUnread ? Math.max(count, 1) : count;
    }
    res.json({ success: true, unreadCount: totalUnread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
