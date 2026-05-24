const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMicaBotId } = require('../../utils/botHelper');

const WORD_DATABASE = [
  { word: "crow", clues: ["It has wings", "It is usually black", "It caws"] },
  { word: "moon", clues: ["It is in the sky", "It is visible at night", "It affects the tides"] },
  { word: "fire", clues: ["It is hot", "It needs oxygen", "It produces light"] },
  { word: "piano", clues: ["It is an instrument", "It has keys", "It is black and white"] },
  { word: "mirror", clues: ["It is made of glass", "It reflects light", "You look at it every morning"] }
];

class GuessWordGame {
  constructor() {
    this.botId = getMicaBotId();
    this.sessions = new Map();
  }

  async start(chat, sender, io) {
    const groupId = chat._id;
    const wordData = WORD_DATABASE[Math.floor(Math.random() * WORD_DATABASE.length)];
    
    const gameState = {
      gameType: 'guess',
      status: 'active',
      word: wordData.word,
      clues: wordData.clues,
      currentClueIndex: 0,
      startedAt: Date.now(),
      attempts: 0
    };

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId.toString(), gameState);

    GameSession.create({
      groupId,
      gameType: 'guess',
      status: 'active',
      state: gameState
    }).catch(console.error);

    await this.sendBotMessage(chat, io, `🔤 **GUESS THE WORD!** I'm thinking of a word. First to guess it wins!\n\n**Clue 1:** ${gameState.clues[0]}\n\n(Type your guess! Type "reset" to give up)`);

    // Send the next clues every 20 seconds
    gameState.intervalId = setInterval(() => this.sendNextClue(groupId, chat, io), 20000);
  }

  async sendNextClue(groupId, chat, io) {
    const state = this.sessions.get(groupId.toString());
    if (!state || state.status !== 'active') return;

    state.currentClueIndex++;
    if (state.currentClueIndex < state.clues.length) {
      await this.sendBotMessage(chat, io, `🔍 **Clue ${state.currentClueIndex + 1}:** ${state.clues[state.currentClueIndex]}`);
    } else {
      // Out of clues, stop interval but keep game alive until someone gets it or resets
      if (state.intervalId) clearInterval(state.intervalId);
      await this.sendBotMessage(chat, io, `⚠️ That was the last clue! Keep guessing, or type "reset" to give up!`);
    }
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state || state.status !== 'active') return false;

    const text = (message.content || '').toLowerCase().trim();
    state.attempts++;

    if (text === 'reset') {
      if (state.intervalId) clearInterval(state.intervalId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      await this.sendBotMessage(chat, io, `🏳️ **GAME OVER!** The word was **${state.word.toUpperCase()}**!`);
      return true;
    }

    if (text.includes(state.word.toLowerCase())) {
      if (state.intervalId) clearInterval(state.intervalId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      await this.sendBotMessage(chat, io, `🎉 **CORRECT!** ${winnerName} got it! The word was **${state.word.toUpperCase()}**!`);
      return true; 
    }

    return false;
  }

  async sendBotMessage(chat, io, content) {
    const botEngine = require('../../utils/BotEngine');
    await botEngine.sendCustomMessage(chat, io, {
      sender: this.botId,
      chat: chat._id,
      content: content,
      messageType: 'text'
    });
  }
}

module.exports = new GuessWordGame();
