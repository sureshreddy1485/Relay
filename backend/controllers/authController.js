const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const BotManager = require('../utils/BotManager');
const { getMicaBotId, getRelayBotId } = require('../utils/botHelper');
const { generateRecoveryKeys, generateRecoveryKey, hashRecoveryKeys, hashRecoveryKey, verifyRecoveryCode, verifyRecoveryKey } = require('../utils/recoveryKey');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const crypto = require('crypto');

// Generate JWT
const generateToken = (id, sessionId) =>
  jwt.sign({ id, sessionId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '365d' });

// @desc  Register user
// @route POST /api/auth/signup
// @access Public
const signup = asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const usernameRegex = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
  if (!usernameRegex.test(username)) {
    res.status(400);
    throw new Error('Username must start with a letter or underscore and contain only letters, numbers, underscores, and dots (no spaces)');
  }
  
  if (username.length < 6) {
    res.status(400);
    throw new Error('Username must be at least 6 characters long');
  }

  const usernameExists = await User.findOne({ username: username.toLowerCase() });
  if (usernameExists) {
    res.status(400);
    throw new Error('Username is already taken');
  }

  const emailExists = await User.findOne({ email: email.toLowerCase() });
  if (emailExists) {
    res.status(400);
    throw new Error('Email is already registered');
  }

  const plainRecoveryKeys = generateRecoveryKeys(9);
  const hashedRecoveryKeys = await hashRecoveryKeys(plainRecoveryKeys);

  const sessionId = crypto.randomBytes(16).toString('hex');
  const deviceName = req.body.deviceName || 'Unknown Device';
  let profilePicture = req.body.profilePicture || '';
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, 'profiles', 'image');
      profilePicture = result.secure_url;
    } catch (uploadErr) {
      console.error('Failed to upload signup profile picture:', uploadErr);
    }
  }

  const user = await User.create({
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    password,
    recoveryKeys: hashedRecoveryKeys,
    recoveryKey: hashedRecoveryKeys[0]?.code || '',
    displayName: displayName || username,
    profilePicture,
    devices: [{ deviceId: sessionId, deviceName, lastActive: Date.now() }]
  });

  // Send automatic Welcome Message from Relay Bot
  let relayId = getRelayBotId();
  if (relayId) {
    try {
      let chat = await Chat.create({
        chatName: 'Relay System',
        isGroupChat: false,
        users: [user._id, relayId],
        disappearAfter: 86400,
      });

      const welcomeContent = `🚀 **WELCOME TO RELAY** 🚀

We are thrilled to officially welcome you to Relay — the lightning-fast, ultra-secure messaging platform! Here is a quick guide to get you started:

💬 **Instant Messaging & Media**
Chat with your friends effortlessly. Send texts, voice notes, photos, and files.

👻 **Disappearing Messages**
Privacy is our priority. Send 'View Once' media or enable disappearing messages in chat settings.

🤖 **Meet Mica & Mars (AI Bots)**
Relay features two native AI companions! Mica (@mica_bot) is helpful and friendly. Mars (@mars_bot) is sarcastic and witty. Ask them anything or play games in groups!

🎮 **Play Group Games**
Type 'help games' in any group chat to play Riddle, Scramble, Guess the Word, Emoji Guess, Mafia, Double Agent, Breach, and Suspect!

🛡️ **Account Security**
Be sure to save your 16-character Recovery Key as a .txt or .pdf file. If you ever forget your password, your Recovery Key will restore your account!

Enjoy chatting on Relay! ✨`;

      const io = req.app.get('io');
      await BotManager.sendCustomMessage(
        chat,
        io,
        relayId,
        welcomeContent,
        'text'
      );
    } catch (welcomeErr) {
      console.error('Failed to send welcome message to new user:', welcomeErr);
    }
  }

  res.status(201).json({
    success: true,
    token: generateToken(user._id, sessionId),
    recoveryKeys: plainRecoveryKeys,
    recoveryKey: plainRecoveryKeys[0],
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
      bio: user.bio,
      isOnline: user.isOnline,
    },
  });
});

