const asyncHandler = require('express-async-handler');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { sanitizeUser, sanitizeChat, sanitizeMessagesReadReceipts } = require('../utils/privacyHelper');

// @desc  Access or create a 1-to-1 chat
// @route POST /api/chats
// @access Private
const accessChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) { res.status(400); throw new Error('userId is required'); }

  let chat = await Chat.findOne({
    isGroupChat: false,
    isChannel: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate('users', '-password -securityKey')
    .populate('latestMessage');

  if (chat) {
    chat = await User.populate(chat, { path: 'latestMessage.sender', select: 'username displayName profilePicture privacy friends' });
    const sanitizedChat = sanitizeChat(chat, req.user._id);
    if (sanitizedChat && sanitizedChat.latestMessage) {
      if (sanitizedChat.latestMessage.sender) {
        sanitizedChat.latestMessage.sender = sanitizeUser(sanitizedChat.latestMessage.sender, req.user._id);
      }
      const [sanMsg] = await sanitizeMessagesReadReceipts([sanitizedChat.latestMessage], req.user._id);
      sanitizedChat.latestMessage = sanMsg;
    }
    return res.status(200).json({ success: true, chat: sanitizedChat });
  }

  // Check if target user blocks DMs from group members
  const targetUser = await User.findById(userId).select('privacy friends');
  if (targetUser && targetUser.privacy?.allowDMFromGroups === false) {
    const areFriends = targetUser.friends.map(f => f.toString()).includes(req.user._id.toString());
    if (!areFriends) {
      res.status(403);
      throw new Error('This user does not accept direct messages from group members');
    }
  }

  const newChat = await Chat.create({ users: [req.user._id, userId], isGroupChat: false });
  const fullChat = await Chat.findById(newChat._id).populate('users', '-password -securityKey');

  res.status(201).json({ success: true, chat: sanitizeChat(fullChat, req.user._id) });
});

// @desc  Get all chats for a user
// @route GET /api/chats
// @access Private
const getChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
    .populate('users', 'username displayName profilePicture isOnline lastSeen isCameraActive privacy friends createdAt')
    .populate('groupAdmin', 'username displayName profilePicture')
    .populate('admins', 'username displayName profilePicture')
    .populate({
      path: 'latestMessage',
      populate: { path: 'sender', select: 'username displayName profilePicture privacy friends' },
    })
    .sort({ updatedAt: -1 });

  const chatsWithUnread = await Promise.all(
    chats.map(async (chat) => {
      const unreadCount = await Message.countDocuments({
        chat: chat._id,
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      });
      const chatObj = chat.toObject();
      chatObj.unreadCount = unreadCount;
      return chatObj;
    })
  );

  const sanitizedChats = chatsWithUnread.map(c => {
    const sanitized = sanitizeChat(c, req.user._id);
    if (sanitized && sanitized.latestMessage && sanitized.latestMessage.sender) {
      sanitized.latestMessage.sender = sanitizeUser(sanitized.latestMessage.sender, req.user._id);
    }
    return sanitized;
  });

  // Sanitize read receipts of latest messages in batch!
  const latestMessages = sanitizedChats.map(c => c.latestMessage).filter(Boolean);
  const sanitizedLatest = await sanitizeMessagesReadReceipts(latestMessages, req.user._id);
  let latestIdx = 0;
  sanitizedChats.forEach(c => {
    if (c && c.latestMessage) {
      c.latestMessage = sanitizedLatest[latestIdx++];
    }
  });

  res.status(200).json({ success: true, chats: sanitizedChats });
});

