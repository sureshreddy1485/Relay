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

  // Check if the target user has disabled DMs from group members
  const targetUser = await User.findById(userId).select('role privacy friends');
  
  if (targetUser && targetUser.role === 'system_bot') {
    res.status(403);
    throw new Error('You cannot send direct messages to the system bot');
  }

  // Check if the INITIATING user has disabled DMs from groups in their own settings
  const initiator = await User.findById(req.user._id).select('privacy');
  const initiatorAllowsDM = initiator?.privacy?.allowDMFromGroups !== false;

  if (targetUser) {
    const targetAllowsDM = targetUser.privacy?.allowDMFromGroups !== false;
    const areFriends = targetUser.friends.map(f => f.toString()).includes(req.user._id.toString());

    if (!areFriends) {
      // Check if a shared group permits DMs between these two users
      const sharedGroups = await Chat.find({
        isGroupChat: true,
        users: { $all: [req.user._id, userId] },
      }).select('allowDirectMessages _id');

      const targetAllowsGlobal = targetUser.privacy?.allowDMFromGroups !== false;
      const initiatorAllowsGlobal = initiator?.privacy?.allowDMFromGroups !== false;
      const targetAllowedGroups = targetUser.privacy?.allowedDMGroups || [];
      const initiatorAllowedGroups = initiator?.privacy?.allowedDMGroups || [];
      const targetDisallowedGroups = targetUser.privacy?.disallowedDMGroups || [];
      const initiatorDisallowedGroups = initiator?.privacy?.disallowedDMGroups || [];

      let allowedByGroup = false;

      for (const g of sharedGroups) {
        if (g.allowDirectMessages === false) continue;
        
        const tAllows = targetAllowedGroups.some(id => id.toString() === g._id.toString()) || 
                        (targetAllowsGlobal && !targetDisallowedGroups.some(id => id.toString() === g._id.toString()));
                        
        const iAllows = initiatorAllowedGroups.some(id => id.toString() === g._id.toString()) || 
                        (initiatorAllowsGlobal && !initiatorDisallowedGroups.some(id => id.toString() === g._id.toString()));
        
        if (tAllows && iAllows) {
          allowedByGroup = true;
          break;
        }
      }

      if (!allowedByGroup) {
        const anyGroupAllowed = sharedGroups.some(g => g.allowDirectMessages !== false);
        res.status(403);
        throw new Error(
          !anyGroupAllowed
            ? 'Direct messages are disabled in your shared group(s)'
            : 'This user does not accept direct messages, or you have disabled them'
        );
      }
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
    .populate('joinRequests', 'username displayName profilePicture')
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

  const { getMicaBotId } = require('../utils/botHelper');
  const micaBotId = getMicaBotId();
  
  const allUsers = [...new Set([...parsedUsers, req.user._id.toString()])];
  if (micaBotId && !allUsers.includes(micaBotId.toString())) {
    allUsers.push(micaBotId.toString());
  }

  if (allUsers.length > 51) {
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

  if (groupUsername) {
    const rawUsername = groupUsername.toLowerCase().trim().replace(/^@/, '');
    const usernameRegex = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
    if (!usernameRegex.test(rawUsername)) {
      res.status(400);
      throw new Error('Group username must start with a letter or underscore and contain only letters, numbers, underscores, and dots');
    }
    if (rawUsername.length < 8) {
      res.status(400);
      throw new Error('Group username must be at least 8 characters long');
    }
    groupData.groupUsername = rawUsername;
  }
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

  if (fullGroup.isPublic) {
    const io = req.app.get('io');
    if (io) {
      io.emit('public_groups_updated');
    }
  }

  res.status(201).json({ success: true, chat: fullGroup });
});

// @desc  Update group info
// @route PUT /api/chats/group/:id
// @access Private
const updateGroup = asyncHandler(async (req, res) => {
  const { name, chatName, description, groupDescription, isPublic, allowDirectMessages, joinPrivacy } = req.body;
  const chat = await Chat.findById(req.params.id);

  if (!chat || !chat.isGroupChat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  if (!isAdmin) { res.status(403); throw new Error('Only admins can update group info'); }

  const newName = name || chatName;
  const newDesc = description !== undefined ? description : groupDescription;
  
  let nameChangedTo = null;
  if (newName && newName !== chat.chatName) {
    nameChangedTo = newName;
    chat.chatName = newName;
  } else if (newName) {
    chat.chatName = newName;
  }

  let descChanged = false;
  if (newDesc !== undefined && newDesc !== chat.groupDescription) {
    descChanged = true;
    chat.groupDescription = newDesc;
  } else if (newDesc !== undefined) {
    chat.groupDescription = newDesc;
  }
  
  let isPublicChangedTo = null;
  if (isPublic !== undefined) {
    const newIsPublic = isPublic === 'true' || isPublic === true;
    if (chat.isPublic !== newIsPublic) {
      isPublicChangedTo = newIsPublic;
      chat.isPublic = newIsPublic;
    }
  }

  if (allowDirectMessages !== undefined) chat.allowDirectMessages = allowDirectMessages;
  let joinPrivacyChangedTo = null;
  if (joinPrivacy !== undefined && chat.joinPrivacy !== joinPrivacy) {
    joinPrivacyChangedTo = joinPrivacy;
    chat.joinPrivacy = joinPrivacy;
  }

  let picChanged = false;
  if (req.file) {
    try {
      const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
      const result = await uploadToCloudinary(req.file.buffer, 'groups', 'image');
      if (chat.groupPicture) {
        await deleteFromCloudinary(chat.groupPicture);
      }
      chat.groupPicture = result.secure_url;
      picChanged = true;
    } catch (err) {
      console.error('Group Picture Cloudinary Upload Failed:', err);
    }
  }

  const updated = await chat.save();
  const Message = require('../models/Message');
  const io = req.app.get('io');
  const sysMessages = [];

  if (nameChangedTo) {
    const sysMsg = await Message.create({
      sender: req.user._id,
      chat: chat._id,
      content: `${req.user.displayName || req.user.username} changed the group name to "${nameChangedTo}"`,
      isSystemMessage: true,
      messageType: 'system',
    });
    sysMessages.push(sysMsg);
  }

  if (descChanged) {
    const sysMsg = await Message.create({
      sender: req.user._id,
      chat: chat._id,
      content: `${req.user.displayName || req.user.username} changed the group description`,
      isSystemMessage: true,
      messageType: 'system',
    });
    sysMessages.push(sysMsg);
  }

  if (picChanged) {
    const sysMsg = await Message.create({
      sender: req.user._id,
      chat: chat._id,
      content: `${req.user.displayName || req.user.username} changed the group profile picture`,
      isSystemMessage: true,
      messageType: 'system',
    });
    sysMessages.push(sysMsg);
  }

  if (isPublicChangedTo !== null) {
    const sysMsg = await Message.create({
      sender: req.user._id,
      chat: chat._id,
      content: `${req.user.displayName || req.user.username} changed group to ${isPublicChangedTo ? 'public' : 'private'}`,
      isSystemMessage: true,
      messageType: 'system',
    });
    sysMessages.push(sysMsg);
  }

  if (joinPrivacyChangedTo) {
    const sysMsg = await Message.create({
      sender: req.user._id,
      chat: chat._id,
      content: `${req.user.displayName || req.user.username} changed who can join to ${joinPrivacyChangedTo === 'invite_only' ? 'request' : joinPrivacyChangedTo}`,
      isSystemMessage: true,
      messageType: 'system',
    });
    sysMessages.push(sysMsg);
  }

  if (sysMessages.length > 0) {
    chat.latestMessage = sysMessages[sysMessages.length - 1]._id;
    await chat.save();
    if (io) {
      for (const sysMsg of sysMessages) {
        const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
        chat.users.forEach(uId => {
          io.to(uId.toString()).emit('new_message', fullMsg);
        });
      }
    }
  }

  const fullChat = await Chat.findById(updated._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture');

  // Emit chat_updated to all members so GroupInfoScreen and ChatRoomScreen auto-refresh
  if (io) {
    fullChat.users.forEach(u => {
      io.to((u._id || u).toString()).emit('chat_updated', fullChat);
    });
    
    // If visibility changed, notify everyone so Community screen refreshes
    if (isPublic !== undefined && chat.isPublic !== isPublic) {
      io.emit('public_groups_updated');
    } else if (isPublic !== undefined) {
      // It's possible the value was changed and saved, so let's just trigger it anyway
      // Actually let's just always trigger it when group details change, it's safer
      io.emit('public_groups_updated');
    }
  }

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
    if (!chat.isPublic && !(chat.invitedUsers && chat.invitedUsers.includes(req.user._id))) {
      res.status(403); throw new Error('Only public groups can be joined without invitation');
    }
    
    if (chat.joinPrivacy === 'closed') {
      res.status(403); throw new Error('This group is closed to new members');
    }
    
    if (chat.joinPrivacy === 'invite_only' && !(chat.invitedUsers && chat.invitedUsers.includes(req.user._id))) {
      if (chat.joinRequests && chat.joinRequests.includes(req.user._id)) {
        res.status(400); throw new Error('You already sent a join request');
      }
      if (!chat.joinRequests) chat.joinRequests = [];
      chat.joinRequests.push(req.user._id);
      await chat.save();
      
      const Message = require('../models/Message');
      const sysMsg = await Message.create({
        sender: req.user._id,
        chat: chat._id,
        content: `${req.user.displayName || req.user.username} requested to join`,
        isSystemMessage: true,
        messageType: 'system',
      });
      chat.latestMessage = sysMsg._id;
      await chat.save();
      
      const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
      const io = req.app.get('io');
      if (io) {
        chat.users.forEach(uId => {
          io.to(uId.toString()).emit('new_message', fullMsg);
        });
      }

      return res.status(200).json({ success: true, message: 'Join request sent to admins', status: 'requested' });
    }
  } else {
    // We now enforce invite-only! Admins must invite users via direct message.
    res.status(400); throw new Error('You cannot add users directly. You must send them an invitation.');
  }

  if (chat.users.length >= 50) { res.status(400); throw new Error('Group has reached maximum capacity of 50 members'); }
  if (chat.users.includes(targetUserId)) { res.status(400); throw new Error('User already in group'); }
  if (chat.bannedUsers.includes(targetUserId)) { res.status(400); throw new Error('User is banned'); }

  chat.users.push(targetUserId);
  await chat.save();

  if (chat.invitedUsers && chat.invitedUsers.includes(targetUserId)) {
    chat.invitedUsers = chat.invitedUsers.filter(u => u.toString() !== targetUserId.toString());
  }
  await chat.save();

  // Clear previous message history for the new user so they start fresh
  const Message = require('../models/Message');
  await Message.updateMany(
    { chat: chat._id },
    { $addToSet: { deletedBy: targetUserId } }
  );

  // Mark the group_invite message as used so the "Join Group" button becomes "Link Expired"
  // Find the invite message sent to the joining user (across all DM chats) for this group
  const inviteContent = JSON.stringify({ groupId: chat._id.toString() });
  const inviteMsg = await Message.findOne({
    messageType: 'group_invite',
    inviteAccepted: false,
    content: new RegExp(chat._id.toString()),
  });
  if (inviteMsg) {
    inviteMsg.inviteAccepted = true;
    await inviteMsg.save();
    // Notify clients so button updates in real-time
    const io = req.app.get('io');
    if (io) {
      io.emit('invite_accepted', { messageId: inviteMsg._id, chatId: inviteMsg.chat });
    }
  }

  // Create system message
  const targetUser = await User.findById(targetUserId);
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${req.user.username} joined the group`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  const io = req.app.get('io');

  // Fully populate the updated chat to send to all members
  const updatedChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture');

  if (io) {
    // Emit the new "joined" system message to all members
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
    });
    // Emit chat_updated so ChatRoomScreen refreshes header (member count + user list) in real-time
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('chat_updated', updatedChat);
    });
  }

  const BotEngine = require('../utils/BotEngine');
  BotEngine.onUserJoinedGroup(updatedChat, targetUserId, io);

  res.status(200).json({ success: true, chat: updatedChat });
});

// @desc  Invite user to group
// @route PUT /api/chats/group/:id/invite
// @access Private
const inviteToGroup = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString()) || chat.groupAdmin.toString() === req.user._id.toString();
  if (!isAdmin) { res.status(403); throw new Error('Only admins can invite members'); }

  if (chat.users.includes(userId)) { res.status(400); throw new Error('User already in group'); }
  if (chat.bannedUsers.includes(userId)) { res.status(400); throw new Error('User is banned'); }

  if (!chat.invitedUsers.includes(userId)) {
    chat.invitedUsers.push(userId);
    await chat.save();
  }

  res.status(200).json({ success: true, message: 'User invited' });
});

// @desc  Remove user(s) from group
// @route PUT /api/chats/group/:id/remove
// @access Private
const removeFromGroup = asyncHandler(async (req, res) => {
  const { userId, userIds } = req.body;
  const idsToRemove = userIds ? userIds : [userId];

  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  const isOwner = chat.groupAdmin.toString() === req.user._id.toString();
  if (!isAdmin && !isOwner) { res.status(403); throw new Error('Only admins can remove members'); }

  const { getMicaBotId } = require('../utils/botHelper');
  const micaBotId = getMicaBotId();
  if (micaBotId && idsToRemove.includes(micaBotId.toString())) {
    res.status(403); throw new Error('You cannot remove the system assistant');
  }

  // Only keep users who are NOT in the idsToRemove array
  chat.users = chat.users.filter(u => !idsToRemove.includes(u.toString()));
  chat.admins = chat.admins.filter(a => !idsToRemove.includes(a.toString()));

  if (chat.users.length === 0) {
    await Chat.findByIdAndDelete(chat._id);
    if (chat.isPublic) {
      const io = req.app.get('io');
      if (io) io.emit('public_groups_updated');
    }
    return res.status(200).json({ success: true, dismantled: true, message: 'Group dismantled' });
  }

  await chat.save();

  // Create system message
  const Message = require('../models/Message');
  
  let msgContent = '';
  if (idsToRemove.length === 1) {
    const targetUser = await User.findById(idsToRemove[0]);
    msgContent = `${req.user.username} removed ${targetUser?.username || 'user'}`;
  } else {
    msgContent = `${req.user.username} removed ${idsToRemove.length} members`;
  }

  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: msgContent,
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

// @desc  Transfer ownership
// @route PUT /api/chats/group/:id/transfer-ownership
// @access Private
const transferOwnership = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Group not found'); }
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only the current owner can transfer ownership');
  }
  
  if (!chat.users.includes(userId)) {
    res.status(400); throw new Error('User must be a member of the group to become owner');
  }

  // Ensure new owner is an admin
  if (!chat.admins.includes(userId)) chat.admins.push(userId);
  chat.groupAdmin = userId;
  await chat.save();

  // Create system message
  const targetUser = await User.findById(userId);
  const Message = require('../models/Message');
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${req.user.username} transferred ownership to ${targetUser.username}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');
  
  const fullChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture');

  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((uId) => {
      io.to(uId.toString()).emit('new_message', fullMsg);
      io.to(uId.toString()).emit('chat_updated', fullChat);
    });
  }

  res.status(200).json({ success: true, message: 'Ownership transferred successfully' });
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
    if (chat.isPublic) {
      const io = req.app.get('io');
      if (io) io.emit('public_groups_updated');
    }
    return res.status(200).json({ success: true, dismantled: true, message: 'Group dismantled since everyone left' });
  }

  // Transfer ownership if owner leaves
  if (chat.groupAdmin.toString() === req.user._id.toString() && chat.users.length > 0) {
    const { getMicaBotId } = require('../utils/botHelper');
    const micaId = getMicaBotId() ? getMicaBotId().toString() : null;
    
    // Filter users to exclude Mica
    const humanUsers = chat.users.filter(u => u.toString() !== micaId);
    
    // If only Mica is left, dismantle the group
    if (humanUsers.length === 0) {
      await Chat.findByIdAndDelete(chat._id);
      if (chat.isPublic) {
        const io = req.app.get('io');
        if (io) io.emit('public_groups_updated');
      }
      return res.status(200).json({ success: true, dismantled: true, message: 'Group dismantled' });
    }
    
    // Check if there are any admins left (excluding Mica)
    const humanAdmins = chat.admins.filter(a => a.toString() !== micaId);
    let newAdminId;
    
    if (humanAdmins.length > 0) {
      // Pick a random admin
      const randomIndex = Math.floor(Math.random() * humanAdmins.length);
      newAdminId = humanAdmins[randomIndex];
    } else {
      // Pick a random user
      const randomIndex = Math.floor(Math.random() * humanUsers.length);
      newAdminId = humanUsers[randomIndex];
    }
    
    chat.groupAdmin = newAdminId;
    if (!chat.admins.includes(newAdminId)) chat.admins.push(newAdminId);
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
    // Return up to 10 groups matching the search query (including groups user is already in)
    chats = await Chat.find({
      isPublic: true,
      $or: [
        { chatName: { $regex: cleanQ, $options: 'i' } },
        { groupUsername: { $regex: cleanQ, $options: 'i' } },
      ],
    })
    .populate('groupAdmin', 'username displayName profilePicture')
    .limit(20);
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
  else if (seconds === 5) timeLabel = '5 seconds';
  else if (seconds === 10) timeLabel = '10 seconds';
  else if (seconds === 20) timeLabel = '20 seconds';
  else if (seconds === 30) timeLabel = '30 seconds';
  else if (seconds === 3600) timeLabel = '1 Hour';
  else if (seconds === 86400) timeLabel = '24 hours';
  else if (seconds === 604800) timeLabel = '7 days';

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
  
  const fullChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture');
  
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((userId) => {
      io.to(userId.toString()).emit('new_message', fullMsg);
      io.to(userId.toString()).emit('chat_updated', fullChat);
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

  const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');

  // Delete all media attached to messages in this chat from Cloudinary
  const mediaMessages = await Message.find({
    chat: req.params.id,
    $or: [{ mediaPublicId: { $exists: true, $ne: '' } }, { mediaUrl: { $exists: true, $ne: '' } }],
  }).select('mediaPublicId mediaUrl mediaType');

  await Promise.allSettled(
    mediaMessages.map(msg => {
      const ref = msg.mediaPublicId || msg.mediaUrl;
      return ref ? deleteFromCloudinary(ref) : Promise.resolve();
    })
  );

  // If it's a group, delete the group picture too
  if (chat.isGroupChat && chat.groupPicture) {
    await deleteFromCloudinary(chat.groupPicture);
  }

  // Delete the chat and all its messages
  await Chat.findByIdAndDelete(req.params.id);
  await Message.deleteMany({ chat: req.params.id });

  if (chat.isPublic) {
    const io = req.app.get('io');
    if (io) {
      io.emit('public_groups_updated');
    }
  }

  res.status(200).json({ success: true, message: 'Chat deleted successfully' });
});


// @desc  Update chat theme
// @route PUT /api/chats/:id/theme
// @access Private
const updateChatTheme = asyncHandler(async (req, res) => {
  const { theme } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }
  if (!chat.users.some(uId => uId.toString() === req.user._id.toString())) {
    res.status(403); throw new Error('Not authorized');
  }

  chat.theme = theme || 'default';
  
  // Create system message
  const Message = require('../models/Message');
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${req.user.displayName || req.user.username} changed theme`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();
  
  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');

  // Realtime emission
  const io = req.app.get('io');
  if (io) {
    chat.users.forEach((userId) => {
      io.to(userId.toString()).emit('new_message', fullMsg);
      io.to(userId.toString()).emit('chat_updated', { _id: chat._id, theme: chat.theme });
    });
  }
  
  res.status(200).json({ success: true, theme: chat.theme });
});

// @desc  Update security (screenshots, forwarding)
// @route PUT /api/chats/:id/security
// @access Private
const updateChatSecurity = asyncHandler(async (req, res) => {
  const { allowScreenshots, allowForwarding } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }
  
  if (chat.isGroupChat) {
    const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
    if (!isAdmin) { res.status(403); throw new Error('Only admins can update security settings'); }
  } else {
    if (!chat.users.some(uId => uId.toString() === req.user._id.toString())) {
      res.status(403); throw new Error('Not authorized');
    }
  }

  let actionStrs = [];
  if (allowScreenshots !== undefined && allowScreenshots !== chat.allowScreenshots) {
    actionStrs.push(`turned ${allowScreenshots ? 'on' : 'off'} screenshots`);
    chat.allowScreenshots = allowScreenshots;
  }
  if (allowForwarding !== undefined && allowForwarding !== chat.allowForwarding) {
    actionStrs.push(`turned ${allowForwarding ? 'on' : 'off'} forwarding`);
    chat.allowForwarding = allowForwarding;
  }
  
  if (actionStrs.length === 0) {
    return res.status(200).json({ success: true, chat });
  }
  await chat.save();
  
  // Create system message
  const Message = require('../models/Message');
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${req.user.displayName || req.user.username} ${actionStrs.join(' and ')}`,
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
      io.to(userId.toString()).emit('chat_updated', { _id: chat._id, allowScreenshots: chat.allowScreenshots, allowForwarding: chat.allowForwarding });
    });
  }
  
  res.status(200).json({ success: true, chat });
});

// @desc  Accept join request
// @route PUT /api/chats/group/:id/accept-request
// @access Private
const acceptJoinRequest = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.isGroupChat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  if (!isAdmin) { res.status(403); throw new Error('Only admins can accept requests'); }

  if (!chat.joinRequests.includes(userId)) {
    res.status(400); throw new Error('No pending join request from this user');
  }

  if (chat.users.length >= 50) { res.status(400); throw new Error('Group has reached maximum capacity'); }

  chat.joinRequests = chat.joinRequests.filter(u => u.toString() !== userId);
  
  if (!chat.users.includes(userId)) {
    chat.users.push(userId);
  }
  await chat.save();

  // Clear previous message history for the new user so they start fresh
  const Message = require('../models/Message');
  await Message.updateMany(
    { chat: chat._id },
    { $addToSet: { deletedBy: userId } }
  );

  const targetUser = await User.findById(userId);

  // Create system message
  const sysMsg = await Message.create({
    sender: req.user._id,
    chat: chat._id,
    content: `${targetUser?.displayName || targetUser?.username} join request approved by ${req.user.displayName || req.user.username}`,
    isSystemMessage: true,
    messageType: 'system',
  });
  chat.latestMessage = sysMsg._id;
  await chat.save();

  const fullMsg = await Message.findById(sysMsg._id).populate('sender', 'username displayName profilePicture');

  const fullChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture')
    .populate('joinRequests', 'username displayName profilePicture');

  // Emit chat_updated
  const io = req.app.get('io');
  if (io) {
    fullChat.users.forEach(u => {
      io.to((u._id || u).toString()).emit('new_message', fullMsg);
      io.to((u._id || u).toString()).emit('chat_updated', fullChat);
    });
    // also emit to the newly joined user
    io.to(userId).emit('chat_updated', fullChat);
  }

  const BotEngine = require('../utils/BotEngine');
  BotEngine.onUserJoinedGroup(fullChat, userId, io);

  res.status(200).json({ success: true, chat: fullChat });
});

// @desc  Decline join request
// @route PUT /api/chats/group/:id/decline-request
// @access Private
const declineJoinRequest = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.isGroupChat) { res.status(404); throw new Error('Group not found'); }

  const isAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
  if (!isAdmin) { res.status(403); throw new Error('Only admins can decline requests'); }

  chat.joinRequests = chat.joinRequests.filter(u => u.toString() !== userId);
  await chat.save();

  const fullChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate('groupAdmin admins', 'username displayName profilePicture')
    .populate('joinRequests', 'username displayName profilePicture');

  // Emit chat_updated
  const io = req.app.get('io');
  if (io) {
    fullChat.users.forEach(u => {
      io.to((u._id || u).toString()).emit('chat_updated', fullChat);
    });
  }

  res.status(200).json({ success: true, chat: fullChat });
});

module.exports = {
  accessChat, getChats, createGroupChat, updateGroup, addToGroup, inviteToGroup,
  removeFromGroup, promoteToAdmin, demoteToMember, transferOwnership, leaveGroup,
  togglePinChat,
  toggleArchiveChat,
  toggleMuteChat,
  searchPublicChats,
  setDisappearTimer,
  deleteChat,
  updateChatTheme,
  updateChatSecurity,
  acceptJoinRequest,
  declineJoinRequest,
};
