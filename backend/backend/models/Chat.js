const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    chatName: { type: String, trim: true, default: '' },
    isGroupChat: { type: Boolean, default: false },
    isChannel: { type: Boolean, default: false },
    isCommunity: { type: Boolean, default: false },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    // Group / Channel specific
    groupAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groupPicture: { type: String, default: '' },
    groupDescription: { type: String, default: '', maxlength: 500 },
    groupUsername: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    isPublic: { type: Boolean, default: false },
    joinRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bannedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Per-user settings
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Secret chat
    isSecretChat: { type: Boolean, default: false },
    encryptionKey: { type: String, select: false },
    // Community
    category: { type: String, default: '' },
    tags: [String],
    // Large groups
    maxMembers: { type: Number, default: 200 },
    allowDirectMessages: { type: Boolean, default: true },
    // Disappearing messages (seconds, 0 = off)
    disappearAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chat', chatSchema);