// @desc  Create group chat
// @route POST /api/chats/group
// @access Private
const createGroupChat = asyncHandler(async (req, res) => {
  const { name, users, description, isPublic, groupUsername } = req.body;

  let parsedUsers = [];
  try {
    if (users) {
      parsedUsers = typeof users === 'string' ? JSON.parse(users) : users;
    }
    if (!Array.isArray(parsedUsers)) {
      parsedUsers = [parsedUsers]; // fallback
    }
  } catch (e) {
    res.status(400); throw new Error('Invalid users format');
  }

  if (!name) {
    res.status(400);
    throw new Error('Group name is required');
  }

  const allUsers = [...new Set([...parsedUsers, req.user._id.toString()])];
  if (allUsers.length > 50) {
    res.status(400);
    throw new Error('Group maximum capacity is 50 members');
  }

  const groupData = {
    chatName: name,
    isGroupChat: true,
    users: allUsers,
    groupAdmin: req.user._id,
    admins: [req.user._id],
    groupDescription: description || '',
    isPublic: isPublic === 'true' || isPublic === true || false,
  };

  if (groupUsername) groupData.groupUsername = groupUsername.toLowerCase().trim().replace(/^@/, '');

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, 'groups', 'image');
      groupData.groupPicture = result.secure_url;
    } catch (cloudinaryErr) {
      console.error('Group Picture Cloudinary Upload Failed:', cloudinaryErr);
      res.status(500);
      throw new Error(`Group Picture Upload Failed: ${cloudinaryErr.message || cloudinaryErr}`);
    }
  }

  const group = await Chat.create(groupData);
  const fullGroup = await Chat.findById(group._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin', 'username displayName profilePicture')
    .populate('admins', 'username displayName profilePicture');

  res.status(201).json({ success: true, chat: fullGroup });
});

// @desc  Update group info
// @route PUT /api/chats/group/:id
// @access Private
const updateGroup = asyncHandler(async (req, res) => {
  const { name, chatName, description, groupDescription, isPublic, allowDirectMessages } = req.body;
  const chat = await Chat.findById(req.params.id);

  if (!chat || !chat.isGroupChat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  if (!isAdmin) { res.status(403); throw new Error('Only admins can update group info'); }

  const newName = name || chatName;
  const newDesc = description !== undefined ? description : groupDescription;
  if (newName) chat.chatName = newName;
  if (newDesc !== undefined) chat.groupDescription = newDesc;
  if (isPublic !== undefined) chat.isPublic = isPublic;
  if (allowDirectMessages !== undefined) chat.allowDirectMessages = allowDirectMessages;

  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, 'groups', 'image');
    chat.groupPicture = result.secure_url;
  }

  const updated = await chat.save();
  const fullChat = await Chat.findById(updated._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture');

  res.status(200).json({ success: true, chat: fullChat });
});

