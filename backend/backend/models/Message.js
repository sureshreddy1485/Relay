const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emoji: { type: String },
});

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    content: { type: String, trim: true, default: '' },
    // Media
    mediaUrl: { type: String, default: '' },
    mediaPublicId: { type: String, default: '' },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'audio', 'document', 'voice', ''],
      default: '',
    },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    // Delivery & read
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Replies & forwards
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    isForwarded: { type: Boolean, default: false },
    forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Reactions
    reactions: [reactionSchema],
    // Deletion
    deletedForEveryone: { type: Boolean, default: false },
    deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Self-destruct
    isSelfDestructing: { type: Boolean, default: false },
    destructAfterSeconds: { type: Number, default: 5 },
    expiresAt: { type: Date, default: null },
    // E2E encrypted secret chat
    isEncrypted: { type: Boolean, default: false },
    encryptedContent: { type: String, default: '' },
    isLive: { type: Boolean, default: false },
    // System messages (e.g., "Alice added Bob")
    isSystemMessage: { type: Boolean, default: false },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'voice', 'document', 'system', 'sticker'],
      default: 'text',
    },
  },
  { timestamps: true }
);

// Auto-delete self-destruct messages
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema);
