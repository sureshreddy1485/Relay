const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMarsBotId } = require('../../utils/botHelper');

const { generate } = require('random-words');

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
    
    this.sessions = new Map();
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id;
    // Generate a random word that's at least 4 letters long
    let word;
    do {
      word = generate({ minLength: 4, maxLength: 8 });
    } while (!word || word.length < 4);
    
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

    await this.sendBotMessage(chat, io, `🚨 **CASE FILE OPENED: SCRAMBLE**\n\nSomebody scrambled this word. Unscramble it, if you can. Capital letter is the start:\n\n**${jumbled}**\n\n(Type your guess! Type "reset" if you give up)`);
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
      await this.sendBotMessage(chat, io, `🏳️ Wow. You all gave up. The word was **${state.word.toUpperCase()}**. Embarrassing.`);
      return true;
    }

    if (text === state.word.toLowerCase()) {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      const newScore = await GameManager.incrementScore(groupId, message.sender._id || message.sender);
      
      await this.sendBotMessage(chat, io, `Finally. Someone in this group has a functioning brain. ${winnerName} got it! The word was **${state.word.toUpperCase()}**! You now have ${newScore} points.`);
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

module.exports = new ScrambleGame();
