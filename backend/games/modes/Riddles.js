const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMarsBotId } = require('../../utils/botHelper');

// 100% Local, Zero-AI Riddle Database
const RIDDLE_DATABASE = [
  { question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind.", answer: "echo" },
  { question: "You measure my life in hours and I serve you by expiring. I'm quick when I'm thin and slow when I'm fat.", answer: "candle" },
  { question: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish.", answer: "map" },
  { question: "What is seen in the middle of March and April that can't be seen at the beginning or end of either month?", answer: "r" },
  { question: "You see a boat filled with people. It has not sunk, but when you look again you don't see a single person on the boat. Why?", answer: "married" }, // All the people were married
  { question: "What disappears as soon as you say its name?", answer: "silence" },
  { question: "I have keys but no locks. I have a space but no room. You can enter, but can't go outside.", answer: "keyboard" }
];

class RiddlesGame {
  constructor() {
    
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id;
    
    // Select a random riddle
    const riddle = RIDDLE_DATABASE[Math.floor(Math.random() * RIDDLE_DATABASE.length)];
    
    const gameState = {
      gameType: 'riddle',
      status: 'active',
      question: riddle.question,
      answer: riddle.answer,
      startedAt: Date.now(),
      attempts: 0
    };

    // Register with GameManager (In-memory O(1) tracking)
    GameManager.startGame(groupId, this);
    
    // Store in internal memory map specifically for this instance's logic
    if (!this.sessions) this.sessions = new Map();
    this.sessions.set(groupId.toString(), gameState);

    // Persist to MongoDB (Non-blocking)
    GameSession.create({
      groupId,
      gameType: 'riddle',
      status: 'active',
      state: gameState
    }).catch(console.error);

    // Announce the riddle
    await this.sendBotMessage(chat, io, `🚨 **CASE FILE OPENED: RIDDLE**\n\nSolve this, if you can:\n\n"${riddle.question}"\n\n(Type your guess! Type "reset" if it's too hard)`);
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state || state.status !== 'active') return false; // Not our problem

    const text = (message.content || '').toLowerCase().trim();
    state.attempts++;

    // Handle early surrender
    if (text === 'reset') {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      GameSession.findOneAndUpdate(
        { groupId: chat._id, status: 'active' },
        { status: 'finished', endedAt: Date.now() }
      ).catch(console.error);

      await this.sendBotMessage(chat, io, `🏳️ Wow. You all gave up. The answer was **${state.answer.toUpperCase()}**. Embarrassing.`);
      return true;
    }

    // Check if the user guessed the answer
    // Using simple substring match so "It's an echo" matches "echo"
    if (text.includes(state.answer.toLowerCase())) {
      // WINNER!
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);

      const winnerName = message.sender.displayName || message.sender.username;

      // Update DB asynchronously
      GameSession.findOneAndUpdate(
        { groupId: chat._id, status: 'active' },
        { status: 'finished', endedAt: Date.now() }
      ).catch(console.error);

      const newScore = await GameManager.incrementScore(groupId, message.sender._id || message.sender);

      // Announce winner
      await this.sendBotMessage(chat, io, `Finally. Someone in this group has a functioning brain. ${winnerName} got it! \n\nThe answer was **${state.answer.toUpperCase()}**.\nYou now have ${newScore} points.`);
      return true; // We handled this message
    }

    return false; // Did not match the answer, let chat flow normally
  }

  async timeoutRiddle(groupId, chat, io) {
    const state = this.sessions?.get(groupId.toString());
    if (state && state.status === 'active') {
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId.toString());
      
      GameSession.findOneAndUpdate(
        { groupId: chat._id, status: 'active' },
        { status: 'finished', endedAt: Date.now() }
      ).catch(console.error);

      await this.sendBotMessage(chat, io, `⏰ **TIME'S UP!** Nobody got it.\n\nThe answer was: **${state.answer.toUpperCase()}** 😭`);
    }
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

module.exports = new RiddlesGame();
