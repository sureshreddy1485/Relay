const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { encryptSecurityKey, verifySecurityKey } = require('../utils/securityKey');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// Generate JWT
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '365d' });

// @desc  Register user
// @route POST /api/auth/signup
// @access Public
const signup = asyncHandler(async (req, res) => {
  const { username, email, password, securityKey, displayName } = req.body;

  if (!username || !email || !password || !securityKey) {
    res.status(400);
    throw new Error('Please provide all required fields');
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

  const encryptedSecurityKey = encryptSecurityKey(securityKey);

  let profilePicture = '';
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, 'profiles', 'image');
    profilePicture = result.secure_url;
  }

  const user = await User.create({
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    password,
    securityKey: encryptedSecurityKey,
    displayName: displayName || username,
    profilePicture,
  });

  res.status(201).json({
    success: true,
    token: generateToken(user._id),
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

  const user = await User.findOne(query).select('+password');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  // Update online status
  user.isOnline = true;
  user.lastSeen = new Date();
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    token: generateToken(user._id),
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
  const { identifier, securityKey, newPassword } = req.body;

  if (!identifier || !securityKey || !newPassword) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { username: identifier.toLowerCase() };

  const user = await User.findOne(query).select('+securityKey');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const isValid = verifySecurityKey(securityKey, user.securityKey);
  if (!isValid) {
    res.status(401);
    throw new Error('Invalid security key');
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: 'Password reset successfully' });
});

// @desc  Change password (authenticated)
// @route PUT /api/auth/change-password
// @access Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, securityKey } = req.body;

  if (!currentPassword || !newPassword || !securityKey) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const user = await User.findById(req.user._id).select('+password +securityKey');

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  const isKeyValid = verifySecurityKey(securityKey, user.securityKey);
  if (!isKeyValid) {
    res.status(401);
    throw new Error('Invalid security key');
  }

  user.password = newPassword;
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
  await User.findByIdAndUpdate(req.user._id, {
    isOnline: false,
    lastSeen: new Date(),
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

module.exports = { signup, login, forgotPassword, changePassword, getMe, logout };
