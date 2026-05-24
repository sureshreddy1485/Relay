const asyncHandler = require('express-async-handler');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { sanitizeUser, sanitizeMessagesReadReceipts } = require('../utils/privacyHelper');
const { Expo } = require('expo-server-sdk');

let expo = new Expo();

const populateMessage = (query) =>
  query
    .populate('sender', 'username displayName profilePicture privacy friends')
    .populate('replyTo')
    .populate('reactions.user', 'username displayName profilePicture')
    .populate({
      path: 'chat',
      populate: { path: 'users', select: 'username displayName profilePicture isOnline privacy friends pushToken' },
    });

// @desc  Send a message
// @route POST /api/messages
// @access Private
const sendMessage = asyncHandler(async (req, res) => {
  const { chatId, content, replyTo, isSelfDestructing, destructAfterSeconds, isEncrypted, encryptedContent, isLive, messageType: clientMessageType } = req.body;

  if (!chatId) { res.status(400); throw new Error('chatId is required'); }

  const chat = await Chat.findById(chatId);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }
  if (!chat.users.includes(req.user._id)) { res.status(403); throw new Error('Not a member of this chat'); }

  // Check blocking for 1-to-1 chats
  if (!chat.isGroupChat) {
    const otherUserId = chat.users.find(u => u.toString() !== req.user._id.toString());
    if (otherUserId) {
      const otherUser = await User.findById(otherUserId).select('blockedUsers');
      const currentUser = await User.findById(req.user._id).select('blockedUsers');
      
      const isBlockedByOther = otherUser?.blockedUsers?.some(id => id.toString() === req.user._id.toString());
      const isBlockedByCurrent = currentUser?.blockedUsers?.some(id => id.toString() === otherUserId.toString());
      
      if (isBlockedByOther || isBlockedByCurrent) {
        res.status(403);
        throw new Error('Cannot send messages. Block constraint is active between these accounts.');
      }
    }
  }

  let mediaUrl = req.body.mediaUrl || '';
  let mediaPublicId = req.body.mediaPublicId || '';
  let mediaType = req.body.mediaType || '';
  let messageType = req.body.messageType || 'text';
  let fileName = req.body.fileName || '';
  let fileSize = req.body.fileSize ? parseInt(req.body.fileSize) : 0;

  if (req.file) {
    const mime = req.file.mimetype;
    let folder = 'messages';
    let resourceType = 'auto';

    if (mime.startsWith('image/')) { mediaType = 'image'; messageType = 'image'; folder = 'images'; }
    else if (mime.startsWith('video/')) { mediaType = 'video'; messageType = 'video'; folder = 'videos'; }
    else if (mime.startsWith('audio/')) { mediaType = 'audio'; messageType = (mime.includes('webm') || mime.includes('ogg') || mime.includes('m4a') || clientMessageType === 'voice') ? 'voice' : 'audio'; folder = 'audio'; }
    else { mediaType = 'document'; messageType = 'document'; folder = 'documents'; }

    const result = await uploadToCloudinary(req.file.buffer, folder, resourceType);
    mediaUrl = result.secure_url;
    mediaPublicId = result.public_id;
    fileName = req.file.originalname;
    fileSize = req.file.size;
  }

  const msgData = {
    sender: req.user._id,
    chat: chatId,
    content: content || '',
    mediaUrl,
    mediaPublicId,
    mediaType,
    messageType,
    fileName,
    fileSize,
    replyTo: replyTo || null,
    isSelfDestructing: (chat.disappearAfter > 0) || isSelfDestructing === 'true' || isSelfDestructing === true || false,
    isEncrypted: isEncrypted || false,
    encryptedContent: encryptedContent || '',
    isLive: isLive === 'true' || isLive === true || false,
    destructAfterSeconds: parseInt(req.body.destructAfterSeconds) || 5,
  };

  if (chat.disappearAfter > 0) {
    // For entire chat disappearing messages, set expiresAt immediately
    msgData.expiresAt = new Date(Date.now() + chat.disappearAfter * 1000);
  }
  // We intentionally do NOT set msgData.expiresAt for media disappearing messages (isSelfDestructing).
  // The frontend handles the media countdown and calls /destruct API when viewed.

  let message = await Message.create(msgData);
  message = await populateMessage(Message.findById(message._id));

  // Update chat's latest message
  await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

  // Emit via socket to all participants' personal rooms
  const io = req.app.get('io');
  let pushMessages = [];
  
  if (io) {
    chat.users.forEach((userId) => {
      const userSpecificMessage = message.toObject();
      if (userSpecificMessage.sender) {
        userSpecificMessage.sender = sanitizeUser(userSpecificMessage.sender, userId);
      }
      if (userSpecificMessage.chat && userSpecificMessage.chat.users) {
        userSpecificMessage.chat.users = userSpecificMessage.chat.users.map(u => sanitizeUser(u, userId));
      }
      io.to(userId.toString()).emit('new_message', userSpecificMessage);

      // Prepare Push Notifications for recipients
      if (userId.toString() !== req.user._id.toString()) {
        const targetUser = userSpecificMessage.chat?.users?.find(u => (u._id || u).toString() === userId.toString());
        if (targetUser && targetUser.pushToken && Expo.isExpoPushToken(targetUser.pushToken)) {
          let pushBody = content || `Sent a ${messageType}`;
          if (isEncrypted) pushBody = '🔒 Encrypted Message';
          
          pushMessages.push({
            to: targetUser.pushToken,
            sound: 'default',
            title: chat.isGroupChat ? chat.groupName : (req.user.displayName || req.user.username),
            body: pushBody,
            data: { chatId: chat._id },
          });
        }
      }
    });
  }

  // Send push notifications asynchronously
  if (pushMessages.length > 0) {
    let chunks = expo.chunkPushNotifications(pushMessages);
    (async () => {
      for (let chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error('Error sending push notification:', error);
        }
      }
    })();
  }

  const resMessage = message.toObject();
  if (resMessage.sender) {
    resMessage.sender = sanitizeUser(resMessage.sender, req.user._id);
  }
  if (resMessage.chat && resMessage.chat.users) {
    resMessage.chat.users = resMessage.chat.users.map(u => sanitizeUser(u, req.user._id));
  }

  const [sanitizedMessage] = await sanitizeMessagesReadReceipts([resMessage], req.user._id);

  res.status(201).json({ success: true, message: sanitizedMessage });
});

