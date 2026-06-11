const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMicaBotId } = require('../../utils/botHelper');

const WORD_DATABASE = [
  "crow", "moon", "fire", "piano", "mirror", "guitar", "ocean", "mountain", "river", "forest",
  "apple", "banana", "orange", "grape", "mango", "laptop", "mouse", "keyboard", "screen", "window",
  "shot", "house", "train", "plane", "rocket", "planet", "galaxy", "universe", "star", "sun",
  "elephant", "tiger", "lion", "zebra", "giraffe", "monkey", "penguin", "dolphin", "whale", "shark"
];

function jumbleWord(word) {
  let arr = word.split('');
  const firstLetter = arr[0];
  
  // Scramble the array
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  // Make sure it's actually jumbled
  if (arr.join('') === word && word.length > 1) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }

  // Capitalize the first letter of the original word in the jumbled array
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === firstLetter) {
      arr[i] = arr[i].toUpperCase();
      break; 
    }
  }

  return arr.join('');
}

class ScrambleGame {
  constructor() {
    this.botId = getMicaBotId();
    this.sessions = new Map();
  }

  async start(chat, sender, io) {
    const groupId = chat._id;
    const word = WORD_DATABASE[Math.floor(Math.random() * WORD_DATABASE.length)];
    const jumbled = jumbleWord(word);
    
    const gameState = {
      gameType: 'scramble',
      status: 'active',
      word: word,
      jumbled: jumbled,
      startedAt: Date.now(),
      attempts: 0
    };

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId.toString(), gameState);

    GameSession.create({
      groupId,
      gameType: 'scramble',
      status: 'active',
      state: gameState
    }).catch(console.error);

    await this.sendBotMessage(chat, io, `🔤 **WORD SCRAMBLE!** Unscramble the letters to find the word. The capitalized letter is the starting letter!\n\n**Jumbled:** ${jumbled}\n\n(Type your guess! Type "reset" to give up)`);
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
      await this.sendBotMessage(chat, io, `🏳️ **GAME OVER!** The word was **${state.word.toUpperCase()}**!`);
      return true;
    }

    if (text === state.word.toLowerCase()) {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      await this.sendBotMessage(chat, io, `🎉 **CORRECT!** ${winnerName} got it! The word was **${state.word.toUpperCase()}**! It took ${state.attempts} attempts.`);
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

module.exports = new ScrambleGame();