// @desc  Login user (email or username + password)
// @route POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body; // identifier = email OR username

  if (!identifier || !password) {
    res.status(400);
    throw new Error('Please provide identifier and password');
  }

  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { username: identifier.toLowerCase() };

  const user = await User.findOne(query).select('+password +securityKey +recoveryKey');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  let requiresMigration = false;
  if (!user.recoveryKey && user.securityKey) {
    requiresMigration = true;
  }

  const sessionId = req.body.deviceId || crypto.randomBytes(16).toString('hex');
  const deviceName = req.body.deviceName || 'Unknown Device';

  // Update online status
  user.isOnline = true;
  user.lastSeen = new Date();
  if (!user.devices) user.devices = [];
  
  // Find if this exact deviceId already exists
  let existingDeviceIndex = user.devices.findIndex(d => d.deviceId === sessionId);
  
  // If not found by ID, look for the same deviceName (e.g. user reinstalled the app on the same phone)
  if (existingDeviceIndex === -1 && deviceName !== 'Unknown Device') {
    existingDeviceIndex = user.devices.findIndex(d => d.deviceName === deviceName);
  }

  if (existingDeviceIndex !== -1) {
    // Replace the old session with the new one
    user.devices[existingDeviceIndex].deviceId = sessionId;
    user.devices[existingDeviceIndex].lastActive = Date.now();
    user.devices[existingDeviceIndex].deviceName = deviceName;
  } else {
    // Limit to 3 active devices
    if (user.devices.length >= 3) {
      user.devices.sort((a, b) => new Date(a.lastActive) - new Date(b.lastActive));
      while (user.devices.length >= 3) {
        user.devices.shift();
      }
    }
    user.devices.push({ deviceId: sessionId, deviceName, lastActive: Date.now() });
  }

  await user.save({ validateBeforeSave: false });

  // Send a security notification from Relay (Hardcoded text, zero Groq API usage)
  let relayId = getRelayBotId();
  if (relayId) {
    try {
      let chat = await Chat.findOne({
        isGroupChat: false,
        $and: [
          { users: { $elemMatch: { $eq: user._id } } },
          { users: { $elemMatch: { $eq: relayId } } }
        ]
      });

      if (!chat) {
        chat = await Chat.create({
          chatName: "Relay Security",
          isGroupChat: false,
          users: [user._id, relayId],
          disappearAfter: 86400,
        });
      }

      const io = req.app.get('io');
      const dateString = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
      const msgContent = `🔒 **Security Alert: New Login**\n\nYour account was just accessed from a new device.\n\n📱 **Device:** ${deviceName}\n🕒 **Time:** ${dateString}\n\n⚠️ **Note:** For security, only 3 active devices are allowed at once. Older sessions will be automatically terminated.\n\nIf this was you, simply ignore this message.`;

      await BotManager.sendCustomMessage(
        chat,
        io,
        relayId,
        msgContent,
        'text'
      );
    } catch (err) {
      console.error('Failed to send login notification:', err);
    }
  }

  res.status(200).json({
    success: true,
    token: generateToken(user._id, sessionId),
    requiresMigration,
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
      bio: user.bio,
      isOnline: true,
      theme: user.theme,
    },
  });
});

