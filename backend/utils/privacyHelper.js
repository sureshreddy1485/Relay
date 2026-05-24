const sanitizeUser = (user, currentUserId) => {
  if (!user) return null;
  
  // Convert Mongoose doc to raw object if necessary
  const u = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  
  const targetId = u._id ? u._id.toString() : '';
  const reqId = currentUserId ? currentUserId.toString() : '';
  
  if (targetId === reqId) {
    return u; // No sanitization needed for self
  }
  
  const targetFriends = (u.friends || []).map(f => (f && f._id ? f._id.toString() : f ? f.toString() : ''));
  const isFriend = targetFriends.includes(reqId);
  
  // Profile Picture visibility check
  const picVis = u.privacy?.profilePictureVisibility || 'everyone';
  if (picVis === 'nobody' || (picVis === 'friends' && !isFriend)) {
    u.profilePicture = '';
  }
  
  // Last Seen visibility check
  const lastSeenVis = u.privacy?.lastSeenVisibility || 'everyone';
  if (lastSeenVis === 'nobody' || (lastSeenVis === 'friends' && !isFriend)) {
    u.isOnline = false;
    u.lastSeen = null;
    u.isCameraActive = false;
  }
  
  if (u.role === 'system_bot' || u.username === 'mica_bot') {
    u.isOnline = true;
    u.lastSeen = null;
  }
  
  // Delete sensitive fields that shouldn't leak
  delete u.friends;
  delete u.friendRequests;
  delete u.sentRequests;
  delete u.blockedUsers;
  delete u.privacy;
  
  u.isFriend = isFriend;
  
  return u;
};

const sanitizeChat = (chat, currentUserId) => {
  if (!chat) return null;
  const c = typeof chat.toObject === 'function' ? chat.toObject() : { ...chat };
  if (c.users) {
    c.users = c.users.map(u => sanitizeUser(u, currentUserId));
  }
  return c;
};

const sanitizeMessagesReadReceipts = async (messages, requestingUserId) => {
  if (!messages || messages.length === 0) return messages;
  
  // Collect all unique user IDs in all readBy arrays
  const userIds = new Set();
  messages.forEach(m => {
    if (m.readBy) {
      m.readBy.forEach(u => {
        const id = (u._id || u).toString();
        if (id !== requestingUserId?.toString()) {
          userIds.add(id);
        }
      });
    }
  });
  
  if (userIds.size === 0) return messages;
  
  // Fetch privacy settings for all these users in one single query!
  const User = require('../models/User');
  const privacyUsers = await User.find({ _id: { $in: Array.from(userIds) } }).select('privacy');
  
  // Create a map of userId -> readReceipts
  const receiptMap = {};
  privacyUsers.forEach(u => {
    receiptMap[u._id.toString()] = u.privacy?.readReceipts || 'automatic';
  });
  
  // Filter the readBy array for each message
  return messages.map(msg => {
    const m = typeof msg.toObject === 'function' ? msg.toObject() : { ...msg };
    if (m.readBy) {
      m.readBy = m.readBy.filter(u => {
        const id = (u._id || u).toString();
        if (id === requestingUserId?.toString()) return true; // Keep requester
        return receiptMap[id] !== 'hide'; // Keep if not hidden
      });
    }
    return m;
  });
};

module.exports = { sanitizeUser, sanitizeChat, sanitizeMessagesReadReceipts };
