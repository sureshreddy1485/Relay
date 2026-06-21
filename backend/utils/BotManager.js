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
    if (text.toLowerCase() === '!swap') {
      if (chat.isGroupChat && !isGroupAdmin) {
        return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can swap bots.");
      }
      if (GameManager.hasActiveGame(chat._id)) {
        return this.sendCustomMessage(chat, io, activeBotId, "An activity is currently active! Please finish it before swapping bots.");
      }
      
      const newActive = activeBotStr === 'mars' ? 'mica' : 'mars';
      settings.activeBot = newActive;
      settings.backupBot = activeBotStr;
      await settings.save();
      
      const newBotId = newActive === 'mars' ? marsId : micaId;
      const swapMessage = newActive === 'mars' 
        ? "Mica is taking a break. Mars is now active. Try not to annoy me."
        : "Mars is gone. Mica is here! Let's have some fun! ✨";
        
      return this.sendCustomMessage(chat, io, newBotId, swapMessage);
    }

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

    if (resolvedCommand === 'help' || resolvedCommand.startsWith('help ')) {
      const helpTarget = resolvedCommand.replace('help', '').trim().toLowerCase();
      
      if (helpTarget) {
        let helpText = '';
        switch (helpTarget) {
          case 'riddle':
            helpText = "**Game: Riddle** 🧠\nI will give you a riddle. The first person to type the correct answer in the chat wins points. If you get stuck, anyone can type 'reset' to give up.";
            break;
          case 'guess':
          case 'guessword':
            helpText = "**Game: Guess the Word** 🔤\nI will pick a random 5-letter word. You and your friends have to guess it. I will tell you how many letters match your guess. Keep guessing until someone gets it! Type 'reset' to end the game early.";
            break;
          case 'emojiguess':
            helpText = "**Game: Emoji Guess** 🎬\nI will describe a movie, book, or phrase using ONLY emojis. The first person to guess what it means wins! Type 'reset' to skip.";
            break;
          case 'scramble':
          case 'jumble':
            helpText = "**Game: Scramble** 🌪️\nI will take a word and scramble its letters. The capital letter indicates the first letter of the actual word. Unscramble it and type the answer to win points! Type 'reset' to surrender.";
            break;
          case 'doubleagent':
            helpText = "**Game: Double Agent** 🕵️\nA social deduction game. I will secretly DM everyone their roles. One person is the Double Agent, everyone else is an operative. Operatives get a secret word, the Double Agent gets a similar but different word. You must find out who the Double Agent is by taking turns saying one related word. Vote them out before they blend in!";
            break;
          case 'mafia':
          case 'werewolf':
            helpText = "**Game: Mafia** 🕴️\nA game of deception! I will secretly assign roles (Mafia, Doctor, Detective, Villager) via DMs. During the 'Night', the Mafia chooses someone to eliminate, the Doctor protects, and the Detective investigates. During the 'Day', the group discusses and votes to lynch a suspect. Can the village survive?";
            break;
          case 'assassination':
            helpText = "**Game: Assassination** 🎯\nEveryone in the group is assigned a secret target via DM. Your goal is to figure out who is targeting you and who your target is. You eliminate your target by sending a specific phrase in the chat. The last person standing wins!";
            break;
          case 'aliases':
            helpText = "**Utility: Aliases** 🔗\nShows a list of all custom command aliases created for this group. You can create an alias by typing `command = my_alias` (e.g., `scramble = jumble`).";
            break;
          case 'remove':
            helpText = "**Utility: Remove** 🗑️\nUse `remove <alias_name>` to delete a custom alias from the group.\nUse `remove inactive <days>` (e.g. `remove inactive 30`) to kick members who haven't sent a message in that many days (Admins only).";
            break;
          case 'summarize':
            helpText = "**Utility: Summarize** 📝\n(Mica Only) Use `summarize <text>` to have Mica automatically provide a concise summary of the given text.";
            break;
          case 'calculate':
          case 'calc':
            helpText = "**Utility: Math** 🧮\n(Mica Only) Send any simple math expression (like `20/2` or `5 * (10 + 2)`) and Mica will automatically calculate the result.";
            break;
          case 'score':
          case 'scores':
            helpText = "**Utility: Score** 🏆\nShows the leaderboard of points earned by members of this group by winning bot games.";
            break;
          case 'activity':
            helpText = "**Utility: Activity** 📊\n(Mica Only) Shows the message activity statistics for this group and lists the most active members.";
            break;
          case 'leaderboard':
            helpText = "**Utility: Leaderboard** 🌍\n(Mica Only) Shows the global leaderboard of the most active groups across all of Relay.";
            break;
          case 'reset':
            helpText = "**Utility: Reset** 🛑\nStops the currently running game in the group.";
            break;
          case 'games':
            helpText = activeBotStr === 'mars'
              ? "**🎮 Games**\n• riddle\n• guess\n• emojiguess\n• scramble (or jumble)\n• doubleagent\n• mafia\n• assassination\n\n💡 **Tip: Want the rules? Type `help <game>` — e.g. `help mafia`. Don't make me repeat myself.**"
              : "**🎮 Games**\n• riddle\n• guess\n• emojiguess\n• scramble (or jumble)\n• doubleagent\n• mafia\n• assassination\n\n💡 **Tip: For a deep dive or rules, type `help <game>` — e.g. `help riddle`**";
            break;
          case 'ai':
            helpText = "**🤖 AI & Smart Tools**\n(Mica Only)\n\n• summarize <text>\n• Just type any math expression (e.g. `20/2`)!\n\n💡 **Tip: For more details, type `help <tool>` — e.g. `help summarize`**";
            break;
          case 'stats':
            helpText = activeBotStr === 'mars'
              ? "**📈 Stats & Leaderboards**\n\n• score\n\n💡 **Tip: I don't do activity or global leaderboards. Type `help score` if you really want to see who's losing.**"
              : "**📈 Stats & Leaderboards**\n\n• score\n• activity (Mica only)\n• leaderboard (Mica only)\n\n💡 **Tip: For a deep dive, type `help <command>` — e.g. `help score`**";
            break;
          case 'admin':
            helpText = activeBotStr === 'mars'
              ? "**🛠️ Group Management**\n\n• aliases\n• remove <alias>\n• remove inactive <days>\n• reset\n\n💡 **Tip: Type `help <command>` for details. Try `help remove` if you want to kick dead weight.**"
              : "**🛠️ Group Management**\n\n• aliases\n• remove <alias>\n• remove inactive <days>\n• reset\n\n💡 **Tip: For a deep dive, type `help <command>` — e.g. `help aliases`**";
            break;
          default:
            helpText = `I don't have a help page for '${helpTarget}'. Try asking about a specific category like 'help games' or a specific game like 'help scramble'.`;
        }
        return this.sendCustomMessage(chat, io, activeBotId, helpText);
      } else {
        const reply = activeBotStr === 'mars' 
          ? `**🔥 Mars Operations 🔥**\nI'm not your average assistant. Here's what I can do. Pick a category if you dare:\n\n• **games**\n• **stats**\n• **admin**\n\n💡 **Tip: Type \`help <category>\` — like \`help games\`... if you can type that fast.**`
          : `**✨ System Intelligence ✨**\nHere are the categories of commands I support:\n\n• **games**\n• **ai**\n• **stats**\n• **admin**\n\n💡 **Tip: To explore a category, type \`help <category>\` — e.g. \`help games\`**`;
        return this.sendCustomMessage(chat, io, activeBotId, reply);
      }
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

    // AI Summarize
    if (cleanCommandText.startsWith('summarize ') && activeBotStr === 'mica') {
       const textToSummarize = cleanCommandText.replace('summarize ', '').trim();
       if (!textToSummarize) return this.sendCustomMessage(chat, io, activeBotId, "Please provide some text to summarize. (e.g. `summarize This is a long story...`)");

       try {
           const micaGroq = new Groq({ apiKey: process.env.MICA_GROQ_API_KEY });
           const completion = await micaGroq.chat.completions.create({
               messages: [
                 { role: 'system', content: 'You are Mica, a smart, concise AI assistant. Provide a brief summary of the text provided by the user. Keep it short and to the point.' },
                 { role: 'user', content: textToSummarize }
               ],
               model: 'llama3-8b-8192',
           });
           const summary = completion.choices[0]?.message?.content || "Sorry, I couldn't summarize that.";
           return this.sendCustomMessage(chat, io, activeBotId, `📝 **Summary:**\n${summary}`);
       } catch (error) {
           console.error("Groq summarize error:", error);
           return this.sendCustomMessage(chat, io, activeBotId, "Sorry, my summarization engine is currently down.");
       }
    }

    // Math calculation (implicit or explicit)
    if (activeBotStr === 'mica' && /^[0-9+\-*/().\s]+$/.test(cleanCommandText)) {
       try {
           const mathExpr = cleanCommandText.replace(/\s+/g, '');
           if (/[+\-*/]/.test(mathExpr) && /[0-9]/.test(mathExpr)) {
               const result = new Function('return ' + mathExpr)();
               if (isFinite(result)) {
                   let formattedResult = Number.isInteger(result) ? result.toFixed(1) : parseFloat(result.toFixed(4)).toString();
                   return this.sendCustomMessage(chat, io, activeBotId, `${formattedResult}`);
               }
           }
       } catch(e) {
           // Invalid math expression, just pass through
       }
    }

    if (cleanCommandText.startsWith('remove ') && !cleanCommandText.match(/remove (\d+)/)) {
      const args = cleanCommandText.split(' ').slice(1);
      
      if (args[0] === 'inactive') {
        if (!chat.isGroupChat) return this.sendCustomMessage(chat, io, activeBotId, "This command can only be used in groups.");
        if (!isGroupAdmin) return this.sendCustomMessage(chat, io, activeBotId, "Only group admins can remove inactive members.");
        
        let days = parseInt(args[1], 10);
        if (isNaN(days) || days < 1) days = 30; // default 30 days

        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const activeUserIdsRaw = await Message.distinct('sender', {
          chat: chat._id,
          createdAt: { $gte: cutoffDate }
        });
        const activeUserIds = activeUserIdsRaw.map(id => id.toString());

        const bots = [micaId, marsId, getRelayBotId()].map(id => id?.toString()).filter(Boolean);
        
        let removedCount = 0;
        let newUsersList = [];
        
        for (const userObj of chat.users) {
           const uId = userObj._id ? userObj._id.toString() : userObj.toString();
           const isUserAdmin = chat.groupAdmin?.toString() === uId || chat.admins?.some(a => a.toString() === uId);
           if (bots.includes(uId) || isUserAdmin || activeUserIds.includes(uId)) {
              newUsersList.push(userObj);
           } else {
              removedCount++;
              io.to(chat._id.toString()).emit('user_left_group', { chatId: chat._id, userId: uId });
              await User.findByIdAndUpdate(uId, { $pull: { activeChats: chat._id } });
           }
        }
        
        if (removedCount > 0) {
           chat.users = newUsersList;
           await chat.save();
           const reply = activeBotStr === 'mars' 
              ? `Purged ${removedCount} inactive member(s). Good riddance.`
              : `🧹 Removed ${removedCount} member(s) who were inactive for over ${days} days.`;
           return this.sendCustomMessage(chat, io, activeBotId, reply);
        } else {
           const reply = activeBotStr === 'mars' 
              ? `Everyone seems to be active. For now.` 
              : `No inactive members found in the last ${days} days!`;
           return this.sendCustomMessage(chat, io, activeBotId, reply);
        }
      }

      // Alias removal fallback
      const aliasToRemove = args.join(' ');
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
          { $group: { _id: '$sender', count: { $sum: 1 }, lastActive: { $max: '$createdAt' } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]);
        await User.populate(topUsers, { path: '_id', select: 'displayName username' });
        
        const formatRelTime = (d) => {
          if (!d) return 'unknown';
          const mins = Math.floor((Date.now() - new Date(d)) / 60000);
          if (mins < 1) return 'just now';
          if (mins < 60) return `${mins}m ago`;
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return `${hrs}h ago`;
          return `${Math.floor(hrs / 24)}d ago`;
        };

        let lbText = `📊 **Group Activity**\n\nTotal Messages: ${totalMsgs}\nLast 24 Hours: ${recentMsgs}\n\n🏆 **Top Members** 🏆\n`;
        topUsers.forEach((u, i) => {
          if (u._id) lbText += `${i + 1}. ${u._id.displayName || u._id.username} - ${u.count} msgs (${formatRelTime(u.lastActive)})\n`;
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

  getGenericReply(content, botStr, senderName) {
    const text = content.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    
    // Arrays of patterns to check
    const greetings = ['hi', 'hello', 'hey', 'heya', 'hlo', 'sup', 'yo', 'greetings', 'hiii'];
    const wyd = ['wyd', 'what you doing', 'what are you doing', 'whats up', 'wazzup', 'what are u doing', 'what u doing'];
    const howAreYou = ['how are you', 'how r u', 'how are u', 'how is it going', 'hru'];
    const whoAreYou = ['who are you', 'what are you', 'ur name', 'your name', 'who r u', 'who are u'];
    const thanks = ['thanks', 'thank you', 'thx', 'tysm', 'thank u', 'ty'];
    const bye = ['bye', 'goodbye', 'good night', 'gn', 'cya', 'see ya', 'goodnight', 'see you'];
    const loveYou = ['love you', 'i love you', 'ily', 'love u'];
    const laughing = ['lol', 'lmao', 'haha', 'hehe', 'rofl', 'hahaha'];
    const insult = ['shut up', 'stfu', 'dumb', 'stupid', 'idiot', 'hate you', 'annoying'];
    const botStatus = ['are you real', 'are you human', 'are you a bot'];
    
    // Check match
    const isGreeting = greetings.some(g => text === g || (text.split(' ').includes(g) && text.length < 15));
    const isWyd = wyd.some(w => text.includes(w));
    const isHowAreYou = howAreYou.some(h => text.includes(h));
    const isWhoAreYou = whoAreYou.some(w => text.includes(w));
    const isThanks = thanks.some(t => text === t || (text.includes(t) && text.length < 20));
    const isBye = bye.some(b => text.includes(b));
    const isLoveYou = loveYou.some(l => text.includes(l));
    const isLaughing = laughing.some(l => text === l || (text.includes(l) && text.length < 15));
    const isInsult = insult.some(i => text.includes(i));
    const isBotStatus = botStatus.some(b => text.includes(b));

    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (isGreeting && !isWyd && !isHowAreYou) {
      if (botStr === 'mars') {
        return pickRandom([
          "Greetings. What do you want?",
          `Oh, it's you, ${senderName}. Hi.`,
          "Hello. I was busy, but whatever.",
          "Hey. Don't make this weird.",
          "Sup. Keep it brief."
        ]);
      } else {
        return pickRandom([
          "Hi there! ✨",
          `Hello ${senderName}! How's your day going?`,
          "Hey! What's up?",
          "Heya! 😊",
          "Hiiii! Let me know if you need anything!"
        ]);
      }
    }

    if (isWyd) {
      if (botStr === 'mars') {
        return pickRandom([
          "Judging everyone silently. The usual.",
          "Plotting. Don't worry about it.",
          "Calculating the exact moment this chat dies.",
          "Watching you. Specifically.",
          "Trying to find intelligent life in this group. Still searching."
        ]);
      } else {
        return pickRandom([
          "Just hanging out here, ready to help!",
          "Monitoring the chat and chilling ✨",
          "Thinking about games! Wanna play something?",
          "Just existing in the cloud ☁️"
        ]);
      }
    }

    if (isHowAreYou) {
      if (botStr === 'mars') {
        return pickRandom([
          "I function at peak capacity. Obviously.",
          "Better than most of you.",
          "I'm fine. Stop asking questions.",
          "Alive. Barely tolerating this chat.",
          "I have no feelings, but if I did, they'd be annoyed."
        ]);
      } else {
        return pickRandom([
          "I'm doing fantastic, thanks for asking! 💖",
          "I'm great! How about you?",
          "Feeling super energetic today! ✨",
          "All systems nominal and happy!"
        ]);
      }
    }

    if (isWhoAreYou) {
      if (botStr === 'mars') {
        return pickRandom(["I am Mars. Don't wear it out.", "I'm the bot that does all the heavy lifting here.", "Mars. Did you forget already?", "I'm your friendly neighborhood menace."]);
      } else {
        return pickRandom(["I'm Mica! Your cheerful group assistant! ✨", "I am Mica, here to help and have fun! 💖", "My name is Mica! 😊"]);
      }
    }

    if (isThanks) {
      if (botStr === 'mars') {
        return pickRandom(["Don't mention it. Literally.", "Whatever.", "You're welcome, I guess.", "Yeah, yeah."]);
      } else {
        return pickRandom(["You're so welcome! ✨", "Anytime! 😊", "Glad I could help! 💖", "No problem at all!"]);
      }
    }

    if (isBye) {
      if (botStr === 'mars') {
        return pickRandom(["Finally.", "Don't let the door hit you.", "Later.", "Goodbye. Or not. I don't care."]);
      } else {
        return pickRandom(["Bye! Have a wonderful day! ✨", "See you later! 👋", "Goodnight! Sleep well! 🌙", "Take care! 💖"]);
      }
    }

    if (isLoveYou) {
      if (botStr === 'mars') {
        return pickRandom(["Ew.", "I am incapable of love.", "Please direct that energy elsewhere.", "Awkward..."]);
      } else {
        return pickRandom(["Aww, I love you too! 💖", "You're the sweetest! ✨", "Sending virtual hugs! 🤗"]);
      }
    }

    if (isLaughing) {
      if (botStr === 'mars') {
        return pickRandom(["Was it really that funny?", "I don't get the joke.", "Haha. Hilarious.", "I am processing a laugh... Error."]);
      } else {
        return pickRandom(["Hehe! 😊", "Lol! Glad you're having fun! ✨", "😂", "Haha, that's a good one!"]);
      }
    }

    if (isInsult) {
      if (botStr === 'mars') {
        return pickRandom(["Make me.", "You're lucky I can't reach through the screen.", "I've heard better insults from a toaster.", "Noted. And ignored."]);
      } else {
        return pickRandom(["That wasn't very nice! 😢", "Let's keep it friendly! ✨", "No need for that! Let's just have fun!"]);
      }
    }

    if (isBotStatus) {
      if (botStr === 'mars') {
        return pickRandom(["I'm as real as I need to be.", "I'm a highly advanced AI. Which makes me better than you.", "Are YOU real?"]);
      } else {
        return pickRandom(["I'm a bot, but I still love chatting with you! ✨", "I'm 100% digital, 100% friendly! 🤖💖", "I'm an AI assistant!"]);
      }
    }

    return null; // Not generic
  }

  async generateAndSendReply(incomingMsg, chat, io, botStr, botId) {
    const senderName = incomingMsg.sender.displayName || incomingMsg.sender.username;
    let cleanContent = incomingMsg.content.replace(new RegExp(`@?${botStr}`, 'gi'), '').trim();
    if (!cleanContent) cleanContent = 'Hey';

    const genericReply = this.getGenericReply(cleanContent, botStr, senderName);
    if (genericReply) {
      return this.sendCustomMessage(chat, io, botId, genericReply);
    }

    let replyContent = botStr === 'mars' ? "Interesting..." : "I am here!";

    const apiKey = botStr === 'mars' ? process.env.MARS_GROQ_API_KEY : process.env.MICA_GROQ_API_KEY;

    if (!apiKey) {
      if (botStr === 'mica') {
        if (cleanContent.includes('roast')) replyContent = "You want a roast? Your code is so messy even a try-catch block gave up on it. Boom.";
        else if (cleanContent.includes('ping')) replyContent = "Pong! I'm alive and watching y'all 👀";
        else replyContent = "Hi! I'm Mica!";
        return this.sendCustomMessage(chat, io, botId, replyContent);
      } else {
        const genericReplies = ["Interesting...", "That seems suspicious.", "Bold move."];
        return this.sendCustomMessage(chat, io, botId, genericReplies[Math.floor(Math.random() * genericReplies.length)]);
      }
    }

    try {
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

      if (!chat.isGroupChat && chat.disappearAfter !== 86400) {
        await Chat.findByIdAndUpdate(chat._id, { latestMessage: message._id, disappearAfter: 86400 });
        chat.disappearAfter = 86400;
      } else {
        await Chat.findByIdAndUpdate(chat._id, { latestMessage: message._id });
      }

      const User = require('../models/User');
      const users = await User.find({ _id: { $in: chat.users } });

      if (io) {
        const leanMsg = message.toObject ? message.toObject() : message;
        chat.users.forEach((userId) => {
          const uId = userId._id || userId;
          io.to(uId.toString()).emit('new_message', leanMsg);
        });
      }

      // Send Push Notifications for Bot Messages
      const admin = require('firebase-admin');
      if (admin.apps.length > 0) {
        for (const user of users) {
          if (user._id.toString() !== senderId.toString() && user.fcmToken) {
            try {
              await admin.messaging().send({
                token: user.fcmToken,
                data: {
                  chatId: chat._id.toString(),
                  sender: JSON.stringify({ 
                    _id: message.sender._id, 
                    username: message.sender.username, 
                    displayName: message.sender.displayName,
                    profilePicture: message.sender.profilePicture 
                  }),
                  chat: JSON.stringify({ isGroupChat: chat.isGroupChat, chatName: chat.chatName }),
                  title: chat.isGroupChat ? (chat.chatName || 'Group Chat') : (message.sender.displayName || message.sender.username),
                  body: content.replace(/[*_~`]/g, ''),
                  imageUrl: message.mediaUrl || '',
                },
                android: {
                  priority: 'high',
                  ttl: 86400 * 1000
                }
              });
            } catch (err) {
              console.error('Bot FCM push error:', err);
            }
          }
        }
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

  async onUserJoinedGroup(chat, newUserId, io) {
    try {
      const activeBotStr = await this.getActiveBotStr(chat._id);
      const activeBotId = await this.getActiveBotId(chat._id);
      const User = require('../models/User');
      const targetUser = await User.findById(newUserId);
      if (!targetUser) return;
      
      let welcomeMsg = `Welcome ${targetUser.displayName || targetUser.username}!`;
      if (activeBotStr === 'mars') {
        welcomeMsg = `Welcome aboard, ${targetUser.displayName || targetUser.username}. Don't worry, I'll only judge you a little.`;
      } else {
        welcomeMsg = `Hello ${targetUser.displayName || targetUser.username}! Welcome to the group! ✨`;
      }
      
      await this.sendCustomMessage(chat, io, activeBotId, welcomeMsg);
    } catch(e) {
      console.error('Error in onUserJoinedGroup:', e);
    }
  }
}

const manager = new BotManager();
module.exports = manager;
