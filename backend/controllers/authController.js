const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const BotManager = require('../utils/BotManager');
const { getMicaBotId, getRelayBotId } = require('../utils/botHelper');
const {
  generateRecoverySet,
  verifyAndConsumeCode,
  getRemainingCount,
  canRegenerate,
  getRegenerationAvailableAt,
  getSecurityActionsUsed,
  canPerformSecurityAction,
  getSecurityActionsResetAt,
  SECURITY_ACTION_LIMIT,
  // Legacy compat
  generateRecoveryKeys,
  hashRecoveryKeys,
  verifyRecoveryCode,
} = require('../utils/recoveryKey');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const crypto = require('crypto');

// Generate JWT
const generateToken = (id, sessionId) =>
  jwt.sign({ id, sessionId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '365d' });

// ─── Signup ───────────────────────────────────────────────────────────────────
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

  // Generate exactly 9 recovery codes — only hashes are stored
  const { plain: plainCodes, hashed: hashedCodes } = generateRecoverySet();

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
    recoveryCodesSet: {
      codes: hashedCodes,
      generatedAt: new Date(),
    },
    displayName: displayName || username,
    profilePicture,
    devices: [{ deviceId: sessionId, deviceName, lastActive: Date.now() }],
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

      const welcomeContent = `🚀 **WELCOME TO RELAY** 🚀\n\nWe are thrilled to officially welcome you to Relay — the lightning-fast, ultra-secure messaging platform! Here is a quick guide to get you started:\n\n💬 **Instant Messaging & Media**\nChat with your friends effortlessly. Send texts, voice notes, photos, and files.\n\n👻 **Disappearing Messages**\nPrivacy is our priority. Send 'View Once' media or enable disappearing messages in chat settings.\n\n🤖 **Meet Mica & Mars (AI Bots)**\nRelay features two native AI companions! Mica (@mica_bot) is helpful and friendly. Mars (@mars_bot) is sarcastic and witty. Ask them anything or play games in groups!\n\n🎮 **Play Group Games**\nType 'help games' in any group chat to play Riddle, Scramble, Guess the Word, Emoji Guess, Mafia, Double Agent, Breach, and Suspect!\n\n🛡️ **Account Security**\nBe sure to save your 9 one-time Recovery Codes. You can view and manage them in Settings → Security. Each code can only be used once!\n\nEnjoy chatting on Relay! ✨`;

      const io = req.app.get('io');
      await BotManager.sendCustomMessage(chat, io, relayId, welcomeContent, 'text');
    } catch (welcomeErr) {
      console.error('Failed to send welcome message to new user:', welcomeErr);
    }
  }

  res.status(201).json({
    success: true,
    token: generateToken(user._id, sessionId),
    // Return plaintext codes exactly once — they are NOT stored on the server
    recoveryKeys: plainCodes,
    recoveryKey: plainCodes[0],
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

// ─── Login ────────────────────────────────────────────────────────────────────
// @desc  Login user (email or username + password)
// @route POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

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

  user.isOnline = true;
  user.lastSeen = new Date();
  if (!user.devices) user.devices = [];

  let existingDeviceIndex = user.devices.findIndex(d => d.deviceId === sessionId);
  if (existingDeviceIndex === -1 && deviceName !== 'Unknown Device') {
    existingDeviceIndex = user.devices.findIndex(d => d.deviceName === deviceName);
  }

  if (existingDeviceIndex !== -1) {
    user.devices[existingDeviceIndex].deviceId = sessionId;
    user.devices[existingDeviceIndex].lastActive = Date.now();
    user.devices[existingDeviceIndex].deviceName = deviceName;
  } else {
    if (user.devices.length >= 3) {
      user.devices.sort((a, b) => new Date(a.lastActive) - new Date(b.lastActive));
      while (user.devices.length >= 3) user.devices.shift();
    }
    user.devices.push({ deviceId: sessionId, deviceName, lastActive: Date.now() });
  }

  await user.save({ validateBeforeSave: false });

  // Security notification from Relay Bot
  let relayId = getRelayBotId();
  if (relayId) {
    try {
      let chat = await Chat.findOne({
        isGroupChat: false,
        $and: [
          { users: { $elemMatch: { $eq: user._id } } },
          { users: { $elemMatch: { $eq: relayId } } },
        ],
      });

      if (!chat) {
        chat = await Chat.create({
          chatName: 'Relay Security',
          isGroupChat: false,
          users: [user._id, relayId],
          disappearAfter: 86400,
        });
      }

      const io = req.app.get('io');
      const dateString = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
      const msgContent = `🔒 **Security Alert: New Login**\n\nYour account was just accessed from a new device.\n\n📱 **Device:** ${deviceName}\n🕒 **Time:** ${dateString}\n\n⚠️ **Note:** For security, only 3 active devices are allowed at once. Older sessions will be automatically terminated.\n\nIf this was you, simply ignore this message.`;

      await BotManager.sendCustomMessage(chat, io, relayId, msgContent, 'text');
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

// ─── Forgot Password (recovery-code reset) ────────────────────────────────────
// @desc  Reset password using a one-time recovery code
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

  // Select all fields needed for verification + consumption
  const user = await User.findOne(query).select(
    '+password +recoveryKey +recoveryKeys +recoveryCodesSet +securityActions'
  );
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // 1. Check security-action limit BEFORE consuming the code
  if (!canPerformSecurityAction(user)) {
    res.status(403);
    throw new Error(
      `You have reached your security-change limit (${SECURITY_ACTION_LIMIT} per 30 days). Please try again after your limit resets.`
    );
  }

  // 2. Verify and consume the recovery code atomically
  const result = await verifyAndConsumeCode(recoveryKey, user);
  if (!result.valid) {
    res.status(400);
    throw new Error('Invalid or already used recovery code');
  }

  // 3. Update password
  const isSamePassword = await user.matchPassword(newPassword);
  if (isSamePassword) {
    res.status(400);
    throw new Error('New password must be different from your current password');
  }
  user.password = newPassword;

  // 4. Record the security action
  user.securityActions.push({ actionType: 'recovery_reset', performedAt: new Date() });

  // 5. Manage sessions: clear other devices but issue a new one for this request
  const sessionId = req.body.deviceId || crypto.randomBytes(16).toString('hex');
  const deviceName = req.body.deviceName || 'Unknown Device';
  
  user.devices = [{ deviceId: sessionId, deviceName, lastActive: Date.now() }];

  await user.save();

  // Send security notification since password was reset
  let relayId = getRelayBotId();
  if (relayId) {
    try {
      let chat = await Chat.findOne({
        isGroupChat: false,
        $and: [
          { users: { $elemMatch: { $eq: user._id } } },
          { users: { $elemMatch: { $eq: relayId } } },
        ],
      });
      if (!chat) {
        chat = await Chat.create({
          chatName: 'Relay Security',
          isGroupChat: false,
          users: [user._id, relayId],
          disappearAfter: 86400,
        });
      }
      const io = req.app.get('io');
      const msgContent = `🔒 **Security Alert: Password Reset**\n\nYour account password was just reset using a recovery code.\n\n📱 **Device:** ${deviceName}\n\n⚠️ If you did not perform this action, your account may be compromised.`;
      await BotManager.sendCustomMessage(chat, io, relayId, msgContent, 'text');
    } catch (err) {}
  }

  res.status(200).json({ 
    success: true, 
    message: 'Password reset successfully',
    token: generateToken(user._id, sessionId),
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

// ─── Change Password (authenticated) ─────────────────────────────────────────
// @desc  Change password (user knows current password)
// @route PUT /api/auth/change-password
// @access Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  if (currentPassword === newPassword) {
    res.status(400);
    throw new Error('New password must be different from your current password');
  }

  const user = await User.findById(req.user._id).select('+password +securityActions');

  // 1. Check security-action limit
  if (!canPerformSecurityAction(user)) {
    res.status(403);
    throw new Error(
      `You have reached your security-change limit (${SECURITY_ACTION_LIMIT} per 30 days). Please try again after your limit resets.`
    );
  }

  // 2. Verify current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(400);
    throw new Error('Current password is incorrect');
  }

  // 3. Update password
  user.password = newPassword;

  // 4. Record the security action
  user.securityActions.push({ actionType: 'password_change', performedAt: new Date() });

  // 5. Keep only current session active
  if (req.user && req.user.currentSessionId) {
    user.devices = user.devices.filter(d => d.deviceId === req.user.currentSessionId);
  } else {
    user.devices = [];
  }

  await user.save();

  res.status(200).json({ success: true, message: 'Password changed successfully' });
});

// ─── Generate new recovery-code set ──────────────────────────────────────────
// @desc  Generate a new set of 9 recovery codes (invalidates the old set)
// @route POST /api/auth/generate-recovery-key
// @access Private
const generateNewRecoveryKey = asyncHandler(async (req, res) => {
  const { currentPassword } = req.body;

  if (!currentPassword) {
    res.status(400);
    throw new Error('Please provide current password');
  }

  const user = await User.findById(req.user._id).select(
    '+password +recoveryCodesSet +recoveryKeys +securityActions'
  );

  // 1. Check regeneration eligibility (30-day cooldown OR all codes consumed)
  if (!canRegenerate(user)) {
    const availableAt = getRegenerationAvailableAt(user);
    res.status(403);
    throw new Error(
      `Recovery-code regeneration is not available yet. ` +
      (availableAt
        ? `Your codes will be eligible for replacement on ${availableAt.toLocaleDateString()}.`
        : 'Please wait until the cooldown expires.')
    );
  }

  // 2. Check security-action limit
  if (!canPerformSecurityAction(user)) {
    res.status(403);
    throw new Error(
      `You have reached your security-change limit (${SECURITY_ACTION_LIMIT} per 30 days). Please try again after your limit resets.`
    );
  }

  // 3. Verify current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  // 4. Generate new set
  const { plain: plainCodes, hashed: hashedCodes } = generateRecoverySet();

  // 5. Replace recovery-code set (old set is fully overwritten → immediately invalid)
  user.recoveryCodesSet = {
    codes: hashedCodes,
    generatedAt: new Date(),
  };

  // 6. Wipe legacy fields to complete migration
  user.recoveryKeys = [];
  user.recoveryKey = undefined;

  // 7. Record the security action
  user.securityActions.push({ actionType: 'code_regeneration', performedAt: new Date() });

  await user.save();

  // Return plaintext codes ONLY in this response — never stored, never returned again
  res.status(200).json({
    success: true,
    recoveryKeys: plainCodes,
    recoveryKey: plainCodes[0],
    message: 'New 9 recovery codes generated. Save them securely — they will not be shown again.',
  });
});

// ─── Security status ──────────────────────────────────────────────────────────
// @desc  Get the user's current recovery-code and security-action status
// @route GET /api/auth/security-status
// @access Private
const getSecurityStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    '+recoveryCodesSet +recoveryKeys +securityActions'
  );

  const remaining = getRemainingCount(user);
  const total = (user.recoveryCodesSet?.codes?.length) ||
    (user.recoveryKeys?.length) || 9;
  const actionsUsed = getSecurityActionsUsed(user);
  const regenerationAvailableAt = getRegenerationAvailableAt(user);
  const securityActionsResetAt = getSecurityActionsResetAt(user);

  res.status(200).json({
    success: true,
    recoveryCodesRemaining: remaining,
    recoveryCodesTotal: total,
    canRegenerate: canRegenerate(user),
    regenerationAvailableAt,   // null if immediately available, otherwise ISO date string
    securityActionsUsed: actionsUsed,
    securityActionsLimit: SECURITY_ACTION_LIMIT,
    securityActionsRemaining: Math.max(0, SECURITY_ACTION_LIMIT - actionsUsed),
    securityActionsResetAt,    // when oldest counted action expires from rolling window
  });
});

// ─── Get current user profile ─────────────────────────────────────────────────
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

// ─── Logout ───────────────────────────────────────────────────────────────────
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

// ─── Device management ────────────────────────────────────────────────────────
// @desc  Get active devices
// @route GET /api/auth/devices
// @access Private
const getDevices = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('devices');
  const devicesWithCurrent = user.devices.map(d => ({
    ...d.toObject(),
    isCurrent: d.deviceId === req.user.currentSessionId,
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

// ─── Legacy migration endpoint ────────────────────────────────────────────────
// @desc  Generate recovery key for migration (kept for backwards compat)
// @route POST /api/auth/generate-recovery-key-migration
// @access Private
const generateRecoveryKeyMigration = asyncHandler(async (req, res) => {
  // Redirect to main handler
  return generateNewRecoveryKey(req, res);
});

module.exports = {
  signup,
  login,
  forgotPassword,
  changePassword,
  getMe,
  logout,
  getDevices,
  logoutDevice,
  getSecurityStatus,
  generateNewRecoveryKey,
  // Legacy alias
  generateRecoveryKeyMigration,
};
