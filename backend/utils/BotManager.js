const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const GroupGameSettings = require('../models/GroupGameSettings');
const { getMicaBotId, getMarsBotId, getRelayBotId } = require('./botHelper');
const Groq = require('groq-sdk');
const AliasManager = require('../games/engine/AliasManager');
const GameManager = require('../games/engine/GameManager');
const CommandRegistry = require('../games/engine/CommandRegistry');
const math = require('mathjs');

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

    let text = (message.content || '').trim();
    let lowerText = text.toLowerCase();
    
    // Determine active bot based on mention
    let activeBotStr = null;
    let activeBotId = null;

    const mentionsMica = lowerText.includes('mica');
    const mentionsMars = lowerText.includes('mars');

    if (mentionsMica && !mentionsMars) {
      activeBotStr = 'mica';
      activeBotId = micaId;
    } else if (mentionsMars && !mentionsMica) {
      activeBotStr = 'mars';
      activeBotId = marsId;
    } else if (mentionsMica && mentionsMars) {
      // Tie breaker: whoever was mentioned first
      if (lowerText.indexOf('mica') < lowerText.indexOf('mars')) {
        activeBotStr = 'mica';
        activeBotId = micaId;
      } else {
        activeBotStr = 'mars';
        activeBotId = marsId;
      }
    }

    const isGroupAdmin = chat.isGroupChat && ((chat.groupAdmin && chat.groupAdmin.toString() === senderId) || (chat.admins && chat.admins.some(a => a.toString() === senderId)));

    // Default to mica for non-bot-specific game routing if no bot is mentioned
    const routingBotId = activeBotId || micaId;
    const routingBotStr = activeBotStr || 'mica';

    // GAME ROUTING (Always check this even if no bot is mentioned)
    if (GameManager.hasActiveGame(chat._id)) {
      if (lowerText === 'reset' || (activeBotStr && lowerText.replace(new RegExp(`@?${activeBotStr}\\s*`, 'gi'), '').trim() === 'reset')) {
        const game = GameManager.getActiveGame(chat._id);
        if (game && typeof game.handleMessage === 'function') {
           message.content = 'reset';
           await game.handleMessage(message, chat, io);
        } else {
           GameManager.endGame(chat._id);
           this.sendCustomMessage(chat, io, routingBotId, routingBotStr === 'mars' ? "Fine. I killed the game. Are you happy now?" : "🏳️ **Game forcibly purged from memory.**");
        }
        return;
      }

      const handled = await GameManager.routeToActiveGame(message, chat, io);
      if (handled) return; 

      const activeGame = GameManager.getActiveGame(chat._id);
      if (activeGame && ['ScrambleGame', 'GuessWordGame', 'RiddlesGame', 'EmojiGuessGame', 'BreachGame', 'SuspectGame'].includes(activeGame.constructor.name)) {
         return; // suppress chatter during word games
      }
    }

    let cleanCommandText = lowerText;
    if (activeBotStr) {
      cleanCommandText = lowerText.replace(new RegExp(`@?${activeBotStr}\\s*`, 'gi'), '').trim();
    }

    // Process aliases
    if (CommandRegistry.isAliasCommand(text)) {
      const [part1, part2] = text.split(/==?/).map(s => s.trim().toLowerCase());
      let cmdPart = part1, aliasPart = part2;
      
      if (!CommandRegistry.isValidGameCommand(cmdPart) && CommandRegistry.isValidGameCommand(part2)) {
        cmdPart = part2;
        aliasPart = part1;
      }

      if (CommandRegistry.isValidGameCommand(cmdPart) && aliasPart) {
        await AliasManager.setAlias(chat._id, aliasPart, cmdPart);
        const reply = (activeBotStr === 'mars') 
          ? `Interesting choice. '${aliasPart}' now triggers '${cmdPart}'.` 
          : `Done! '${aliasPart}' will now trigger '${cmdPart}'.`;
        return this.sendCustomMessage(chat, io, routingBotId, reply);
      }
    }

    let resolvedCommand = await AliasManager.resolve(chat._id, cleanCommandText) || cleanCommandText;

    if (['games', 'ai', 'stats', 'admin'].includes(resolvedCommand)) {
      resolvedCommand = 'help ' + resolvedCommand;
    }
    if (['play', 'ask', 'rank', 'manage'].includes(resolvedCommand)) {
      resolvedCommand = 'guide ' + resolvedCommand;
    }

    const isStandaloneHelp = resolvedCommand === 'help' || resolvedCommand.startsWith('help ');
    const isStandaloneGuide = resolvedCommand === 'guide' || resolvedCommand.startsWith('guide ');
    const isGameCommand = CommandRegistry.isValidGameCommand(resolvedCommand);
    const standaloneCommands = ['score', 'scores', 'activity', 'leaderboard', 'aliases', 'reset', 'remove'];
    const isStandaloneUtility = standaloneCommands.includes(resolvedCommand.split(' ')[0]) || resolvedCommand.startsWith('summarize ') || resolvedCommand.startsWith('calc ') || resolvedCommand.startsWith('calculate ');
    const isMath = /^[0-9+\-*/().\s]+$/.test(resolvedCommand.replace(/\s+/g, ''));
    
    let effectiveBotStr = activeBotStr;
    let effectiveBotId = activeBotId;

    if (!effectiveBotStr) {
      if (isStandaloneHelp) {
        effectiveBotStr = 'mica';
        effectiveBotId = micaId;
      } else if (isStandaloneGuide) {
        effectiveBotStr = 'mars';
        effectiveBotId = marsId;
      } else if (isGameCommand || isStandaloneUtility || isMath) {
        const baseCmd = resolvedCommand.split(' ')[0];
        if (['breach', 'suspect', 'play', 'ask', 'rank', 'manage', 'guide'].includes(baseCmd)) {
           effectiveBotStr = 'mars';
           effectiveBotId = marsId;
        } else {
           effectiveBotStr = 'mica';
           effectiveBotId = micaId;
        }
      } else {
        return; 
      }
    }

    activeBotStr = effectiveBotStr;
    activeBotId = effectiveBotId;

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
            helpText = "**Utility: Summarize** 📝\nUse `summarize <text>` to have the AI automatically provide a concise summary of the given text.";
            break;
          case 'calculate':
          case 'calc':
            helpText = "**Utility: Math** 🧮\nSend any simple math expression (like `20/2` or `5 * (10 + 2)`) and the AI will calculate the result.";
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
            helpText = `**🎮 Mica's Games**\n• riddle\n• guess\n• emojiguess\n• scramble (or jumble)\n• doubleagent\n• mafia\n• assassination\n\n💡 **Tip: For a deep dive or rules, type \`help <game>\` — e.g. \`help riddle\`**`;
            break;
          case 'ai':
            helpText = `**🤖 Mica's AI & Smart Tools**\n\n• summarize <text>\n• Just type any math expression (e.g. \`20/2\`)!\n\n💡 **Tip: For more details, type \`help <tool>\` — e.g. \`help summarize\`**`;
            break;
          case 'stats':
            helpText = `**📈 Mica's Stats & Leaderboards**\n\n• score\n• activity\n• leaderboard\n\n💡 **Tip: For a deep dive, type \`help <command>\` — e.g. \`help score\`**`;
            break;
          case 'admin':
            helpText = `**🛠️ Mica's Group Management**\n\n• aliases\n• remove <alias>\n• remove inactive <days>\n• reset\n\n💡 **Tip: For a deep dive, type \`help <command>\` — e.g. \`help aliases\`**`;
            break;
          default:
            helpText = `I don't have a help page for '${helpTarget}'. Try asking about a specific category like 'help games'.`;
        }
        return this.sendCustomMessage(chat, io, micaId, helpText);
      } else {
        const reply = `**🤖 Mica's Commands 🤖**\n\n**Categories:**\n• games\n• ai\n• stats\n• admin\n\n💡 *Tip: Type \`help <category>\` (e.g. \`help games\`) for details!*`;
        return this.sendCustomMessage(chat, io, micaId, reply);
      }
    }

    if (resolvedCommand === 'guide' || resolvedCommand.startsWith('guide ')) {
      const helpTarget = resolvedCommand.replace('guide', '').trim().toLowerCase();
      
      if (helpTarget) {
        let helpText = '';
        switch (helpTarget) {
          case 'breach':
            helpText = "**Game: Breach** 💻\nHack a 4-digit PIN before you get locked out. Feedback is + for correct digit and position, - for correct digit wrong position. 10 tries.";
            break;
          case 'suspect':
            helpText = "**Game: Suspect** 🕵️‍♂️\nSolve a crime scene puzzle. You get clues about the suspect, weapon, and location. Make a deduction.";
            break;
          case 'play':
            helpText = `**🎮 Mars Operations**\n• breach (Hack a 4-digit PIN)\n• suspect (Solve a crime scene)\n\n💡 **Tip: Don't ask me for rules. Figure it out.**`;
            break;
          case 'ask':
            helpText = `**🤖 Mars's AI & Smart Tools**\n\n• summarize <text>\n• Math expressions (e.g. \`20/2\`)\n\n💡 **Tip: Type \`guide summarize\` if you really need instructions.**`;
            break;
          case 'rank':
            helpText = `**📈 Mars's Stats & Leaderboards**\n\n• score\n\n💡 **Tip: I don't do activity or global leaderboards. Type \`guide score\` if you really want to see who's losing.**`;
            break;
          case 'manage':
            helpText = `**🛠️ Mars's Group Management**\n\n• aliases\n• remove <alias>\n• remove inactive <days>\n• reset\n\n💡 **Tip: Type \`guide <command>\` for details. Try \`guide remove\` if you want to kick dead weight.**`;
            break;
          case 'aliases':
            helpText = "**Utility: Aliases** 🔗\nShows a list of aliases. Create one by typing `command = my_alias`.";
            break;
          case 'remove':
            helpText = "**Utility: Remove** 🗑️\nUse `remove <alias_name>` to delete an alias.\nUse `remove inactive <days>` to kick dead weight.";
            break;
          case 'summarize':
            helpText = "**Utility: Summarize** 📝\nUse `summarize <text>` to have me summarize it. Try not to bore me.";
            break;
          case 'score':
          case 'scores':
            helpText = "**Utility: Score** 🏆\nShows the leaderboard. Type it to see who's losing.";
            break;
          case 'reset':
            helpText = "**Utility: Reset** 🛑\nStops the currently running operation.";
            break;
          default:
            helpText = `I don't have a guide page for '${helpTarget}'. You're on your own.`;
        }
        return this.sendCustomMessage(chat, io, marsId, helpText);
      } else {
        const reply = `**🤖 Mars's Commands 🤖**\n\n**Operations:**\n• play\n• ask\n• rank\n• manage\n\n💡 *Tip: Type \`guide <category>\` (e.g. \`guide play\`) for details!*`;
        return this.sendCustomMessage(chat, io, marsId, reply);
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
    if (cleanCommandText.startsWith('summarize ')) {
       const textToSummarize = cleanCommandText.replace('summarize ', '').trim();
       if (!textToSummarize) return this.sendCustomMessage(chat, io, activeBotId, "Please provide some text to summarize. (e.g. `summarize This is a long story...`)");

       try {
           const apiKey = activeBotStr === 'mars' ? process.env.MARS_GROQ_API_KEY : process.env.MICA_GROQ_API_KEY;
           const model = activeBotStr === 'mars' ? 'qwen/qwen3.6-27b' : 'openai/gpt-oss-120b';
           const systemPrompt = activeBotStr === 'mars'
             ? 'You are Mars, a sarcastic, slightly arrogant assistant. Summarize the text provided by the user, but add a slightly mocking tone about how long-winded they are. Keep it short.'
             : 'You are Mica, a smart, concise AI assistant. Provide a brief summary of the text provided by the user. Keep it short and to the point.';
             
           const botGroq = new Groq({ apiKey });
           const completion = await botGroq.chat.completions.create({
               messages: [
                 { role: 'system', content: systemPrompt },
                 { role: 'user', content: textToSummarize }
               ],
               model: model,
           });
           const summary = completion.choices[0]?.message?.content || "Sorry, I couldn't summarize that.";
           return this.sendCustomMessage(chat, io, activeBotId, `📝 **Summary:**\n${summary}`);
       } catch (error) {
           console.error("Groq summarize error:", error);
           return this.sendCustomMessage(chat, io, activeBotId, "Sorry, my summarization engine is currently down.");
       }
    }

    // Math calculation (implicit or explicit)
    if (/^[0-9+\-*/().\s]+$/.test(cleanCommandText)) {
       try {
           const mathExpr = cleanCommandText.replace(/\s+/g, '');
           if (/[+\-*/]/.test(mathExpr) && /[0-9]/.test(mathExpr)) {
               const result = math.evaluate(mathExpr);
               if (typeof result === 'number' && isFinite(result)) {
                   let formattedResult = Number.isInteger(result) ? result.toFixed(1) : parseFloat(result.toFixed(4)).toString();
                   if (activeBotStr === 'mars') {
                     const mathDialogues = [
                       `${formattedResult}. You couldn't do that yourself?`,
                       `You really needed my processing power for this? It's ${formattedResult}.`,
                       `${formattedResult}. Next time use a calculator.`,
                       `I'm a highly advanced AI, not a TI-84. The answer is ${formattedResult}.`
                     ];
                     const msg = mathDialogues[Math.floor(Math.random() * mathDialogues.length)];
                     return this.sendCustomMessage(chat, io, activeBotId, msg);
                   }
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

      const marsGameEngineMap = {
        'breach': '../games/modes/Breach',
        'suspect': '../games/modes/Suspect'
      };

      if (gameEngineMap[lowerCmd]) {
        if (activeBotStr === 'mars') {
           return this.sendCustomMessage(chat, io, activeBotId, "I don't play those silly games. Ask Mica.");
        }
        const GameClass = require(gameEngineMap[lowerCmd]);
        return GameClass.start(chat, message.sender, io, activeBotId);
      }

      if (marsGameEngineMap[lowerCmd]) {
        if (activeBotStr === 'mica') {
           return this.sendCustomMessage(chat, io, activeBotId, "I don't know how to run that operation! Ask Mars! ✨");
        }
        const GameClass = require(marsGameEngineMap[lowerCmd]);
        return GameClass.start(chat, message.sender, io, activeBotId);
      }
    }



    // AI CHAT
    const isBotInGroup = chat.users?.some(u => {
      const id = (u._id || u).toString();
      return id === micaId.toString() || id === marsId.toString();
    });
    
    if (!isBotInGroup) return;

    const isMentioned = text.toLowerCase().includes(activeBotStr);
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
        model: botStr === 'mars' ? 'qwen/qwen3.6-27b' : 'openai/gpt-oss-120b',
        temperature: 0.8,
        max_tokens: 150,
      });
      
      replyContent = chatCompletion.choices[0]?.message?.content || "I have no words.";
    } catch (err) {
        console.error(`Groq AI error (${botStr}):`, err);
        replyContent = "I'm having a bit of a technical hiccup. Ask me again in a moment?";
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
                  body: `[${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase()}] ${content.replace(/[*_~`]/g, '')}`,
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

  // Called by games to know which bot to respond as.
  // Legacy games (Mica exclusive) use this, so it always returns Mica.
  async getActiveBotId(groupId) {
    return getMicaBotId();
  }

  async getActiveBotStr(groupId) {
    return 'mica';
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
