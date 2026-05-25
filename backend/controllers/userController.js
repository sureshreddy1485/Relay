const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { sanitizeUser } = require('../utils/privacyHelper');

// @desc  Search users by username
// @route GET /api/users/search?q=username
// @access Private
const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3) return res.status(200).json({ success: true, users: [] });

  // Exact username match only — prevents finding users with partial queries
  const users = await User.find({
    username: { $regex: `^${q.trim()}$`, $options: 'i' }, // exact, case-insensitive
    _id: { $ne: req.user._id },
    blockedUsers: { $nin: [req.user._id] },
  })
    .select('username displayName profilePicture bio isOnline lastSeen privacy friends createdAt')
    .limit(5);

  const sanitizedUsers = users.map(u => sanitizeUser(u, req.user._id));
  res.status(200).json({ success: true, users: sanitizedUsers });
});

// @desc  Get user profile by username
// @route GET /api/users/:username
// @access Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .select('username displayName profilePicture bio isOnline lastSeen friends privacy createdAt');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.status(200).json({ success: true, user: sanitizeUser(user, req.user._id) });
});

// @desc  Update own profile
// @route PUT /api/users/profile
// @access Private
const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, bio, theme, privacy } = req.body;
  const user = await User.findById(req.user._id);

  if (displayName !== undefined) user.displayName = displayName;
  if (bio !== undefined) user.bio = bio;
  if (theme !== undefined) user.theme = theme;
  if (privacy !== undefined) user.privacy = { ...user.privacy, ...privacy };

  if (req.body.removeProfilePicture === 'true' || req.body.removeProfilePicture === true) {
    if (user.profilePicture) await deleteFromCloudinary(user.profilePicture);
    user.profilePicture = "";
  }
  if (req.body.removeCoverPhoto === 'true' || req.body.removeCoverPhoto === true) {
    if (user.coverPhoto) await deleteFromCloudinary(user.coverPhoto);
    user.coverPhoto = "";
  }

  // multer .fields() puts files in req.files
  const files = req.files || {};

  if (files.profilePicture?.[0]) {
    try {
      const result = await uploadToCloudinary(files.profilePicture[0].buffer, 'profiles', 'image');
      if (user.profilePicture) await deleteFromCloudinary(user.profilePicture);
      user.profilePicture = result.secure_url;
    } catch (cloudinaryErr) {
      console.error('Profile Picture Cloudinary Upload Failed:', cloudinaryErr);
      res.status(500);
      throw new Error(`Profile Picture Upload Failed: ${cloudinaryErr.message || cloudinaryErr}`);
    }
  }

  if (files.coverPhoto?.[0]) {
    try {
      const result = await uploadToCloudinary(files.coverPhoto[0].buffer, 'covers', 'image');
      if (user.coverPhoto) await deleteFromCloudinary(user.coverPhoto);
      user.coverPhoto = result.secure_url;
    } catch (cloudinaryErr) {
      console.error('Cover Photo Cloudinary Upload Failed:', cloudinaryErr);
      res.status(500);
      throw new Error(`Cover Photo Upload Failed: ${cloudinaryErr.message || cloudinaryErr}`);
    }
  }

  const updated = await user.save();
  res.status(200).json({ success: true, user: updated });
});