// @desc  Forgot password — verify security key and reset password
// @route POST /api/auth/forgot-password
// @access Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier, recoveryKey, newPassword } = req.body;

  if (!identifier || !recoveryKey || !newPassword) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { username: identifier.toLowerCase() };

  const user = await User.findOne(query).select('+recoveryKey +recoveryKeys +lastPasswordChange');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  if (user.lastPasswordChange && (Date.now() - new Date(user.lastPasswordChange).getTime() < TWO_WEEKS_MS)) {
    res.status(403);
    throw new Error('Password can only be changed once every 14 days.');
  }

  const result = await verifyRecoveryCode(recoveryKey, user);
  if (!result.valid) {
    res.status(401);
    throw new Error('Invalid or already used recovery key');
  }

  if (result.isArray && typeof result.keyIndex === 'number') {
    user.recoveryKeys[result.keyIndex].used = true;
  }

  user.password = newPassword;
  user.lastPasswordChange = Date.now();
  if (req.user && req.user.currentSessionId) {
    user.devices = (user.devices || []).filter(d => d.deviceId === req.user.currentSessionId);
  } else {
    user.devices = [];
  }
  await user.save();

  res.status(200).json({ success: true, message: 'Password reset successfully' });
});

// @desc  Change password (authenticated)
// @route PUT /api/auth/change-password
// @access Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const user = await User.findById(req.user._id).select('+password +lastPasswordChange');

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  if (user.lastPasswordChange && (Date.now() - new Date(user.lastPasswordChange).getTime() < TWO_WEEKS_MS)) {
    res.status(403);
    throw new Error('Password can only be changed once every 14 days.');
  }

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  user.password = newPassword;
  user.lastPasswordChange = Date.now();
  // Clear all devices except the current one
  if (req.user && req.user.currentSessionId) {
    user.devices = user.devices.filter(d => d.deviceId === req.user.currentSessionId);
  } else {
    user.devices = [];
  }
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed successfully' });
});

// @desc  Get current user profile
// @route GET /api/auth/me
// @access Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('friends', 'username displayName profilePicture isOnline lastSeen')
    .populate('pinnedChats')
    .populate('archivedChats');

  res.status(200).json({ success: true, user });
});

// @desc  Logout (set offline)
// @route POST /api/auth/logout
// @access Private
const logout = asyncHandler(async (req, res) => {
  const sessionId = req.user.currentSessionId;
  const user = await User.findById(req.user._id);
  if (user) {
    user.devices = user.devices.filter(d => d.deviceId !== sessionId);
    if (user.devices.length === 0) {
      user.isOnline = false;
      user.lastSeen = new Date();
    }
    await user.save();
  }
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// @desc  Get active devices
// @route GET /api/auth/devices
// @access Private
const getDevices = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('devices');
  const devicesWithCurrent = user.devices.map(d => ({
    ...d.toObject(),
    isCurrent: d.deviceId === req.user.currentSessionId
  }));
  res.status(200).json({ success: true, devices: devicesWithCurrent });
});

// @desc  Logout a specific device
// @route DELETE /api/auth/devices/:deviceId
// @access Private
const logoutDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { password } = req.body;

  if (!password) {
    res.status(400);
    throw new Error('Password is required to terminate a session');
  }

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid password');
  }

  user.devices = user.devices.filter(d => d.deviceId !== deviceId);
  await user.save();
  res.status(200).json({ success: true, message: 'Device logged out' });
});

// @desc  Generate new recovery key
// @route POST /api/auth/generate-recovery-key
// @access Private
const generateNewRecoveryKey = asyncHandler(async (req, res) => {
  const { currentPassword } = req.body;

  if (!currentPassword) {
    res.status(400);
    throw new Error('Please provide current password');
  }

  const user = await User.findById(req.user._id).select('+password +securityKey');
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  const plainRecoveryKeys = generateRecoveryKeys(9);
  const hashedRecoveryKeys = await hashRecoveryKeys(plainRecoveryKeys);

  user.recoveryKeys = hashedRecoveryKeys;
  user.recoveryKey = hashedRecoveryKeys[0]?.code || '';
  
  // Remove old security key permanently
  user.securityKey = undefined;
  
  await user.save();

  res.status(200).json({
    success: true,
    recoveryKeys: plainRecoveryKeys,
    recoveryKey: plainRecoveryKeys[0],
    message: 'New 9 recovery keys generated successfully',
  });
});

module.exports = { signup, login, forgotPassword, changePassword, getMe, logout, getDevices, logoutDevice, generateNewRecoveryKey };