// @desc  Get all messages in a chat
// @route GET /api/messages/:chatId
// @access Private
const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const chat = await Chat.findById(chatId);
  if (!chat) { res.status(404); throw new Error('Chat not found'); }
  if (!chat.users.includes(req.user._id)) { res.status(403); throw new Error('Not a member of this chat'); }

  const messages = await populateMessage(
    Message.find({ 
      chat: chatId, 
      deletedForEveryone: false,
      deletedBy: { $ne: req.user._id } 
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
  );

  // Mark as read
  await Message.updateMany(
    { chat: chatId, readBy: { $ne: req.user._id }, sender: { $ne: req.user._id } },
    { $push: { readBy: req.user._id } }
  );

  const sanitizedMessages = messages.reverse().map(msg => {
    const m = msg.toObject();
    if (m.sender) {
      m.sender = sanitizeUser(m.sender, req.user._id);
    }
    if (m.chat && m.chat.users) {
      m.chat.users = m.chat.users.map(u => sanitizeUser(u, req.user._id));
    }
    return m;
  });

  const finalMessages = await sanitizeMessagesReadReceipts(sanitizedMessages, req.user._id);

  res.status(200).json({ success: true, messages: finalMessages, page: parseInt(page) });
});

// @desc  Mark messages as read
// @route PUT /api/messages/:chatId/read
// @access Private
const markAsRead = asyncHandler(async (req, res) => {
  await Message.updateMany(
    { chat: req.params.chatId, readBy: { $ne: req.user._id }, sender: { $ne: req.user._id } },
    { $push: { readBy: req.user._id } }
  );
  const io = req.app.get('io');
  io.to(req.params.chatId).emit('messages_read', { chatId: req.params.chatId, userId: req.user._id });
  res.status(200).json({ success: true });
});

// @desc  Delete message
// @route DELETE /api/messages/:id
// @access Private
const deleteMessage = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const message = await Message.findById(req.params.id);
  if (!message) { res.status(404); throw new Error('Message not found'); }

  if (type === 'everyone') {
    let canDelete = message.sender.toString() === req.user._id.toString();

    // Group role hierarchy check
    if (!canDelete) {
      const chat = await Chat.findById(message.chat);
      if (chat && chat.isGroupChat) {
        const isReqOwner = chat.groupAdmin.toString() === req.user._id.toString();
        const isReqAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
        const isSenderOwner = chat.groupAdmin.toString() === message.sender.toString();
        // Owner can delete everything. Admin can delete everything except owner's.
        if (isReqOwner) canDelete = true;
        else if (isReqAdmin && !isSenderOwner) canDelete = true;
      }
    }

    if (!canDelete) {
      res.status(403); throw new Error('Not authorized to delete this message for everyone');
    }
    message.deletedForEveryone = true;
    message.content = '';
    message.mediaUrl = '';
    if (message.mediaPublicId) {
      await deleteFromCloudinary(message.mediaPublicId, message.mediaType === 'image' ? 'image' : 'video');
    }
    await message.save();

    const io = req.app.get('io');
    io.to(message.chat.toString()).emit('message_deleted', { messageId: message._id, chatId: message.chat, forEveryone: true });

    res.status(200).json({ success: true, message: 'Message deleted for everyone' });
  } else {
    // Delete for me
    if (!message.deletedBy.includes(req.user._id)) {
      message.deletedBy.push(req.user._id);
      await message.save();
    }
    res.status(200).json({ success: true, message: 'Message deleted for me' });
  }
});

