const mongoose = require('mongoose');

const GroupGameSettingsSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, unique: true },
  aliases: {
    type: Map,
    of: String,
    default: {}
  },
  enabledGames: [{ type: String, default: ['assassination', 'doubleagent', 'riddle', 'guess'] }],
  cooldowns: {
    globalDelayMs: { type: Number, default: 30000 },
    perUserDelayMs: { type: Number, default: 10000 }
  }
}, { timestamps: true });

module.exports = mongoose.model('GroupGameSettings', GroupGameSettingsSchema);
