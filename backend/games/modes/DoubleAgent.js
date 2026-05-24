const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMicaBotId } = require('../../utils/botHelper');

class DoubleAgentGame {
  constructor() {
    this.botId = getMicaBotId();
    this.sessions = new Map();
  }

  async start(chat, sender, io) {
    const groupId = chat._id.toString();
    
    const gameState = {
      gameType: 'doubleagent',
      status: 'lobby',
      players: new Map(), // userId -> { name, role: 'agent' | 'double_agent' }
      startedAt: Date.now()
    };

    gameState.players.set(sender._id.toString(), {
      name: sender.displayName || sender.username,
      userId: sender._id.toString(),
    });

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId, gameState);

    await this.sendBotMessage(chat, io, `🕵️ **DOUBLE AGENT LOBBY OPEN!**\n\nThere is a traitor among us. Type **"/join"** to enter the game.\n\nGame starts in 30 seconds...`);

    gameState.lobbyTimer = setTimeout(() => this.beginGameplay(groupId, chat, io), 30000);
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state) return false;

    const text = (message.content || '').toLowerCase().trim();
    const senderId = message.sender._id ? message.sender._id.toString() : message.sender.toString();

    // 1. Lobby Phase
    if (state.status === 'lobby') {
      if (text === 'reset') {
        clearTimeout(state.lobbyTimer);
        GameManager.endGame(groupId);
        this.sessions.delete(groupId);
        await this.sendBotMessage(chat, io, `🏳️ **Lobby cancelled.**`);
        return true;
      }

      if (text === '/join') {
        if (!state.players.has(senderId)) {
          state.players.set(senderId, {
            name: message.sender.displayName || message.sender.username,
            userId: senderId
          });
          await this.sendBotMessage(chat, io, `🕵️ **${state.players.get(senderId).name}** joined the agency. (${state.players.size} players)`);
        }
        return true;
      }
      return false; 
    }

    // 2. Active Phase
    if (state.status === 'active') {
      if (text === 'reset') {
        GameManager.endGame(groupId);
        this.sessions.delete(groupId);
        await this.sendBotMessage(chat, io, `🏳️ **Game aborted.**`);
        return true;
      }

      // Handle voting / accused
      if (text.startsWith('/accuse ')) {
        const targetName = text.replace('/accuse ', '').trim();
        await this.sendBotMessage(chat, io, `⚖️ **VOTING INITIATED!**\n\n**${message.sender.displayName || message.sender.username}** has accused **${targetName}** of being the Double Agent!\n\n*(Voting mechanics coming soon!)*`);
        return true;
      }
    }

    return false;
  }

  async beginGameplay(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state || state.status !== 'lobby') return;

    const playersArray = Array.from(state.players.values());
    if (playersArray.length < 3) {
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      await this.sendBotMessage(chat, io, `❌ **Not enough players!** Double Agent requires at least 3 players.`);
      return;
    }

    state.status = 'active';

    // Assign Roles
    const doubleAgentIndex = Math.floor(Math.random() * playersArray.length);
    for (let i = 0; i < playersArray.length; i++) {
      const p = playersArray[i];
      p.role = (i === doubleAgentIndex) ? 'double_agent' : 'agent';

      // Send Private Socket Emits
      if (p.role === 'double_agent') {
        io.to(p.userId).emit('private_mission_assigned', {
          title: 'YOU ARE THE DOUBLE AGENT',
          body: `Blend in. Don't get caught. Sabotage the agency.`
        });
      } else {
        io.to(p.userId).emit('private_mission_assigned', {
          title: 'YOU ARE A LOYAL AGENT',
          body: `Find the Double Agent before it's too late. Trust no one.`
        });
      }
    }

    await this.sendBotMessage(chat, io, `🕵️ **THE GAME HAS BEGUN!**\n\nThere is **1 Double Agent** hidden among you. Check your app for your secret role.\n\nTalk amongst yourselves. Type **"/accuse [name]"** if you think you know who it is.`);
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

module.exports = new DoubleAgentGame();
