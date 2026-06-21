class GameManager {
  constructor() {
    this.activeGames = new Map(); // groupId -> GameSession instance
  }

  hasActiveGame(groupId) {
    return this.activeGames.has(groupId.toString());
  }

  getActiveGame(groupId) {
    return this.activeGames.get(groupId.toString());
  }

  startGame(groupId, gameInstance) {
    this.activeGames.set(groupId.toString(), gameInstance);
  }

  endGame(groupId) {
    this.activeGames.delete(groupId.toString());
  }

  async routeToActiveGame(message, chat, io) {
    const game = this.getActiveGame(chat._id);
    if (game && typeof game.handleMessage === 'function') {
      return game.handleMessage(message, chat, io);
    }
    return false; // Not handled
  }

  async incrementScore(groupId, userId, points = 2) {
    const GroupGameSettings = require('../../models/GroupGameSettings');
    const settings = await GroupGameSettings.findOneAndUpdate(
      { groupId },
      { $inc: { [`scores.${userId}`]: points } },
      { new: true, upsert: true }
    );
    return settings.scores.get(userId.toString()) || points;
  }
}

module.exports = new GameManager();
