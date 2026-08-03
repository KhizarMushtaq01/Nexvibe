const onlineUsers = new Map();

export const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // User joins with their userId
    socket.on('user:join', (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
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

    // Call signaling
    socket.on('call:initiate', (data) => {
      const receiverSocketId = onlineUsers.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('call:incoming', {
          callerId: data.callerId,
          callerName: data.callerName,
          callerAvatar: data.callerAvatar,
          type: data.type,
          offer: data.offer
        });
      }
    });

    socket.on('call:answer', (data) => {
      const callerSocketId = onlineUsers.get(data.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:answered', { answer: data.answer });
      }
    });

    socket.on('call:reject', (data) => {
      const callerSocketId = onlineUsers.get(data.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:rejected');
      }
    });

    socket.on('call:end', (data) => {
      const otherSocketId = onlineUsers.get(data.receiverId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('call:ended');
      }
    });

    socket.on('ice:candidate', (data) => {
      const receiverSocketId = onlineUsers.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('ice:candidate', { candidate: data.candidate });
      }
    });

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
