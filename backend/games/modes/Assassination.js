const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMarsBotId } = require('../../utils/botHelper');

const { generate } = require('random-words');

class AssassinationGame {
  constructor() {
    
    this.sessions = new Map();
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id.toString();
    
    const gameState = {
      gameType: 'assassination',
      status: 'lobby',
      players: new Map(), // userId -> { name, targetId, triggerWord, isAlive }
      startedAt: Date.now(), botId: botId || await require('../../utils/BotManager').getActiveBotId(chat._id) };

    // Add the person who started it
    gameState.players.set(sender._id.toString(), {
      name: sender.displayName || sender.username,
      userId: sender._id.toString(),
      isAlive: true
    });

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId, gameState);

    await this.sendBotMessage(chat, io, `🎯 **ASSASSINATION LOBBY OPEN!**\n\nTrust no one. Type **"join"** to enter the game.\n\nGame starts in 30 seconds...`);

    // Start game after 30 seconds
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

      if (text === 'join') {
        if (!state.players.has(senderId)) {
          state.players.set(senderId, {
            name: message.sender.displayName || message.sender.username,
            userId: senderId,
            isAlive: true
          });
          await this.sendBotMessage(chat, io, `🗡️ **${state.players.get(senderId).name}** has joined the assassination ring. (${state.players.size} players)`);
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
        await this.sendBotMessage(chat, io, `🏳️ **Game forcefully aborted.** Everyone lives... for now.`);
        return true;
      }

      // Check if the sender is an active player
      const activePlayer = state.players.get(senderId);
      if (!activePlayer || !activePlayer.isAlive) return false; // Ignore spectators / dead players

      // Find if ANY other alive player is targeting THIS sender, and if the sender said their trigger word
      for (const [attackerId, attacker] of state.players.entries()) {
        if (attacker.isAlive && attacker.targetId === senderId) {
          // Attacker is targeting Sender. Did Sender say the trigger word?
          if (text.includes(attacker.triggerWord)) {
            // ELIMINATION!
            activePlayer.isAlive = false;
            
            await this.sendBotMessage(chat, io, `🩸 **ASSASSINATION!**\n\n**${activePlayer.name}** was eliminated by **${attacker.name}** using the secret trigger word: **"${attacker.triggerWord.toUpperCase()}"**!`);
            
            // Check win condition
            const alivePlayers = Array.from(state.players.values()).filter(p => p.isAlive);
            if (alivePlayers.length === 1) {
              const winner = alivePlayers[0];
              await this.sendBotMessage(chat, io, `👑 **${winner.name} IS THE MASTER ASSASSIN!** They are the last one standing!`);
              GameManager.endGame(groupId);
              this.sessions.delete(groupId);
            } else if (alivePlayers.length === 0) {
              await this.sendBotMessage(chat, io, `💀 **Everyone is dead!** No winners this round.`);
              GameManager.endGame(groupId);
              this.sessions.delete(groupId);
            } else {
              // Re-assign target for the attacker since their target died
              const newTarget = alivePlayers.find(p => p.userId !== attackerId);
              if (newTarget) {
                attacker.targetId = newTarget.userId;
                attacker.triggerWord = generate({ minLength: 4, maxLength: 6 });
                
                // Send Private DM via Socket
                await this.sendPrivateDM(attacker.userId, io, state.botId, `🎯 **NEW TARGET ACQUIRED**\nYour new target is ${newTarget.name}. Trick them into saying "${attacker.triggerWord}".`);
              }
            }
            return true;
          }
        }
      }
    }

    return false;
  }

  async beginGameplay(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state || state.status !== 'lobby') return;

    const playersArray = Array.from(state.players.values());
    if (playersArray.length < 2) {
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      await this.sendBotMessage(chat, io, `❌ **Not enough players!** Assassination requires at least 2 players.`);
      return;
    }

    state.status = 'active';

    // Assign ring targets (A -> B, B -> C, C -> A)
    // Shuffle array first
    const shuffled = playersArray.sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const currentPlayer = shuffled[i];
      const targetPlayer = shuffled[(i + 1) % shuffled.length]; // Next player in ring
      
      const trigger = generate({ minLength: 4, maxLength: 6 });
      
      currentPlayer.targetId = targetPlayer.userId;
      currentPlayer.triggerWord = trigger;

      // SEND PRIVATE SOCKET.IO EMIT TO THIS USER
      await this.sendPrivateDM(currentPlayer.userId, io, state.botId, `🎯 **MISSION BRIEFING**\nYour target is ${targetPlayer.name}. Trick them into typing the exact word "${trigger}" in the group chat without blowing your cover.`);
    }

    await this.sendBotMessage(chat, io, `🎯 **THE ASSASSINATION RING IS ACTIVE!**\n\nThere are ${playersArray.length} killers among you. Check your app for your private target and secret trigger word. Trust no one.`);
  }

  async sendBotMessage(chat, io, content) {
    const botManager = require('../../utils/BotManager');
    const botStr = await botManager.getActiveBotStr(chat._id);
    
    if (botStr === 'mica') {
      content = content.replace('🚨 **CASE FILE OPENED', '🎮 **NEW GAME');
      content = content.replace('Try not to disappoint me.', 'First to answer correctly wins!');
      content = content.replace('Finally. Someone in this group has a functioning brain.', '🎉 **CORRECT!**');
      content = content.replace(/Wow\. You all gave up\..*Embarrassing\./, '🏳️ **GAME OVER!**');
    }

    const activeBotId = await botManager.getActiveBotId(chat._id);
    await botManager.sendCustomMessage(chat, io, activeBotId, content, 'text');
  }
}

module.exports = new AssassinationGame();
