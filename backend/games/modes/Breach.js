const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');

class BreachGame {
  constructor() {
    this.sessions = new Map();
  }

  generatePIN() {
    let pin = '';
    for (let i = 0; i < 4; i++) {
      pin += Math.floor(Math.random() * 10).toString();
    }
    return pin;
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id;
    const pin = this.generatePIN();
    
    const gameState = {
      gameType: 'breach',
      status: 'active',
      pin: pin,
      attempts: 0,
      maxAttempts: 10,
      startedAt: Date.now(),
      botId: botId
    };

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId.toString(), gameState);

    GameSession.create({
      groupId,
      gameType: 'breach',
      status: 'active',
      state: gameState
    }).catch(console.error);

    await this.sendBotMessage(chat, io, botId, `🔥 **SYSTEM BREACH INITIATED** 🔥\n\nFirewall: ████████\n\nGuess the 4-digit PIN. You have ${gameState.maxAttempts} attempts.\nType your 4-digit guess below. Type "reset" to abort.`);

    // 2 minute timeout
    gameState.timeoutId = setTimeout(async () => {
      const state = this.sessions.get(groupId.toString());
      if (state && state.status === 'active') {
        state.status = 'finished';
        GameManager.endGame(groupId);
        this.sessions.delete(groupId.toString());
        GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
        await this.sendBotMessage(chat, io, botId, `⏰ Time's up. The firewall traced you. The PIN was **${pin}**. Disappointing.`);
      }
    }, 120000);
  }

  calculateMatches(secret, guess) {
    let exact = 0;
    let correctDigits = 0;

    const secretCounts = {};
    const guessCounts = {};

    for (let i = 0; i < 4; i++) {
      if (secret[i] === guess[i]) {
        exact++;
      } else {
        secretCounts[secret[i]] = (secretCounts[secret[i]] || 0) + 1;
        guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
      }
    }

    for (let i = 0; i <= 9; i++) {
      const char = i.toString();
      if (secretCounts[char] && guessCounts[char]) {
        correctDigits += Math.min(secretCounts[char], guessCounts[char]);
      }
    }

    return { exact, correctDigits: exact + correctDigits };
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state || state.status !== 'active') return false;

    const text = (message.content || '').toLowerCase().trim();

    if (text === 'reset') {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      await this.sendBotMessage(chat, io, state.botId, `🏳️ Operation aborted. The PIN was **${state.pin}**. Try harder next time.`);
      return true;
    }

    // Check if it's a 4-digit number
    if (!/^\d{4}$/.test(text)) {
      return false; // Ignore non-4-digit messages
    }

    state.attempts++;
    
    if (text === state.pin) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      
      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      const newScore = await GameManager.incrementScore(groupId, message.sender._id || message.sender, 5); // Breach gives 5 pts

      await this.sendBotMessage(chat, io, state.botId, `🔓 **BREACH SUCCESSFUL!**\n\n${winnerName} cracked the PIN **${state.pin}**!\n\nScore: ${newScore} pts. Not bad.`);
      return true;
    } else {
      if (state.attempts >= state.maxAttempts) {
        if (state.timeoutId) clearTimeout(state.timeoutId);
        state.status = 'finished';
        GameManager.endGame(groupId);
        this.sessions.delete(groupId);
        GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
        await this.sendBotMessage(chat, io, state.botId, `🔒 **ACCESS DENIED**\n\nYou are out of attempts. The firewall locked you out.\nThe PIN was **${state.pin}**.`);
        return true;
      } else {
        const { exact, correctDigits } = this.calculateMatches(state.pin, text);
        const attemptsLeft = state.maxAttempts - state.attempts;
        await this.sendBotMessage(chat, io, state.botId, `> ${text}\n✔ ${correctDigits} digits correct\n✔ ${exact} in position\n\n(${attemptsLeft} attempts remaining)`);
        return true;
      }
    }
  }

  async sendBotMessage(chat, io, botId, content) {
    const botManager = require('../../utils/BotManager');
    await botManager.sendCustomMessage(chat, io, botId, content, 'text');
  }
}

module.exports = new BreachGame();
