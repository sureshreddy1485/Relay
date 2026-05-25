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

  // Determine if there is a block active
  let blockActive = false;
  let blockedBy = [];
  if (!chat.isGroupChat) {
    const otherUserId = chat.users.find(u => u.toString() !== req.user._id.toString());
    if (otherUserId) {
      const otherUser = await User.findById(otherUserId).select('blockedUsers');
      const currentUser = await User.findById(req.user._id).select('blockedUsers');
      
      const isBlockedByOther = otherUser?.blockedUsers?.some(id => id.toString() === req.user._id.toString());
      if (isBlockedByOther) {
        blockActive = true;
        blockedBy.push(otherUserId.toString());
      }
      
      const isBlockedByCurrent = currentUser?.blockedUsers?.some(id => id.toString() === otherUserId.toString());
      if (isBlockedByCurrent) {
        blockActive = true;
        blockedBy.push(req.user._id.toString());
      }
      
      if (!blockActive) {
        const fullOtherUser = await User.findById(otherUserId).select('privacy friends');
        const fullCurrentUser = await User.findById(req.user._id).select('privacy');
        const areFriends = fullOtherUser?.friends?.some(f => f.toString() === req.user._id.toString());
        if (!areFriends) {
          const sharedGroups = await Chat.find({
            isGroupChat: true,
            users: { $all: [req.user._id, otherUserId] },
          }).select('allowDirectMessages _id');
          
          const targetAllowsGlobal = fullOtherUser?.privacy?.allowDMFromGroups !== false;
          const initiatorAllowsGlobal = fullCurrentUser?.privacy?.allowDMFromGroups !== false;
          const targetAllowedGroups = fullOtherUser?.privacy?.allowedDMGroups || [];
          const initiatorAllowedGroups = fullCurrentUser?.privacy?.allowedDMGroups || [];
          const targetDisallowedGroups = fullOtherUser?.privacy?.disallowedDMGroups || [];
          const initiatorDisallowedGroups = fullCurrentUser?.privacy?.disallowedDMGroups || [];

          let dmAllowed = false;
          for (const g of sharedGroups) {
            if (g.allowDirectMessages === false) continue;
            
            const tAllows = targetAllowedGroups.some(id => id.toString() === g._id.toString()) || 
                            (targetAllowsGlobal && !targetDisallowedGroups.some(id => id.toString() === g._id.toString()));
                            
            const iAllows = initiatorAllowedGroups.some(id => id.toString() === g._id.toString()) || 
                            (initiatorAllowsGlobal && !initiatorDisallowedGroups.some(id => id.toString() === g._id.toString()));
                            
            if (tAllows && iAllows) {
              dmAllowed = true;
              break;
            }
          }

          if (!dmAllowed) {
            res.status(403); throw new Error('This user does not accept direct messages or you have disabled them');
          }
        }
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

  let initialDeletedBy = [];
  if (blockActive) {
    const otherUserId = chat.users.find(u => u.toString() !== req.user._id.toString());
    if (otherUserId) {
      initialDeletedBy.push(otherUserId);
    }
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
    deletedBy: initialDeletedBy,
    pollData: req.body.pollData ? (typeof req.body.pollData === 'string' ? JSON.parse(req.body.pollData) : req.body.pollData) : undefined,
    storyData: req.body.storyData ? (typeof req.body.storyData === 'string' ? JSON.parse(req.body.storyData) : req.body.storyData) : undefined,
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

  // Let BotEngine process the message (async, doesn't block response)
  const io = req.app.get('io');
  const BotEngine = require('../utils/BotEngine');
  BotEngine.processMessage(message, chat, io);

  // Emit via socket to all participants' personal rooms
  let pushMessages = [];
  let fcmMessages = [];
  
  if (io) {
    chat.users.forEach((userId) => {
      // If block is active, skip sending to the other user
      if (blockActive && userId.toString() !== req.user._id.toString()) return;

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
        if (targetUser) {
          let pushBody = content || `Sent a ${messageType}`;
          if (isEncrypted) pushBody = '🔒 Encrypted Message';
          const title = chat.isGroupChat ? chat.groupName : (req.user.displayName || req.user.username);
          
          let pushSent = false;
          
          // Use FCM Token for Notifee Background Handling (Data-only)
          if (targetUser.fcmToken) {
            fcmMessages.push({
              token: targetUser.fcmToken,
              data: {
                // Must be all strings
                chatId: chat._id.toString(),
                messageId: message._id.toString(),
                title: title,
                body: pushBody,
                sender: JSON.stringify({
                   _id: req.user._id.toString(),
                   username: req.user.username,
                   displayName: req.user.displayName,
                   profilePicture: req.user.profilePicture,
                }),
                chat: JSON.stringify({
                   _id: chat._id.toString(),
                   isGroupChat: chat.isGroupChat || false,
                   chatName: chat.chatName || '',
                   groupPicture: chat.groupPicture || '',
                }),
              }
            });
            pushSent = true;
          } 
          // Fallback to Expo Push Token
          else if (targetUser.pushToken && Expo.isExpoPushToken(targetUser.pushToken)) {
            pushMessages.push({
              to: targetUser.pushToken,
              sound: 'kin_notification_sound.wav',
              channelId: 'messages-v3',
              title,
              body: pushBody,
              data: { chatId: chat._id },
            });
            pushSent = true;
          }
          
          if (pushSent) {
            // Mark as delivered to this user since we are sending a push notification!
            if (!message.deliveredTo) message.deliveredTo = [];
            if (!message.deliveredTo.includes(targetUser._id)) {
              message.deliveredTo.push(targetUser._id);
            }
          }
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
  
  // Send FCM Data-only push notifications asynchronously
  if (fcmMessages.length > 0) {
    (async () => {
      try {
        const admin = require('firebase-admin');
        if (admin.apps.length > 0) {
          const sendPromises = fcmMessages.map(msg => admin.messaging().send(msg));
          await Promise.allSettled(sendPromises);
        }
      } catch (e) {
        console.error('Error sending FCM messages:', e);
      }
    })();
  }
  
  // Save the deliveredTo modifications for offline push notification users
  if (message.isModified && message.isModified('deliveredTo')) {
    await message.save();
  } else {
    // If it's just a populated document, update DB directly
    await Message.findByIdAndUpdate(message._id, { deliveredTo: message.deliveredTo });
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

  const sanitizedMessages = messages.map(msg => {
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

  const user = await User.findById(req.user._id).select('privacy');
  if (user?.privacy?.readReceipts !== 'hide') {
    const io = req.app.get('io');
    io.to(req.params.chatId).emit('messages_read', { chatId: req.params.chatId, userId: req.user._id });
  }

  res.status(200).json({ success: true });
});

// @desc  Mark messages as delivered
// @route PUT /api/messages/:chatId/deliver
// @access Private
const markAsDelivered = asyncHandler(async (req, res) => {
  await Message.updateMany(
    { chat: req.params.chatId, deliveredTo: { $ne: req.user._id }, sender: { $ne: req.user._id } },
    { $push: { deliveredTo: req.user._id } }
  );
  const io = req.app.get('io');
  io.to(req.params.chatId).emit('messages_delivered', { chatId: req.params.chatId, userId: req.user._id });
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
    const isSender = message.sender.toString() === req.user._id.toString();
    let canDelete = isSender;
    let isAdminDeletion = false;

    const diffMins = (Date.now() - new Date(message.createdAt).getTime()) / 60000;

    // Group role hierarchy check
    if (!isSender) {
      const chat = await Chat.findById(message.chat);
      if (chat && chat.isGroupChat) {
        const isReqOwner = chat.groupAdmin.toString() === req.user._id.toString();
        const isReqAdmin = chat.admins.some(a => a.toString() === req.user._id.toString());
        const isSenderOwner = chat.groupAdmin.toString() === message.sender.toString();
        
        if (isReqOwner) { canDelete = true; isAdminDeletion = true; }
        else if (isReqAdmin && !isSenderOwner) { canDelete = true; isAdminDeletion = true; }
      }
    } else {
      // Sender is trying to delete. Check 5 minute rule.
      if (diffMins > 5) {
        const chat = await Chat.findById(message.chat);
        let isReqAdminOrOwner = false;
        if (chat && chat.isGroupChat) {
          isReqAdminOrOwner = (chat.groupAdmin.toString() === req.user._id.toString()) || chat.admins.some(a => a.toString() === req.user._id.toString());
        }
        
        if (!isReqAdminOrOwner) {
          res.status(400); throw new Error('You can only delete messages for everyone within 5 minutes of sending');
        } else {
          isAdminDeletion = true;
        }
      }
    }

    if (!canDelete) {
      res.status(403); throw new Error('Not authorized to delete this message for everyone');
    }

    message.deletedForEveryone = true;
    if (isAdminDeletion) {
      message.content = `Message deleted by admin ${req.user.displayName || req.user.username}`;
    } else {
      message.content = 'Permanently deleted';
    }

    message.mediaUrl = '';
    message.isSelfDestructing = false;
    message.destructAfterSeconds = 0;
    message.expiresAt = null;
    if (message.mediaPublicId) {
      await deleteFromCloudinary(message.mediaPublicId);
    } else if (message.mediaUrl) {
      await deleteFromCloudinary(message.mediaUrl);
    }
    await message.save();

    const io = req.app.get('io');
    io.to(message.chat.toString()).emit('message_deleted', { messageId: message._id, chatId: message.chat, forEveryone: true, newContent: message.content });

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

  // Delete from Cloudinary first — auto-detects type (image/video/raw)
  if (message.mediaPublicId) {
    await deleteFromCloudinary(message.mediaPublicId);
  } else if (message.mediaUrl) {
    await deleteFromCloudinary(message.mediaUrl);
  }

  // Clear media and mark as disappeared in DB
  message.deletedForEveryone = true;
  message.content = 'Message disappeared';
  message.mediaUrl = '';
  message.mediaType = '';
  message.mediaPublicId = '';
  message.messageType = 'text';
  message.isSelfDestructing = false;
  message.destructAfterSeconds = 0;
  message.expiresAt = null;

  await message.save();

  const io = req.app.get('io');
  if (io) {
    // Use a distinct event so clients show "Message disappeared" not "Permanently deleted"
    io.to(message.chat.toString()).emit('message_disappeared', { 
      messageId: message._id, 
      chatId: message.chat,
    });
  }

  res.status(200).json({ success: true, message: 'Media message self-destructed successfully' });
});

// @desc  Edit message
// @route PUT /api/messages/:id/edit
// @access Private
const editMessage = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const message = await Message.findById(req.params.id);
  if (!message) { res.status(404); throw new Error('Message not found'); }
  if (message.sender.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Not authorized to edit this message');
  }
  if (message.deletedForEveryone) {
    res.status(400); throw new Error('Cannot edit deleted message');
  }
  if (message.mediaUrl || message.messageType !== 'text') {
    res.status(400); throw new Error('Cannot edit media messages');
  }
  
  const diff = (Date.now() - new Date(message.createdAt).getTime()) / 60000;
  if (diff > 5) {
    res.status(400); throw new Error('Messages can only be edited within 5 minutes of sending');
  }

  message.content = content;
  message.isEdited = true;
  await message.save();

  const updated = await populateMessage(Message.findById(message._id));
  const io = req.app.get('io');
  if (io) {
    const chat = await Chat.findById(message.chat);
    if (chat) {
      chat.users.forEach((userId) => {
        io.to(userId.toString()).emit('message_edited', { messageId: message._id, content: updated.content, chatId: message.chat });
      });
    }
  }

  res.status(200).json({ success: true, message: updated });
});

// @desc  Vote on a poll message
// @route POST /api/messages/:id/vote
// @access Private
const voteOnPoll = asyncHandler(async (req, res) => {
  const { optionId } = req.body;
  const message = await Message.findById(req.params.id);
  if (!message || message.messageType !== 'poll' || !message.pollData) {
    res.status(404); throw new Error('Poll not found');
  }

  const userId = req.user._id.toString();
  let hasChanged = false;

  // Prevent users from changing or removing their vote once they've voted
  const hasAlreadyVoted = message.pollData.options.some(opt => 
    opt.votes.some(v => v.toString() === userId)
  );

  if (hasAlreadyVoted) {
    res.status(400);
    throw new Error('You have already voted and cannot change your vote.');
  }

  // If not multiple answers, remove user's vote from all other options
  if (!message.pollData.multipleAnswers) {
    message.pollData.options.forEach(opt => {
      const idx = opt.votes.findIndex(v => v.toString() === userId);
      if (idx !== -1 && opt._id.toString() !== optionId) {
        opt.votes.splice(idx, 1);
        hasChanged = true;
      }
    });
  }

  // Toggle vote for the selected option
  const targetOption = message.pollData.options.find(opt => opt._id.toString() === optionId);
  if (targetOption) {
    const idx = targetOption.votes.findIndex(v => v.toString() === userId);
    if (idx !== -1) {
      targetOption.votes.splice(idx, 1); // un-vote
    } else {
      targetOption.votes.push(req.user._id); // vote
    }
    hasChanged = true;
  }

  if (hasChanged) {
    await message.save();
    const updated = await populateMessage(Message.findById(message._id));
    const io = req.app.get('io');
    if (io) {
      const chat = await Chat.findById(message.chat);
      if (chat) {
        chat.users.forEach((uId) => {
          io.to(uId.toString()).emit('poll_voted', { messageId: message._id, pollData: updated.pollData, chatId: message.chat });
        });
      }
    }
    res.status(200).json({ success: true, pollData: updated.pollData });
  } else {
    res.status(200).json({ success: true, pollData: message.pollData });
  }
});

module.exports = {
  sendMessage, getMessages, markAsRead, markAsDelivered, deleteMessage,
  reactToMessage, forwardMessage, saveMessage, getSavedMessages,
  destructMessage, editMessage, voteOnPoll,
};
