const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaPublicId: { type: String, default: '' }, // Cloudinary public_id for deletion
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    caption: { type: String, default: '', maxlength: 500 },
    viewers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now }
      }
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
        reactedAt: { type: Date, default: Date.now }
      }
    ],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  },
  { timestamps: true }
);

// NOTE: We intentionally do NOT use MongoDB TTL index here because we need
// to delete Cloudinary media first before removing the DB record.
// Cleanup is handled by the background job in server.js instead.

module.exports = mongoose.model('Story', storySchema);
