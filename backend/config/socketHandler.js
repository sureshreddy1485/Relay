const User = require('../models/User');

// Map: userId -> Set of socketIds (multi-device support)
const onlineUsers = new Map();

// Helper to broadcast status changes according to privacy settings
const broadcastStatus = async (userId, eventName, data, socket, io) => {
  try {
    const user = await User.findById(userId).select('privacy friends');
    if (!user) return;

    const lastSeenVis = user.privacy?.lastSeenVisibility || 'everyone';
    if (lastSeenVis === 'nobody') {
      return; // Do not broadcast to anyone
    }

    if (lastSeenVis === 'friends') {
      const friends = (user.friends || []).map(f => f.toString());
      friends.forEach(friendId => {
        io.to(friendId).emit(eventName, data);
      });
      return;
    }

    // Default: everyone
    socket.broadcast.emit(eventName, data);
  } catch (err) {
    console.error('Error broadcasting status:', err);
  }
};

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── Setup: user goes online ─────────────────────────────────────
    socket.on('setup', async (userId) => {
      if (!userId) return;
      socket.userId = userId;
      socket.join(userId); // personal room

      if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
      onlineUsers.get(userId).add(socket.id);

      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      await broadcastStatus(userId, 'user_online', { userId }, socket, io);
      socket.emit('connected');
    });

    // ─── Join a chat room ────────────────────────────────────────────
    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
    });

    socket.on('leave_chat', (chatId) => {
      socket.leave(chatId);
    });

    // ─── Typing indicators ───────────────────────────────────────────
    socket.on('typing', ({ chatId, userId, username }) => {
      socket.to(chatId).emit('typing', { chatId, userId, username });
    });

    socket.on('stop_typing', ({ chatId, userId }) => {
      socket.to(chatId).emit('stop_typing', { chatId, userId });
    });

    // ─── Message sent from client ────────────────────────────────────
    socket.on('message_sent', (message) => {
      socket.to(message.chat._id || message.chat).emit('new_message', message);
    });

    // ─── Delivery & Read receipts ────────────────────────────────────
    socket.on('mark_read', async ({ chatId, userId }) => {
      try {
        const user = await User.findById(userId).select('privacy');
        if (user?.privacy?.readReceipts !== 'hide') {
          socket.to(chatId).emit('messages_read', { chatId, userId });
        }
      } catch (err) {
        console.error('Error in mark_read socket event:', err);
      }
    });

    socket.on('mark_delivered', ({ chatId, userId }) => {
      socket.to(chatId).emit('messages_delivered', { chatId, userId });
    });
    // ─── Camera active indicator ─────────────────────────────────────
    socket.on('camera_active', async ({ userId, isActive }) => {
      await User.findByIdAndUpdate(userId, { isCameraActive: isActive });
      await broadcastStatus(userId, 'camera_status_changed', { userId, isActive }, socket, io);
    });

    // ─── User status ─────────────────────────────────────────────────
    socket.on('get_online_status', ({ userIds }) => {
      const statusMap = {};
      userIds.forEach(id => { statusMap[id] = onlineUsers.has(id); });
      socket.emit('online_status', statusMap);
    });

    // ─── Call signaling (WebRTC) ─────────────────────────────────────
    socket.on('call_user', ({ to, from, signal, callType }) => {
      io.to(to).emit('incoming_call', { from, signal, callType });
    });

    socket.on('answer_call', ({ to, signal }) => {
      io.to(to).emit('call_accepted', { signal });
    });

    socket.on('end_call', ({ to }) => {
      io.to(to).emit('call_ended');
    });

    socket.on('ice_candidate', ({ to, candidate }) => {
      io.to(to).emit('ice_candidate', { candidate });
    });

    // ─── Disconnect ──────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const userId = socket.userId;
      if (userId) {
        const sockets = onlineUsers.get(userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date(), isCameraActive: false });
            await broadcastStatus(userId, 'user_offline', { userId, lastSeen: new Date() }, socket, io);
          }
        }
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
