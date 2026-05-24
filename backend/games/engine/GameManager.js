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
}

module.exports = new GameManager();