// @desc  Send friend request
// @route POST /api/users/:id/friend-request
// @access Private
const sendFriendRequest = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) { res.status(404); throw new Error('User not found'); }
  if (targetUser._id.toString() === req.user._id.toString()) {
    res.status(400); throw new Error('Cannot send request to yourself');
  }
  if (targetUser.friends.includes(req.user._id)) {
    res.status(400); throw new Error('Already friends');
  }
  if (targetUser.friendRequests.includes(req.user._id)) {
    res.status(400); throw new Error('Request already sent');
  }

  if (targetUser.username === 'mica_bot' || targetUser.privacy?.autoAcceptFriendRequests) {
    if (!targetUser.friends.includes(req.user._id)) targetUser.friends.push(req.user._id);
    await targetUser.save();
    
    const sender = await User.findById(req.user._id);
    if (!sender.friends.includes(targetUser._id)) sender.friends.push(targetUser._id);
    await sender.save();
    
    // Create the chat
    let chat = await Chat.findOne({
      isGroupChat: false,
      isChannel: false,
      $and: [
        { users: { $elemMatch: { $eq: targetUser._id } } },
        { users: { $elemMatch: { $eq: sender._id } } },
      ],
    });

    if (!chat) {
      chat = await Chat.create({ users: [targetUser._id, sender._id], isGroupChat: false });
    }

    // Notify the sender
    const io = req.app.get('io');
    if (io) {
      const fullChat = await Chat.findById(chat._id)
        .populate('users', '-password -securityKey')
        .populate({
          path: 'latestMessage',
          populate: { path: 'sender', select: 'username displayName profilePicture' },
        });

      io.to(sender._id.toString()).emit('friend_request_accepted', {
        acceptedBy: {
          _id: targetUser._id,
          username: targetUser.username,
          displayName: targetUser.displayName,
          profilePicture: targetUser.profilePicture,
        },
        chat: fullChat,
      });
    }

    return res.status(200).json({ success: true, message: 'Friend request auto-accepted!' });
  }

  targetUser.friendRequests.push(req.user._id);
  await targetUser.save();

  const sender = await User.findById(req.user._id);
  sender.sentRequests.push(targetUser._id);
  await sender.save();

  // Realtime notification
  const io = req.app.get('io');
  if (io) {
    io.to(targetUser._id.toString()).emit('friend_request_received', {
      _id: sender._id,
      username: sender.username,
      displayName: sender.displayName,
      profilePicture: sender.profilePicture,
    });
  }

  res.status(200).json({ success: true, message: 'Friend request sent' });
});

// @desc  Accept friend request
// @route POST /api/users/:id/accept-request
// @access Private
const acceptFriendRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const requester = await User.findById(req.params.id);

  if (!requester) { res.status(404); throw new Error('User not found'); }
  if (!user.friendRequests.includes(requester._id)) {
    res.status(400); throw new Error('No pending request from this user');
  }

  user.friendRequests = user.friendRequests.filter(id => id.toString() !== requester._id.toString());
  if (!user.friends.includes(requester._id)) {
    user.friends.push(requester._id);
  }
  await user.save();

  requester.sentRequests = requester.sentRequests.filter(id => id.toString() !== user._id.toString());
  if (!requester.friends.includes(user._id)) {
    requester.friends.push(user._id);
  }
  await requester.save();

  // Automatically create a 1-to-1 chat upon friendship acceptance
  let chat = await Chat.findOne({
    isGroupChat: false,
    isChannel: false,
    $and: [
      { users: { $elemMatch: { $eq: user._id } } },
      { users: { $elemMatch: { $eq: requester._id } } },
    ],
  });

  if (!chat) {
    chat = await Chat.create({ users: [user._id, requester._id], isGroupChat: false });
  }

  const fullChat = await Chat.findById(chat._id)
    .populate('users', '-password -securityKey')
    .populate({
      path: 'latestMessage',
      populate: { path: 'sender', select: 'username displayName profilePicture' },
    });

  // Realtime notification
  const io = req.app.get('io');
  if (io) {
    // Notify the requester that the request was accepted and send the chat
    io.to(requester._id.toString()).emit('friend_request_accepted', {
      acceptedBy: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
      },
      chat: fullChat,
    });
  }

  res.status(200).json({ success: true, message: 'Friend request accepted', chat: fullChat });
});

// @desc  Decline / cancel friend request
// @route POST /api/users/:id/decline-request
// @access Private
const declineFriendRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.friendRequests = user.friendRequests.filter(id => id.toString() !== req.params.id);
  await user.save();

  const requester = await User.findById(req.params.id);
  if (requester) {
    requester.sentRequests = requester.sentRequests.filter(id => id.toString() !== req.user._id.toString());
    await requester.save();
  }

  res.status(200).json({ success: true, message: 'Request declined' });
});

// @desc  Block a user
// @route POST /api/users/:id/block
// @access Private
const blockUser = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) {
    res.status(404);
    throw new Error('User to block not found');
  }

  const user = await User.findById(req.user._id);
  const isAlreadyBlocked = (user.blockedUsers || []).some(id => id.toString() === req.params.id);
  if (isAlreadyBlocked) {
    res.status(400); throw new Error('User already blocked');
  }

  user.blockedUsers.push(req.params.id);
  user.friends = user.friends.filter(id => id.toString() !== req.params.id);
  await user.save();

  // Note: We intentionally do NOT dismantle the 1-to-1 chat when blocking, 
  // to mimic WhatsApp behavior where the blocked user can still see the chat
  // and send messages (which will simply never reach the blocker).

  res.status(200).json({ success: true, message: 'User blocked' });
});

