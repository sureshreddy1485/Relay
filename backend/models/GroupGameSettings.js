const mongoose = require('mongoose');

const GroupGameSettingsSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, unique: true },
  activeBot: { type: String, enum: ['mica', 'mars'], default: 'mica' },
  backupBot: { type: String, enum: ['mica', 'mars'], default: 'mars' },
  aliases: {
    type: Map,
    of: String,
    default: {}
  },
  enabledGames: [{ type: String, default: ['assassination', 'doubleagent', 'riddle', 'guess', 'scramble', 'jumble', 'emojiguess', 'mafia'] }],
  cooldowns: {
    globalDelayMs: { type: Number, default: 30000 },
    perUserDelayMs: { type: Number, default: 10000 }
  },
  scores: {
    type: Map,
    of: Number,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('GroupGameSettings', GroupGameSettingsSchema);