// @desc  Add/toggle reaction on a message
// @route POST /api/messages/:id/react
// @access Private
const reactToMessage = asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  const message = await Message.findById(req.params.id);
  if (!message) { res.status(404); throw new Error('Message not found'); }

  const existingIndex = message.reactions.findIndex(
    r => r.user.toString() === req.user._id.toString()
  );

  if (existingIndex !== -1) {
    if (message.reactions[existingIndex].emoji === emoji) {
      // Remove reaction (toggle off)
      message.reactions.splice(existingIndex, 1);
    } else {
      // Change reaction
      message.reactions[existingIndex].emoji = emoji;
    }
  } else {
    message.reactions.push({ user: req.user._id, emoji });
  }

  await message.save();
  const updated = await populateMessage(Message.findById(message._id));

  const io = req.app.get('io');
  io.to(message.chat.toString()).emit('reaction_updated', { messageId: message._id, reactions: updated.reactions, chatId: message.chat });

  res.status(200).json({ success: true, reactions: updated.reactions });
});

// @desc  Forward a message
// @route POST /api/messages/:id/forward
// @access Private
const forwardMessage = asyncHandler(async (req, res) => {
  const { chatIds } = req.body;
  const original = await Message.findById(req.params.id);
  if (!original) { res.status(404); throw new Error('Message not found'); }

  const forwarded = await Promise.all(
    chatIds.map(chatId =>
      Message.create({
        sender: req.user._id,
        chat: chatId,
        content: original.content,
        mediaUrl: original.mediaUrl,
        mediaType: original.mediaType,
        messageType: original.messageType,
        isForwarded: true,
        forwardedFrom: original.sender,
      })
    )
  );

  const io = req.app.get('io');
  for (const msg of forwarded) {
    const populated = await populateMessage(Message.findById(msg._id));
    const chat = await Chat.findById(msg.chat);
    if (chat && io) {
      chat.users.forEach((userId) => {
        io.to(userId.toString()).emit('new_message', populated);
      });
    }
    await Chat.findByIdAndUpdate(msg.chat, { latestMessage: msg._id });
  }

  res.status(201).json({ success: true, message: 'Message forwarded' });
});

// @desc  Save message to saved messages
// @route POST /api/messages/:id/save
// @access Private
const saveMessage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const isSaved = user.savedMessages.includes(req.params.id);
  if (isSaved) {
    user.savedMessages = user.savedMessages.filter(m => m.toString() !== req.params.id);
  } else {
    user.savedMessages.push(req.params.id);
  }
  await user.save();
  res.status(200).json({ success: true, isSaved: !isSaved });
});

// @desc  Get saved messages
// @route GET /api/messages/saved
// @access Private
const getSavedMessages = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'savedMessages',
    populate: { path: 'sender', select: 'username displayName profilePicture' },
  });
  res.status(200).json({ success: true, messages: user.savedMessages });
});

// @desc  Destruct a disappearing media message
// @route POST /api/messages/:id/destruct
// @access Private
const destructMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) { res.status(404); throw new Error('Message not found'); }

  const chat = await Chat.findById(message.chat);
  if (!chat || !chat.users.includes(req.user._id)) {
    res.status(403); throw new Error('Not authorized');
  }

  // Delete from Cloudinary first while we still have publicId and mediaType
  if (message.mediaPublicId) {
    try {
      await deleteFromCloudinary(message.mediaPublicId, message.mediaType === 'image' ? 'image' : 'video');
    } catch (_) {}
  }

  // Clear media properties and mark expired
  message.deletedForEveryone = true;
  message.content = 'Media expired';
  message.mediaUrl = '';
  message.mediaType = '';
  message.mediaPublicId = '';
  message.messageType = 'text';

  await message.save();

  const io = req.app.get('io');
  if (io) {
    io.to(message.chat.toString()).emit('message_deleted', { 
      messageId: message._id, 
      chatId: message.chat, 
      forEveryone: true 
    });
  }

  res.status(200).json({ success: true, message: 'Media message self-destructed successfully' });
});

module.exports = {
  sendMessage, getMessages, markAsRead, deleteMessage,
  reactToMessage, forwardMessage, saveMessage, getSavedMessages,
  destructMessage,
};
