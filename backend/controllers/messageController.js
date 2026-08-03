import { Message, Conversation } from '../models/Message.js';
import User from '../models/User.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import fs from 'fs';

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
      .populate('participants', 'username fullName avatar isVerified isOnline lastSeen')
      .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, participantId],
        type: 'direct'
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username fullName avatar isVerified isOnline lastSeen');
    }

    res.json({ success: true, conversation });
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

    // Attach unread count
    const convWithUnread = await Promise.all(conversations.map(async (conv) => {
      const unreadCount = await Message.countDocuments({
        conversation: conv._id,
        sender: { $ne: req.user._id },
        readBy: { $not: { $elemMatch: { user: req.user._id } } },
        isDeleted: false
      });
      return { ...conv.toObject(), unreadCount };
    }));

    res.json({ success: true, conversations: convWithUnread });
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
      hasMore: page * limit < total
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send message
// @route   POST /api/messages/conversations/:conversationId/messages
export const sendMessage = async (req, res) => {
  try {
    const { content, type = 'text', replyTo, sharedPost } = req.body;
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

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

    const message = await Message.create({
      conversation: req.params.conversationId,
      sender: req.user._id,
      type,
      content,
      media: Object.keys(mediaData).length ? mediaData : undefined,
      replyTo,
      sharedPost
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'username fullName avatar isVerified')
      .populate('replyTo');

    // Emit to conversation room via socket
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.conversationId).emit('message:receive', populated);
    }

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(201).json({ success: true, conversation: populated });
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

    res.json({ success: true, conversation });
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
    res.json({ success: true, conversation: populated });
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
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

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
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Not found' });

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

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id });
    let totalUnread = 0;
    for (const conv of conversations) {
      const count = await Message.countDocuments({
        conversation: conv._id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id },
        isDeleted: false
      });
      totalUnread += count;
    }
    res.json({ success: true, unreadCount: totalUnread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
