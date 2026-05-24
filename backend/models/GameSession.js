const mongoose = require('mongoose');

const GameSessionSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  gameType: { type: String, enum: ['assassination', 'doubleagent', 'riddle', 'guess'], required: true },
  status: { type: String, enum: ['lobby', 'active', 'finished', 'cancelled'], default: 'lobby' },
  players: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String },
    score: { type: Number, default: 0 },
    isEliminated: { type: Boolean, default: false },
    secretData: { type: mongoose.Schema.Types.Mixed } 
  }],
  state: { type: mongoose.Schema.Types.Mixed, default: {} }, 
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('GameSession', GameSessionSchema);