// @desc  Unblock a user
// @route POST /api/users/:id/unblock
// @access Private
const unblockUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== req.params.id);
  await user.save();
  res.status(200).json({ success: true, message: 'User unblocked' });
});

// @desc  Get friend requests
// @route GET /api/users/friend-requests
// @access Private
const getFriendRequests = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('friendRequests', 'username displayName profilePicture bio privacy friends');
  const sanitizedRequests = (user.friendRequests || []).map(r => sanitizeUser(r, req.user._id));
  res.status(200).json({ success: true, requests: sanitizedRequests });
});

// @desc  Update camera active status
// @route PUT /api/users/camera-status
// @access Private
const updateCameraStatus = asyncHandler(async (req, res) => {
  const { isCameraActive } = req.body;
  await User.findByIdAndUpdate(req.user._id, { isCameraActive });
  res.status(200).json({ success: true });
});

// @desc  Deactivate account
// @route PUT /api/users/profile/deactivate
// @access Private
const deactivateAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.isOnline = false;
  await user.save();
  res.status(200).json({ success: true, message: 'Account deactivated' });
});

// @desc  Delete account permanently
// @route DELETE /api/users/profile/delete
// @access Private
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const Message = require('../models/Message');
  const Story = require('../models/Story');

  // 1. Delete profile picture & cover photo from Cloudinary
  const userObj = await User.findById(userId);
  if (userObj) {
    if (userObj.profilePicture) await deleteFromCloudinary(userObj.profilePicture).catch(() => {});
    if (userObj.coverPhoto)     await deleteFromCloudinary(userObj.coverPhoto).catch(() => {});
  }

  // 2. Delete all story media from Cloudinary, then the DB docs
  const userStories = await Story.find({ user: userId }).select('mediaPublicId mediaUrl mediaType');
  await Promise.allSettled(
    userStories.map(s => {
      const ref = s.mediaPublicId || s.mediaUrl;
      return ref ? deleteFromCloudinary(ref) : Promise.resolve();
    })
  );
  await Story.deleteMany({ user: userId });

  // 3. Delete all message media sent by this user from Cloudinary
  const userMessages = await Message.find({
    sender: userId,
    $or: [{ mediaPublicId: { $exists: true, $ne: '' } }, { mediaUrl: { $exists: true, $ne: '' } }],
  }).select('mediaPublicId mediaUrl');
  await Promise.allSettled(
    userMessages.map(m => {
      const ref = m.mediaPublicId || m.mediaUrl;
      return ref ? deleteFromCloudinary(ref) : Promise.resolve();
    })
  );
  await Message.deleteMany({ sender: userId });

  // 4. Remove user from other users' friends/blocked/requests lists
  await User.updateMany(
    {},
    { $pull: { friends: userId, blockedUsers: userId, friendRequests: userId } }
  );

  // 5. Handle Chats (DMs and Groups)
  const userChats = await Chat.find({ users: userId });
  for (const chat of userChats) {
    if (!chat.isGroupChat) {
      // DM: delete all remaining messages (from the other user) + their media + the chat
      const dmMessages = await Message.find({
        chat: chat._id,
        $or: [{ mediaPublicId: { $exists: true, $ne: '' } }, { mediaUrl: { $exists: true, $ne: '' } }],
      }).select('mediaPublicId mediaUrl');
      await Promise.allSettled(
        dmMessages.map(m => {
          const ref = m.mediaPublicId || m.mediaUrl;
          return ref ? deleteFromCloudinary(ref) : Promise.resolve();
        })
      );
      await Chat.findByIdAndDelete(chat._id);
      await Message.deleteMany({ chat: chat._id });
    } else {
      // Group: just remove this user
      chat.users = chat.users.filter(uId => uId.toString() !== userId.toString());
      chat.admins = chat.admins.filter(aId => aId.toString() !== userId.toString());

      if (chat.users.length === 0) {
        // Last member — delete group pic + all messages + chat
        if (chat.groupPicture) await deleteFromCloudinary(chat.groupPicture).catch(() => {});
        const grpMessages = await Message.find({
          chat: chat._id,
          $or: [{ mediaPublicId: { $exists: true, $ne: '' } }, { mediaUrl: { $exists: true, $ne: '' } }],
        }).select('mediaPublicId mediaUrl');
        await Promise.allSettled(
          grpMessages.map(m => {
            const ref = m.mediaPublicId || m.mediaUrl;
            return ref ? deleteFromCloudinary(ref) : Promise.resolve();
          })
        );
        await Chat.findByIdAndDelete(chat._id);
        await Message.deleteMany({ chat: chat._id });
      } else {
        // Transfer ownership if this user was the group owner
        if (chat.groupAdmin && chat.groupAdmin.toString() === userId.toString()) {
          chat.groupAdmin = chat.users[0];
          if (!chat.admins.includes(chat.users[0])) chat.admins.push(chat.users[0]);
        }
        await chat.save();
      }
    }
  }

  // 6. Delete the User profile document itself
  await User.findByIdAndDelete(userId);

  res.status(200).json({ success: true, message: 'Account and all related data permanently deleted' });
});


