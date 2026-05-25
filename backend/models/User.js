const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [6, 'Username must be at least 6 characters'],
      maxlength: [16, 'Username cannot exceed 16 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      match: [
        /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#_]).{8,}$/,
        'Password must contain at least one uppercase letter, one number, and one special character'
      ],
      select: false,
    },
    lastPasswordChange: { type: Date, default: Date.now },
    securityKey: {
      type: String,
      required: [true, 'Security key is required'],
      select: false,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [50, 'Display name cannot exceed 50 characters'],
      default: function () { return this.username; },
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters'],
      default: '',
    },
    profilePicture: {
      type: String,
      default: '',
    },
    coverPhoto: {
      type: String,
      default: '',
    },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    isCameraActive: { type: Boolean, default: false },
    pushToken: { type: String, default: '' },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pinnedChats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    archivedChats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    mutedChats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    savedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    // Multi-device support
    devices: [
      {
        deviceId: String,
        deviceName: String,
        lastActive: Date,
      },
    ],
    // Privacy settings
    privacy: {
      lastSeenVisibility: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'everyone',
      },
      profilePictureVisibility: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'everyone',
      },
      storiesVisibility: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'everyone',
      },
      readReceipts: {
        type: String,
        enum: ['automatic', 'hide'],
        default: 'automatic',
      },
      allowDMFromGroups: { type: Boolean, default: true },
      autoAcceptFriendRequests: { type: Boolean, default: false },
      allowedDMGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
      disallowedDMGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'system' },
    isVerified: { type: Boolean, default: false },
    isAnonymous: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'system_bot', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
