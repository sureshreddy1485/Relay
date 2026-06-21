const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');
const { getMarsBotId } = require('../../utils/botHelper');

class MafiaGame {
  constructor() {
    
    this.sessions = new Map();
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id.toString();
    
    const gameState = {
      gameType: 'mafia',
      status: 'lobby',
      players: new Map(), // userId -> { name, role, isAlive, votedFor }
      startedAt: Date.now()
    };

    gameState.players.set(sender._id.toString(), {
      name: sender.displayName || sender.username,
      userId: sender._id.toString(),
      isAlive: true,
      votedFor: null
    });

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId, gameState);

    await this.sendBotMessage(chat, io, `🐺 **MAFIA / WEREWOLF LOBBY OPEN!**\n\nThe village is under attack. Type **"join"** to enter the game. (Minimum 4 players)\n\nGame starts in 45 seconds...`);

    gameState.lobbyTimer = setTimeout(() => this.beginGameplay(groupId, chat, io), 45000);
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
        await this.sendBotMessage(chat, io, `🏳️ **Mafia lobby cancelled.**`);
        return true;
      }

      if (text === 'join') {
        if (!state.players.has(senderId)) {
          state.players.set(senderId, {
            name: message.sender.displayName || message.sender.username,
            userId: senderId,
            isAlive: true,
            votedFor: null
          });
          await this.sendBotMessage(chat, io, `🐺 **${state.players.get(senderId).name}** joined the village. (${state.players.size} players)`);
        }
        return true;
      }
      return false; 
    }

    // 2. Active Phase
    if (state.status === 'day' || state.status === 'night') {
      if (text === 'reset') {
        if (state.nightTimer) clearTimeout(state.nightTimer);
        GameManager.endGame(groupId);
        this.sessions.delete(groupId);
        await this.sendBotMessage(chat, io, `🏳️ **Mafia game aborted.**`);
        return true;
      }

      if (state.status === 'day' && text.startsWith('vote ')) {
        const player = state.players.get(senderId);
        if (!player || !player.isAlive) {
          await this.sendBotMessage(chat, io, `👻 Dead people can't vote, ${player ? player.name : 'stranger'}!`);
          return true;
        }

        const targetName = text.replace('vote ', '').trim().toLowerCase();
        
        // Find target
        let target = null;
        for (const [id, p] of state.players.entries()) {
          if (p.isAlive && p.name.toLowerCase().includes(targetName)) {
            target = p;
            break;
          }
        }

        if (!target) {
          await this.sendBotMessage(chat, io, `❌ Cannot find an alive player matching "${targetName}".`);
          return true;
        }

        player.votedFor = target.userId;
        
        // Count votes
        const voteCounts = {};
        let aliveCount = 0;
        for (const [id, p] of state.players.entries()) {
          if (p.isAlive) {
            aliveCount++;
            if (p.votedFor) {
              voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
            }
          }
        }

        await this.sendBotMessage(chat, io, `🗳️ **${player.name}** voted to eliminate **${target.name}**.`);

        // Check majority
        const majority = Math.floor(aliveCount / 2) + 1;
        for (const [id, count] of Object.entries(voteCounts)) {
          if (count >= majority) {
            await this.executePlayer(groupId, chat, io, id);
            return true;
          }
        }
        return true;
      }
    }

    return false;
  }

  async beginGameplay(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state || state.status !== 'lobby') return;

    const playersArray = Array.from(state.players.values());
    // For testing, let's allow minimum 3 players if needed, but standard 4
    if (playersArray.length < 3) {
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      await this.sendBotMessage(chat, io, `❌ **Not enough players!** Mafia requires at least 3 players.`);
      return;
    }

    // Assign Roles
    // 1 Mafia, 1 Doctor, 1 Detective, Rest Villagers
    const roles = ['Mafia'];
    if (playersArray.length >= 4) roles.push('Doctor');
    if (playersArray.length >= 5) roles.push('Detective');
    while (roles.length < playersArray.length) {
      roles.push('Villager');
    }

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    for (let i = 0; i < playersArray.length; i++) {
      const p = playersArray[i];
      p.role = roles[i];

      let desc = '';
      if (p.role === 'Mafia') desc = 'You are the Mafia (Wolf). Eliminate the village without getting caught.';
      else if (p.role === 'Doctor') desc = 'You are the Doctor. You can save people. (Auto-saving in quick mode)';
      else if (p.role === 'Detective') desc = 'You are the Detective. Find the Mafia!';
      else desc = 'You are a Villager. Find the Mafia and vote them out!';

      io.to(p.userId).emit('private_mission_assigned', {
        title: `ROLE: ${p.role.toUpperCase()}`,
        body: desc
      });
    }

    await this.sendBotMessage(chat, io, `🐺 **THE GAME HAS BEGUN!**\n\nCheck your app for your secret role.\n\nThe village goes to sleep... 🌙`);
    
    this.startNight(groupId, chat, io);
  }

  startNight(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state) return;

    state.status = 'night';
    
    // Clear votes
    for (const p of state.players.values()) {
      p.votedFor = null;
    }

    // Night phase lasts 5 seconds in quick mode
    state.nightTimer = setTimeout(() => this.endNight(groupId, chat, io), 5000);
  }

  async endNight(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state) return;

    state.status = 'day';

    // Mafia randomly kills someone who is not Mafia
    const aliveTargets = Array.from(state.players.values()).filter(p => p.isAlive && p.role !== 'Mafia');
    
    let killedPlayer = null;
    if (aliveTargets.length > 0) {
      killedPlayer = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
      
      // Doctor has 25% chance to save in quick mode
      const hasAliveDoctor = Array.from(state.players.values()).some(p => p.isAlive && p.role === 'Doctor');
      if (hasAliveDoctor && Math.random() < 0.25) {
        killedPlayer = null; // Saved!
      }
    }

    if (killedPlayer) {
      killedPlayer.isAlive = false;
      await this.sendBotMessage(chat, io, `☀️ **Day Breaks!**\n\nTragedy struck! 💀 **${killedPlayer.name}** was found eliminated. They were a **${killedPlayer.role}**.`);
    } else {
      await this.sendBotMessage(chat, io, `☀️ **Day Breaks!**\n\nThe night was peaceful. No one was eliminated!`);
    }

    if (await this.checkWin(groupId, chat, io)) return;

    await this.sendBotMessage(chat, io, `🗣️ **DISCUSSION PHASE**\n\nDiscuss who you think the Mafia is!\nType **vote [name]** to vote to eliminate someone.`);
  }

  async executePlayer(groupId, chat, io, targetId) {
    const state = this.sessions.get(groupId);
    if (!state) return;

    const target = state.players.get(targetId);
    target.isAlive = false;

    await this.sendBotMessage(chat, io, `⚖️ **THE VILLAGE HAS SPOKEN!**\n\n**${target.name}** has been eliminated by majority vote.\nThey were... **${target.role}**!`);

    if (await this.checkWin(groupId, chat, io)) return;

    await this.sendBotMessage(chat, io, `🌙 The village goes to sleep...`);
    this.startNight(groupId, chat, io);
  }

  async checkWin(groupId, chat, io) {
    const state = this.sessions.get(groupId);
    if (!state) return true;

    const aliveArray = Array.from(state.players.values()).filter(p => p.isAlive);
    const mafiaAlive = aliveArray.filter(p => p.role === 'Mafia').length;
    const villageAlive = aliveArray.length - mafiaAlive;

    if (mafiaAlive === 0) {
      await this.sendBotMessage(chat, io, `🎉 **THE VILLAGE WINS!** The Mafia has been defeated.`);
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      return true;
    } else if (mafiaAlive >= villageAlive) {
      await this.sendBotMessage(chat, io, `🐺 **THE MAFIA WINS!** The village has been overrun.`);
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
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
      content = content.replace(/Wow\. You all gave up\..*Embarrassing\./, '🏳️ **GAME OVER!**');
    }

    const activeBotId = await botManager.getActiveBotId(chat._id);
    await botManager.sendCustomMessage(chat, io, activeBotId, content, 'text');
  }
}

module.exports = new MafiaGame();