// @desc  Add user to group
// @route PUT /api/chats/group/:id/add
// @access Private
const addToGroup = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }

  const targetUserId = userId || req.user._id.toString();
  const isSelf = targetUserId.toString() === req.user._id.toString();

  if (isSelf) {
    if (!chat.isPublic) {
      res.status(403); throw new Error('Only public groups can be joined without invitation');
    }
  } else {
    const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
    if (!isAdmin) { res.status(403); throw new Error('Only admins can add members'); }
  }

  if (chat.users.length >= 50) { res.status(400); throw new Error('Group has reached maximum capacity of 50 members'); }
  if (chat.users.includes(targetUserId)) { res.status(400); throw new Error('User already in group'); }
  if (chat.bannedUsers.includes(targetUserId)) { res.status(400); throw new Error('User is banned'); }

  chat.users.push(targetUserId);
  await chat.save();

  // Create system message
  const targetUser = await User.findById(targetUserId);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: isSelf ? `${req.user.username} joined the group` : `${req.user.username} added ${targetUser?.username || 'new user'}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
    });
  }

  const updated = await Chat.findById(chat._id).populate('users', '-password -securityKey');
  res.status(200).json({ success: true, chat: updated });
});

// @desc  Remove user from group
// @route PUT /api/chats/group/:id/remove
// @access Private
const removeFromGroup = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  const isOwner = chat.groupAdmin.toString() === req.user._id.toString();
  if (!isAdmin && !isOwner) { res.status(403); throw new Error('Only admins can remove members'); }

  chat.users = chat.users.filter(u => u.toString() !== userId);
  chat.admins = chat.admins.filter(a => a.toString() !== userId);

  if (chat.users.length === 0) {
    await Chat.findByIdAndDelete(chat._id);
    return res.status(200).json({ success: true, dismantled: true, message: 'Group dismantled' });
  }

  await chat.save();

  // Create system message
  const targetUser = await User.findById(userId);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${req.user.username} removed ${targetUser?.username || 'user'}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
    });
  }

  const updated = await Chat.findById(chat._id).populate('users', '-password -securityKey');
  res.status(200).json({ success: true, chat: updated });
});

// @desc  Promote to admin
// @route PUT /api/chats/group/:id/promote
// @access Private
const promoteToAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only the owner can promote admins');
  }
  if (!chat.admins.includes(userId)) chat.admins.push(userId);
  await chat.save();

  // Create system message
  const targetUser = await User.findById(userId);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${targetUser.username} was promoted to admin by ${req.user.username}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
    });
  }

  res.status(200).json({ success: true, message: 'User promoted to admin' });
});

// @desc  Demote admin to member
// @route PUT /api/chats/group/:id/demote
// @access Private
const demoteToMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only the owner can demote admins');
  }
  chat.admins = chat.admins.filter(a => a.toString() !== userId);
  await chat.save();

  // Create system message
  const targetUser = await User.findById(userId);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${targetUser.username} was demoted to member by ${req.user.username}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
    });
  }

  res.status(200).json({ success: true, message: 'User demoted to member' });
});

// @desc  Leave group
// @route PUT /api/chats/group/:id/leave
// @access Private
const leaveGroup = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }

  chat.users = chat.users.filter(u => u.toString() !== req.user._id.toString());
  chat.admins = chat.admins.filter(a => a.toString() !== req.user._id.toString());

  if (chat.users.length === 0) {
    await Chat.findByIdAndDelete(chat._id);
    return res.status(200).json({ success: true, dismantled: true, message: 'Group dismantled since everyone left' });
  }

  // Transfer ownership if owner leaves
  if (chat.groupAdmin.toString() === req.user._id.toString() && chat.users.length > 0) {
    chat.groupAdmin = chat.users[0];
    if (!chat.admins.includes(chat.users[0])) chat.admins.push(chat.users[0]);
  }

  await chat.save();
  res.status(200).json({ success: true, message: 'Left group' });
});

// @desc  Pin / unpin a chat
// @route PUT /api/chats/:id/pin
// @access Private
const togglePinChat = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const isPinned = user.pinnedChats.some(c => c.toString() === req.params.id);

  if (isPinned) {
    user.pinnedChats = user.pinnedChats.filter(c => c.toString() !== req.params.id);
  } else {
    if (user.pinnedChats.length >= 3) {
      res.status(400); throw new Error('Cannot pin more than 3 chats');
    }
    user.pinnedChats.push(req.params.id);
  }

  await user.save();
  res.status(200).json({ success: true, isPinned: !isPinned });
});

// @desc  Archive / unarchive a chat
// @route PUT /api/chats/:id/archive
// @access Private
const toggleArchiveChat = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const isArchived = user.archivedChats.some(c => c.toString() === req.params.id);

  if (isArchived) {
    user.archivedChats = user.archivedChats.filter(c => c.toString() !== req.params.id);
  } else {
    user.archivedChats.push(req.params.id);
  }

  await user.save();
  res.status(200).json({ success: true, isArchived: !isArchived });
});

// @desc  Mute / unmute a chat
// @route PUT /api/chats/:id/mute
// @access Private
const toggleMuteChat = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const isMuted = user.mutedChats.some(c => c.toString() === req.params.id);

  if (isMuted) {
    user.mutedChats = user.mutedChats.filter(c => c.toString() !== req.params.id);
  } else {
    user.mutedChats.push(req.params.id);
  }

  await user.save();
  res.status(200).json({ success: true, isMuted: !isMuted });
});

const searchPublicChats = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const cleanQ = (q || '').trim().replace(/^@/, '');
  let chats = [];

  if (cleanQ.length === 0) {
    // Return top 10 trending/active groups the user is NOT already in
    chats = await Chat.find({
      isPublic: true,
      users: { $ne: req.user._id },
      'users.0': { $exists: true }
    })
    .populate('groupAdmin', 'username displayName profilePicture');

    // Sort in memory by user count descending to identify trending & active groups
    chats.sort((a, b) => (b.users || []).length - (a.users || []).length);
    // Slice to first 10
    chats = chats.slice(0, 10);
  } else {
    // Return up to 10 groups matching the search query the user is NOT already in
    chats = await Chat.find({
      isPublic: true,
      users: { $ne: req.user._id },
      'users.0': { $exists: true },
      $or: [
        { chatName: { $regex: cleanQ, $options: 'i' } },
        { groupUsername: { $regex: cleanQ, $options: 'i' } },
      ],
    })
    .populate('groupAdmin', 'username displayName profilePicture')
    .limit(10);
  }

  res.status(200).json({ success: true, chats });
});

// @desc  Set disappearing messages timer for a chat
// @route PUT /api/chats/:id/disappear
// @access Private
const setDisappearTimer = asyncHandler(async (req, res) => {
  const { seconds } = req.body; // 0=off, 3600=1h, 86400=24h, 604800=7d
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }
  if (!chat.users.map(u => u.toString()).includes(req.user._id.toString())) {
    res.status(403); throw new Error('Not a member of this chat');
  }
  if (chat.isGroupChat) {
    const isOwner = chat.groupAdmin && chat.groupAdmin.toString() === req.user._id.toString();
    const isAdmin = chat.admins && chat.admins.map(a => a.toString()).includes(req.user._id.toString());
    if (!isOwner && !isAdmin) {
      res.status(403);
      throw new Error('Only group admins or the owner can change disappearing messages settings');
    }
  }
  chat.disappearAfter = seconds || 0;
  await chat.save();

  // Create system message
  let timeLabel = 'Off';
  if (seconds === -1) timeLabel = 'After seen';
  else if (seconds === 3600) timeLabel = '1 Hour';
  else if (seconds === 86400) timeLabel = '24h seen';
  else if (seconds === 604800) timeLabel = '7d seen';

  const user = await User.findById(req.user._id);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${user.username} set disappearing messages to ${timeLabel}`,
    isSystemMessage: true,
    messageType: 'system',
  });

  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((userId) => {
      io.to(userId.toString()).emit('new_message', fullMsg);
    });
  }

  res.status(200).json({ success: true, disappearAfter: chat.disappearAfter, message: fullMsg });
});

// @desc  Delete a chat (dismantle / remove conversation)
// @route DELETE /api/chats/:id
// @access Private
const deleteChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    res.status(404);
    throw new Error('Chat not found');
  }

  // Check if user is a participant of this chat
  const isParticipant = chat.users.some(uId => uId.toString() === req.user._id.toString());
  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not authorized to delete this chat');
  }

  // Delete the chat
  await Chat.findByIdAndDelete(req.params.id);

  // Also delete associated messages
  await Message.deleteMany({ chat: req.params.id });

  res.status(200).json({ success: true, message: 'Chat deleted successfully' });
});

module.exports = {
  accessChat, getChats, createGroupChat, updateGroup, addToGroup,
  removeFromGroup, promoteToAdmin, demoteToMember,  leaveGroup,
  togglePinChat,
  toggleArchiveChat,
  toggleMuteChat,
  searchPublicChats,
  setDisappearTimer,
  deleteChat,
};
