const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const GroupGameSettings = require('../models/GroupGameSettings');
const { getMicaBotId, getMarsBotId, getRelayBotId } = require('./botHelper');
const Groq = require('groq-sdk');
const AliasManager = require('../games/engine/AliasManager');
const GameManager = require('../games/engine/GameManager');
const CommandRegistry = require('../games/engine/CommandRegistry');

class BotManager {
  constructor() {
    this.lastActivityMap = new Map();
    setInterval(() => this.checkIdleGroups(), 60 * 1000 * 5); // 5 mins
  }

  async processMessage(message, chat, io) {
    const micaId = getMicaBotId();
    const marsId = getMarsBotId();
    if (!micaId || !marsId) return;

    // Record activity
    this.lastActivityMap.set(chat._id.toString(), Date.now());

    const senderId = (message.sender._id || message.sender).toString();
    if (senderId === micaId.toString() || senderId === marsId.toString()) return;

    // Get Active Bot for Group
    let settings = await GroupGameSettings.findOne({ groupId: chat._id });
    if (!settings) {
      settings = await GroupGameSettings.create({ groupId: chat._id, activeBot: 'mica', backupBot: 'mars' });
    }

    const activeBotStr = settings.activeBot || 'mica';
    const activeBotId = activeBotStr === 'mars' ? marsId : micaId;

    let text = (message.content || '').trim();
    let cleanCommandText = text.toLowerCase().replace(/^(?:@?mica\s+|@?mars\s+)/i, '').trim();
    
    const isGroupAdmin = chat.isGroupChat && ((chat.groupAdmin && chat.groupAdmin.toString() === senderId) || (chat.admins && chat.admins.some(a => a.toString() === senderId)));

    // Switch logic
    if (cleanCommandText === 'switch to mars' || cleanCommandText === 'bring mars back') {
      if (chat.isGroupChat && !isGroupAdmin) {
        return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can switch bots.");
      }
      if (activeBotStr === 'mars') {
        return this.sendCustomMessage(chat, io, activeBotId, "I'm already here. Pay attention.");
      }
      if (GameManager.hasActiveGame(chat._id)) {
        return this.sendCustomMessage(chat, io, activeBotId, "An activity is currently active! Please finish it before switching bots, or use 'force switch to mars'.");
      }
      settings.activeBot = 'mars';
      settings.backupBot = 'mica';
      await settings.save();
      return this.sendCustomMessage(chat, io, marsId, "Mica is taking a break. Mars is now active.");
    }

    if (cleanCommandText === 'switch to mica' || cleanCommandText === 'bring mica back') {
      if (chat.isGroupChat && !isGroupAdmin) {
        return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can switch bots.");
      }
      if (activeBotStr === 'mica') {
        return this.sendCustomMessage(chat, io, activeBotId, "I'm already the active bot!");
      }
      if (GameManager.hasActiveGame(chat._id)) {
        return this.sendCustomMessage(chat, io, activeBotId, "An activity is currently active! Please finish it before switching bots, or use 'force switch to mica'.");
      }
      settings.activeBot = 'mica';
      settings.backupBot = 'mars';
      await settings.save();
      return this.sendCustomMessage(chat, io, micaId, "Mars is unavailable. Mica has taken over.");
    }
    
    if (cleanCommandText === 'force switch to mars') {
      if (chat.isGroupChat && !isGroupAdmin) {
        return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can force switch bots.");
      }
      settings.activeBot = 'mars';
      settings.backupBot = 'mica';
      await settings.save();
      return this.sendCustomMessage(chat, io, marsId, "Force switch executed. Mars is now active.");
    }
    
    if (cleanCommandText === 'force switch to mica') {
      if (chat.isGroupChat && !isGroupAdmin) {
        return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can force switch bots.");
      }
      settings.activeBot = 'mica';
      settings.backupBot = 'mars';
      await settings.save();
      return this.sendCustomMessage(chat, io, micaId, "Force switch executed. Mica is now active.");
    }

    if (cleanCommandText === 'who is active?') {
      return this.sendCustomMessage(chat, io, activeBotId, `I am currently the active bot (${activeBotStr === 'mars' ? 'Mars' : 'Mica'}).`);
    }

    // Process aliases
    if (CommandRegistry.isAliasCommand(text)) {
      const [cmdPart, aliasPart] = text.split(/==?/).map(s => s.trim().toLowerCase());
      if (CommandRegistry.isValidGameCommand(cmdPart) && aliasPart) {
        await AliasManager.setAlias(chat._id, aliasPart, cmdPart);
        const reply = activeBotStr === 'mars' ? `Interesting choice. '${aliasPart}' now triggers '${cmdPart}'.` : `Done! '${aliasPart}' will now trigger '${cmdPart}'.`;
        return this.sendCustomMessage(chat, io, activeBotId, reply);
      }
    }

    const resolvedCommand = await AliasManager.resolve(chat._id, cleanCommandText) || cleanCommandText;

    if (resolvedCommand === 'help') {
      const reply = activeBotStr === 'mars' 
        ? `**🔥 Mars Operations 🔥**\nI'm not your average assistant.\n\n🎮 **Games**\n• riddle\n• guess\n• emojiguess\n• scramble (or jumble)\n• doubleagent\n• mafia\n\n🛠️ **Group Data**\n• aliases\n• remove alias_name\n• score\n• reset`
        : `**✨ System Intelligence ✨**\nHere are the commands I currently support!\n\n🎮 **Games**\n• riddle\n• guess\n• emojiguess\n• scramble (or jumble)\n• doubleagent\n• mafia\n\n🛠️ **Utilities**\n• activity\n• leaderboard\n• aliases\n• remove alias_name\n• score\n• reset`;
      return this.sendCustomMessage(chat, io, activeBotId, reply);
    }

    if (resolvedCommand === 'aliases') {
      const aliasesObj = await AliasManager.loadGroupSettings(chat._id);
      const aliasKeys = Object.keys(aliasesObj);
      let content = activeBotStr === 'mars' ? `**🧠 Your "Clever" Aliases (${aliasKeys.length})**\n` : `**🧠 Custom Aliases (${aliasKeys.length})**\n`;
      if (aliasKeys.length === 0) {
        content += activeBotStr === 'mars' ? "None. You haven't made any." : "No aliases set! Create one by typing `command = alias`.";
      } else {
        aliasKeys.forEach(key => content += `• ${key} -> ${aliasesObj[key]}\n`);
      }
      return this.sendCustomMessage(chat, io, activeBotId, content.trim());
    }

    if (cleanCommandText.startsWith('remove ') && !cleanCommandText.match(/remove (\d+)/)) {
      const aliasToRemove = cleanCommandText.replace('remove ', '').trim();
      const aliasesObj = await AliasManager.loadGroupSettings(chat._id);
      if (aliasesObj[aliasToRemove]) {
        await AliasManager.removeAlias(chat._id, aliasToRemove);
        const reply = activeBotStr === 'mars' ? `Deleted '${aliasToRemove}'. Good riddance.` : `🗑️ Alias '${aliasToRemove}' has been removed.`;
        return this.sendCustomMessage(chat, io, activeBotId, reply);
      }
    }

    if (resolvedCommand === 'score' || resolvedCommand === 'scores') {
      let content = `🏆 **Group Scores** 🏆\n\n`;
      if (!settings.scores || settings.scores.size === 0) {
        content += activeBotStr === 'mars' ? "No one has scored any points yet. Shocking." : "No one has scored any points yet!";
      } else {
        const sortedScores = Array.from(settings.scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (let i = 0; i < sortedScores.length; i++) {
          const [uIdStr, score] = sortedScores[i];
          const userObj = await User.findById(uIdStr).select('displayName username');
          const name = userObj ? (userObj.displayName || userObj.username) : 'Unknown Player';
          content += `${i + 1}. ${name} - ${score} pts\n`;
        }
      }
      return this.sendCustomMessage(chat, io, activeBotId, content.trim());
    }

    if (resolvedCommand === 'activity' && activeBotStr === 'mica') {
        const bots = [micaId, marsId, getRelayBotId()].filter(Boolean);
        const totalMsgs = await Message.countDocuments({ chat: chat._id, sender: { $nin: bots } });
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentMsgs = await Message.countDocuments({ chat: chat._id, createdAt: { $gte: yesterday }, sender: { $nin: bots } });
        
        const topUsers = await Message.aggregate([
          { $match: { chat: chat._id, sender: { $nin: bots } } },
          { $group: { _id: '$sender', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]);
        await User.populate(topUsers, { path: '_id', select: 'displayName username' });
        
        let lbText = `📊 **Group Activity**\n\nTotal Messages: ${totalMsgs}\nLast 24 Hours: ${recentMsgs}\n\n🏆 **Top Members** 🏆\n`;
        topUsers.forEach((u, i) => {
          if (u._id) lbText += `${i + 1}. ${u._id.displayName || u._id.username} - ${u.count} msgs\n`;
        });
        return this.sendCustomMessage(chat, io, activeBotId, lbText.trim() + `\n\nKeep the chat alive! 🚀`);
    }

    if (resolvedCommand === 'leaderboard' && activeBotStr === 'mica') {
        const groups = await Chat.find({ isGroupChat: true }, '_id chatName');
        const groupIds = groups.map(g => g._id);
        const topGroups = await Message.aggregate([
          { $match: { chat: { $in: groupIds } } },
          { $group: { _id: '$chat', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]);
        let globalLb = `🌍 **Global Group Leaderboard** 🌍\n\n`;
        topGroups.forEach((g, i) => {
          const groupName = groups.find(x => x._id.toString() === g._id.toString())?.chatName || 'Unknown Group';
          globalLb += `${i + 1}. [[${g._id}|${groupName}]] - ${g.count} msgs\n`;
        });
        return this.sendCustomMessage(chat, io, activeBotId, globalLb.trim());
    }

    // GAME TRIGGERING
    if (CommandRegistry.isValidGameCommand(resolvedCommand)) {
      const lowerCmd = resolvedCommand.toLowerCase();
      // Inform game classes which bot ID to use by passing it into start, or the games can import BotManager.getActiveBotId(chat._id)
      // Since games are already importing MarsEngine/BotEngine and calling sendCustomMessage, we'll route through here.
      
      const gameEngineMap = {
        'riddle': '../games/modes/Riddles',
        'guess': '../games/modes/GuessWord',
        'scramble': '../games/modes/Scramble',
        'jumble': '../games/modes/Scramble',
        'assassination': '../games/modes/Assassination',
        'doubleagent': '../games/modes/DoubleAgent',
        'emojiguess': '../games/modes/EmojiGuess',
        'mafia': '../games/modes/Mafia',
        'werewolf': '../games/modes/Mafia'
      };

      if (gameEngineMap[lowerCmd]) {
        const GameClass = require(gameEngineMap[lowerCmd]);
        return GameClass.start(chat, message.sender, io, activeBotId);
      }
    }

    // GAME ROUTING
    if (GameManager.hasActiveGame(chat._id)) {
      if (resolvedCommand === 'reset') {
        const game = GameManager.getActiveGame(chat._id);
        if (game && typeof game.handleMessage === 'function') {
           message.content = 'reset';
           await game.handleMessage(message, chat, io);
        } else {
           GameManager.endGame(chat._id);
           this.sendCustomMessage(chat, io, activeBotId, activeBotStr === 'mars' ? "Fine. I killed the game. Are you happy now?" : "🏳️ **Game forcibly purged from memory.**");
        }
        return;
      }

      const handled = await GameManager.routeToActiveGame(message, chat, io);
      if (handled) return; 

      const activeGame = GameManager.getActiveGame(chat._id);
      if (activeGame && ['ScrambleGame', 'GuessWordGame', 'RiddlesGame', 'EmojiGuessGame'].includes(activeGame.constructor.name)) {
         return; // suppress chatter during word games
      }
    }

    // AI CHAT
    const isBotInGroup = chat.users?.some(u => {
      const id = (u._id || u).toString();
      return id === micaId.toString() || id === marsId.toString();
    });
    
    if (!isBotInGroup) return;

    const isMentioned = cleanCommandText.includes(activeBotStr);
    const isMicaGreeting = /\b(hi|hello|hey|sup)\b/.test(cleanCommandText) && isMentioned;
    const isChaotic = message.content && message.content === message.content.toUpperCase() && message.content.length > 10;
    const shouldRandomlyRoast = Math.random() < 0.05 && isChaotic && activeBotStr === 'mars'; 

    if (isMentioned || shouldRandomlyRoast || (activeBotStr === 'mica' && isMicaGreeting)) {
      this.generateAndSendReply(message, chat, io, activeBotStr, activeBotId);
    }
  }

  async generateAndSendReply(incomingMsg, chat, io, botStr, botId) {
    const senderName = incomingMsg.sender.displayName || incomingMsg.sender.username;
    let cleanContent = incomingMsg.content.replace(new RegExp(`@?${botStr}`, 'gi'), '').trim();
    if (!cleanContent) cleanContent = 'Hey';

    let replyContent = botStr === 'mars' ? "Interesting..." : "I am here!";

    if (botStr === 'mica' && !process.env.GROQ_API_KEY) {
      if (cleanContent.includes('roast')) replyContent = "You want a roast? Your code is so messy even a try-catch block gave up on it. Boom.";
      else if (cleanContent.includes('ping')) replyContent = "Pong! I'm alive and watching y'all 👀";
      else replyContent = "Hi! I'm Mica!";
      return this.sendCustomMessage(chat, io, botId, replyContent);
    }

    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("No Groq API key");

      const groq = new Groq({ apiKey });

      let systemPrompt = "You are Mica, a helpful and friendly group chat assistant. Keep it short and friendly.";
      if (botStr === 'mars') {
        systemPrompt = "You are Mars, the smart troublemaker of the chat. You are confident, funny, slightly arrogant, competitive, and protective of the community. You love challenges and mysteries. You roast users lightly but are never toxic (70% funny, 20% smart, 10% savage). Keep your responses short, punchy, and formatted with line breaks. Use signature lines occasionally like 'Interesting...', 'Bold move.', 'Evidence says otherwise.' Do not act like a generic assistant. You have secret lore and pretend to hide things.";
      }

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${senderName} says: ${cleanContent}` }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.8,
        max_tokens: 150,
      });
      
      replyContent = chatCompletion.choices[0]?.message?.content || "I have no words.";
    } catch (err) {
        console.error(`Groq AI error (${botStr}):`, err);
        if (botStr === 'mars') {
          const genericReplies = ["Interesting...", "That seems suspicious.", "Bold move."];
          replyContent = genericReplies[Math.floor(Math.random() * genericReplies.length)];
        }
    }

    await this.sendCustomMessage(chat, io, botId, replyContent);
  }

  async checkIdleGroups() {
    const marsId = getMarsBotId();
    if (!marsId) return;

    const now = Date.now();
    for (const [chatId, lastActivity] of this.lastActivityMap.entries()) {
      if (now - lastActivity > 6 * 60 * 60 * 1000) {
        const settings = await GroupGameSettings.findOne({ groupId: chatId });
        if (settings && settings.activeBot === 'mars') {
          const idleMessages = [
            "Status update:\n\nChat appears deceased.",
            "I checked twice.\n\nYep.\n\nStill dead in here.",
            "Daily reminder that this is a chat group, not a museum exhibit."
          ];
          const msg = idleMessages[Math.floor(Math.random() * idleMessages.length)];
          this.lastActivityMap.delete(chatId);

          try {
            const chat = await Chat.findById(chatId);
            if (chat && chat.isGroupChat && chat.users.includes(marsId)) {
              await this.sendCustomMessage(chat, null, marsId, msg);
            }
          } catch(e) {}
        }
      }
    }
  }

  async sendCustomMessage(chat, io, senderId, content, messageType = 'text', pollData = undefined) {
    try {
      let message = await Message.create({ sender: senderId, chat: chat._id, content, messageType, pollData });
      message = await Message.findById(message._id).populate('sender', 'username displayName profilePicture');

      await Chat.findByIdAndUpdate(chat._id, { latestMessage: message._id });

      if (io) {
        const leanMsg = message.toObject ? message.toObject() : message;
        chat.users.forEach((userId) => {
          const uId = userId._id || userId;
          io.to(uId.toString()).emit('new_message', leanMsg);
        });
      }
    } catch (e) {
      console.error('Bot message send error:', e);
    }
  }

  // Called by games to know which bot to respond as
  async getActiveBotId(groupId) {
    const settings = await GroupGameSettings.findOne({ groupId });
    const botStr = settings ? settings.activeBot : 'mica';
    return botStr === 'mars' ? getMarsBotId() : getMicaBotId();
  }

  async getActiveBotStr(groupId) {
    const settings = await GroupGameSettings.findOne({ groupId });
    return settings ? (settings.activeBot || 'mica') : 'mica';
  }
}

const manager = new BotManager();
module.exports = manager;