// @desc  Remove a friend
// @route POST /api/users/:id/remove-friend
// @access Private
const removeFriend = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const friend = await User.findById(req.params.id);

  if (!friend) { res.status(404); throw new Error('User not found'); }

  user.friends = user.friends.filter(id => id.toString() !== friend._id.toString());
  await user.save();

  friend.friends = friend.friends.filter(id => id.toString() !== req.user._id.toString());
  await friend.save();

  res.status(200).json({ success: true, message: 'Friend removed' });
});

// @desc  Get blocked users list
// @route GET /api/users/blocked
// @access Private
const getBlockedUsers = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('blockedUsers', 'username displayName profilePicture bio');
  const validBlocked = (user.blockedUsers || []).filter(u => u != null);
  res.status(200).json({ success: true, blockedUsers: validBlocked });
});

// @desc  Get user friends
// @route GET /api/users/friends
// @access Private
const getFriends = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('friends', 'username displayName profilePicture bio isOnline lastSeen privacy friends');
  const sanitizedFriends = (user.friends || []).map(f => sanitizeUser(f, req.user._id));
  res.status(200).json({ success: true, friends: sanitizedFriends });
});

// @desc  Update push token for Expo Notifications
// @route PUT /api/users/push-token
// @access Private
const updatePushToken = asyncHandler(async (req, res) => {
  const { pushToken, fcmToken } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  if (pushToken !== undefined) user.pushToken = pushToken || '';
  if (fcmToken !== undefined) user.fcmToken = fcmToken || '';
  await user.save();
  res.status(200).json({ success: true, message: 'Push tokens updated' });
});

// @desc  Toggle DM permission for a specific group
// @route PUT /api/users/privacy/dm-group/:id
// @access Private
const toggleGroupDMPrivacy = asyncHandler(async (req, res) => {
  const { allowed } = req.body;
  const groupId = req.params.id;
  const user = await User.findById(req.user._id);
  
  if (!user) { res.status(404); throw new Error('User not found'); }
  
  if (!user.privacy) user.privacy = {};
  if (!user.privacy.allowedDMGroups) user.privacy.allowedDMGroups = [];
  if (!user.privacy.disallowedDMGroups) user.privacy.disallowedDMGroups = [];
  
  if (allowed) {
    // User ALLOWS DMs from this group
    if (!user.privacy.allowedDMGroups.includes(groupId)) {
      user.privacy.allowedDMGroups.push(groupId);
    }
    user.privacy.disallowedDMGroups = user.privacy.disallowedDMGroups.filter(id => id.toString() !== groupId.toString());
  } else {
    // User DISALLOWS DMs from this group
    if (!user.privacy.disallowedDMGroups.includes(groupId)) {
      user.privacy.disallowedDMGroups.push(groupId);
    }
    user.privacy.allowedDMGroups = user.privacy.allowedDMGroups.filter(id => id.toString() !== groupId.toString());
  }
  
  const updated = await user.save();

  // Real-time update for group members
  const io = req.app.get('io');
  if (io) {
    const Chat = require('../models/Chat');
    const fullChat = await Chat.findById(groupId)
      .populate('users', '-password -securityKey')
      .populate('groupAdmin admins', 'username displayName profilePicture');
    if (fullChat) {
      fullChat.users.forEach((u) => {
        io.to((u._id || u).toString()).emit('chat_updated', fullChat);
      });
    }
  }

  res.status(200).json({ success: true, privacy: updated.privacy });
});

module.exports = {
  searchUsers, getUserProfile, updateProfile, sendFriendRequest,
  acceptFriendRequest, declineFriendRequest, blockUser, unblockUser,
  getFriendRequests, updateCameraStatus, deactivateAccount, deleteAccount,
  removeFriend, getBlockedUsers, getFriends, updatePushToken, toggleGroupDMPrivacy,
};
