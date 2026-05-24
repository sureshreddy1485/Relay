const mongoose = require('mongoose');

const PlayerGameStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  xp: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  titles: [{ type: String }], 
  playHistory: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('PlayerGameStats', PlayerGameStatsSchema);
