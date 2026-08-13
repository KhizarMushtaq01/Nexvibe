import { registerCallHandlers } from './socketCalls.js';
import User from '../models/User.js';

const onlineUsers = new Map();

export const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // User joins with their userId
    socket.on('user:join', async (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      // Cached on the socket so call:initiate can put a name and avatar on the
      // callee's ringing screen without another DB read per call.
      try {
        socket.callerProfile = await User.findById(userId).select('username fullName avatar').lean();
      } catch { socket.callerProfile = { _id: userId }; }
      io.emit('users:online', Array.from(onlineUsers.keys()));
      console.log(`👤 User ${userId} is online`);
    });

    // Join a conversation room
    socket.on('conversation:join', (conversationId) => {
      socket.join(conversationId);
    });

    // Leave conversation room
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(conversationId);
    });

    // Send message
    socket.on('message:send', (data) => {
      socket.to(data.conversationId).emit('message:receive', data);
    });

    // Typing indicators
    socket.on('typing:start', (data) => {
      socket.to(data.conversationId).emit('typing:start', {
        userId: data.userId,
        conversationId: data.conversationId
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(data.conversationId).emit('typing:stop', {
        userId: data.userId,
        conversationId: data.conversationId
      });
    });

    // Message read receipt
    socket.on('message:read', (data) => {
      socket.to(data.conversationId).emit('message:read', data);
    });

    // Notifications
    socket.on('notification:send', (data) => {
      const receiverSocketId = onlineUsers.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('notification:receive', data);
      }
    });

    // Call signaling lives in its own module -- see config/socketCalls.js.
    registerCallHandlers({ io, socket, onlineUsers });

    // Story viewed
    socket.on('story:view', (data) => {
      const ownerSocketId = onlineUsers.get(data.ownerId);
      if (ownerSocketId) {
        io.to(ownerSocketId).emit('story:viewed', { viewerId: data.viewerId, storyId: data.storyId });
      }
    });

    // Post liked notification
    socket.on('post:liked', (data) => {
      const ownerSocketId = onlineUsers.get(data.ownerId);
      if (ownerSocketId && data.ownerId !== data.likerId) {
        io.to(ownerSocketId).emit('post:liked', data);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('users:online', Array.from(onlineUsers.keys()));
        console.log(`❌ User ${socket.userId} disconnected`);
      }
    });
  });
};

export const getOnlineUsers = () => Array.from(onlineUsers.keys());
export const getSocketId = (userId) => onlineUsers.get(userId);
