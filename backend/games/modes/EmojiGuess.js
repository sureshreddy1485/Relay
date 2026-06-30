const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMarsBotId } = require('../../utils/botHelper');

const EMOJI_DATABASE = [
  { answer: "spider-man", emoji: "🕷️👨" },
  { answer: "the lion king", emoji: "🦁👑" },
  { answer: "batman", emoji: "🦇👨" },
  { answer: "harry potter", emoji: "⚡👓🧙‍♂️" },
  { answer: "finding nemo", emoji: "🔎🐟" },
  { answer: "titanic", emoji: "🚢🧊💔" },
  { answer: "star wars", emoji: "⭐⚔️🌌" },
  { answer: "jurassic park", emoji: "🦖🏞️" },
  { answer: "pizza", emoji: "🍕" },
  { answer: "burger", emoji: "🍔" }
];

class EmojiGuessGame {
  constructor() {
    
    this.sessions = new Map();
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id;
    const item = EMOJI_DATABASE[Math.floor(Math.random() * EMOJI_DATABASE.length)];
    
    const gameState = {
      gameType: 'emojiguess',
      status: 'active',
      answer: item.answer,
      emoji: item.emoji,
      startedAt: Date.now(),
      attempts: 0
    };

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId.toString(), gameState);

    GameSession.create({
      groupId,
      gameType: 'emojiguess',
      status: 'active',
      state: gameState
    }).catch(console.error);

    await this.sendBotMessage(chat, io, `🚨 **CASE FILE OPENED: EMOJI GUESS**\n\nDecode this, geniuses:\n\n${item.emoji}\n\n(Type your guess! Type "reset" if it's too hard for you)`);
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state || state.status !== 'active') return false;

    const text = (message.content || '').toLowerCase().trim();
    state.attempts++;

    if (text === 'reset') {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      await this.sendBotMessage(chat, io, `🏳️ Wow. You all gave up. The answer was **${state.answer.toUpperCase()}**. Embarrassing.`);
      return true;
    }

    // strip punctuation and spaces for comparison
    const cleanGuess = text.replace(/[^a-z0-9]/gi, '');
    const cleanAnswer = state.answer.replace(/[^a-z0-9]/gi, '');

    if (cleanGuess === cleanAnswer || text.includes(state.answer)) {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      const newScore = await GameManager.incrementScore(groupId, message.sender._id || message.sender);
      
      await this.sendBotMessage(chat, io, `Finally. Someone in this group has a functioning brain. ${winnerName} got it! The answer was **${state.answer.toUpperCase()}**! You now have ${newScore} points.`);
      return true; 
    }

    return false;
  }

  async sendBotMessage(chat, io, content) {
    const botManager = require('../../utils/BotManager');
    const botStr = await botManager.getActiveBotStr(chat._id);
    
    if (botStr === 'mica') {
      content = content.replace('🚨 **CASE FILE OPENED', '🎮 **NEW GAME');
      content = content.replace('Try not to disappoint me.', 'First to answer correctly wins!');
      content = content.replace('Finally. Someone in this group has a functioning brain.', '🎉 **CORRECT!**');
      content = content.replace(/Wow\. You all gave up\. (The [a-z]+ was \*\*.+?\*\*)\. Embarrassing\./, '🏳️ **GAME OVER!** $1!');
    }

    const activeBotId = await botManager.getActiveBotId(chat._id);
    await botManager.sendCustomMessage(chat, io, activeBotId, content, 'text');
  }
}

module.exports = new EmojiGuessGame();
