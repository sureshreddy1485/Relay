const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { getMicaBotId } = require('./botHelper');
const Groq = require('groq-sdk');
const cleverbot = require('cleverbot-free');
const AliasManager = require('../games/engine/AliasManager');
const GameManager = require('../games/engine/GameManager');
const CommandRegistry = require('../games/engine/CommandRegistry');

class BotEngine {
  constructor() {
    this.micaId = getMicaBotId();
  }

  async processMessage(message, chat, io) {
    if (!this.micaId) this.micaId = getMicaBotId();
    if (!this.micaId) return;

    // Check if the message is from Mica
    if ((message.sender._id || message.sender).toString() === this.micaId.toString()) return;

    const senderName = message.sender.displayName || message.sender.username;
    let text = (message.content || '').trim();
    let lowerText = text.toLowerCase();

    // 1. Check if it's an alias creation command (Admin only check should be inside AliasManager or here)
    if (CommandRegistry.isAliasCommand(text)) {
      const [cmdPart, aliasPart] = text.split('==').map(s => s.trim().toLowerCase());
      if (CommandRegistry.isValidGameCommand(cmdPart) && aliasPart) {
        // TODO: Validate admin
        await AliasManager.setAlias(chat._id, aliasPart, cmdPart);
        return this.sendCustomMessage(chat, io, {
          sender: this.micaId,
          chat: chat._id,
          content: `🧠 Alias created.\n'${aliasPart}' now triggers '${cmdPart}' 😭`,
          messageType: 'text'
        });
      }
    }

    // 2. Resolve Alias -> Command
    let cleanCommandText = text.toLowerCase().replace(/^(?:@?mica\s+)/i, '').trim();
    const resolvedCommand = await AliasManager.resolve(chat._id, cleanCommandText) || cleanCommandText;

    if (resolvedCommand === 'help') {
      return this.sendCustomMessage(chat, io, {
        sender: this.micaId,
        chat: chat._id,
        content: `**✨ System Intelligence ✨**\nHere are the commands I currently support!\n\n🎮 **Games (just type the word!)**\n• riddle\n• guess\n• assassination\n• doubleagent\n• trivia\n\n🛠️ **Utilities**\n• activity\n• leaderboard`,
        messageType: 'text'
      });
    }

    if (resolvedCommand === 'trivia') {
      const triviaQuestions = [
        { q: "What is the capital of France?", opts: ["London", "Berlin", "Paris", "Madrid"] },
        { q: "Which planet is known as the Red Planet?", opts: ["Venus", "Jupiter", "Mars", "Saturn"] },
        { q: "Who painted the Mona Lisa?", opts: ["Van Gogh", "Da Vinci", "Picasso", "Michelangelo"] },
        { q: "What is the largest ocean on Earth?", opts: ["Atlantic", "Indian", "Arctic", "Pacific"] },
        { q: "How many legs does a spider have?", opts: ["6", "8", "10", "12"] }
      ];
      const trivia = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
      
      const pollData = {
        question: `🧠 Trivia: ${trivia.q}`,
        options: trivia.opts.map(opt => ({ text: opt, votes: [] })),
        multipleAnswers: false
      };
      
      return this.sendCustomMessage(chat, io, {
        sender: this.micaId,
        chat: chat._id,
        content: "Here is a trivia question for the group!",
        messageType: 'poll',
        pollData
      });
    }

    if (resolvedCommand === 'activity') {
      try {
        const User = require('../models/User');
        const Message = require('../models/Message');
        const { getRelayBotId } = require('./botHelper');
        const bots = [this.micaId, getRelayBotId()].filter(Boolean);
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
          if (u._id) {
            const name = u._id.displayName || u._id.username;
            lbText += `${i + 1}. ${name} - ${u.count} msgs\n`;
          }
        });
        
        return this.sendCustomMessage(chat, io, {
          sender: this.micaId,
          chat: chat._id,
          content: lbText.trim() + `\n\nKeep the chat alive! 🚀`,
          messageType: 'text'
        });
      } catch (e) {
        console.error('Activity error:', e);
      }
    }

    if (resolvedCommand === 'leaderboard') {
      try {
        const Chat = require('../models/Chat');
        const Message = require('../models/Message');
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
          globalLb += `${i + 1}. ${groupName} - ${g.count} msgs\n`;
        });
        
        return this.sendCustomMessage(chat, io, {
          sender: this.micaId,
          chat: chat._id,
          content: globalLb.trim(),
          messageType: 'text'
        });
      } catch (e) {
        console.error('Leaderboard error:', e);
      }
    }

    // 3. Trigger Game Start
    if (CommandRegistry.isValidGameCommand(resolvedCommand)) {
      const lowerCmd = resolvedCommand.toLowerCase();
      
      if (lowerCmd === 'riddle') {
        const RiddlesGame = require('../games/modes/Riddles');
        return RiddlesGame.start(chat, message.sender, io);
      } else if (lowerCmd === 'guess') {
        const GuessWordGame = require('../games/modes/GuessWord');
        return GuessWordGame.start(chat, message.sender, io);
      } else if (lowerCmd === 'assassination') {
        const AssassinationGame = require('../games/modes/Assassination');
        return AssassinationGame.start(chat, message.sender, io);
      } else if (lowerCmd === 'doubleagent') {
        const DoubleAgentGame = require('../games/modes/DoubleAgent');
        return DoubleAgentGame.start(chat, message.sender, io);
      }
      
      return this.sendCustomMessage(chat, io, {
        sender: this.micaId,
        chat: chat._id,
        content: `🎮 **${resolvedCommand.toUpperCase()}** is still under construction!`,
        messageType: 'text'
      });
    }

    // 4. Route natural messages to active game engine if game is running
    if (GameManager.hasActiveGame(chat._id)) {
      if (lowerText === 'reset') {
        const game = GameManager.getActiveGame(chat._id);
        if (game && typeof game.handleMessage === 'function') {
           // We let the game cleanly handle 'reset' so it clears its own timeouts
           await game.handleMessage(message, chat, io);
        } else {
           // Force purge if game is corrupt
           GameManager.endGame(chat._id);
           this.sendCustomMessage(chat, io, { sender: this.micaId, chat: chat._id, content: "🏳️ **Game forcibly purged from memory.**", messageType: 'text' });
        }
        return;
      }

      const handled = await GameManager.routeToActiveGame(message, chat, io);
      if (handled) return; // If the game swallowed the message, stop normal processing
    }

    // Existing Bot processing below...
    const isMicaInGroup = chat.users?.some(u => (u._id || u).toString() === this.micaId.toString());
    if (!isMicaInGroup) return;

    const content = message.content?.toLowerCase() || '';
    
    // Determine if Mica should reply
    const isMentioned = content.includes('@mica') || /\bmica\b/i.test(content);
    const isCommand = content.startsWith('/mica');
    const isGreeting = /\b(hi|hello|hey|sup)\b/.test(content) && isMentioned;
    
    // Also random chance to playfully respond to chaotic messages (e.g. lots of caps/exclamation marks)
    const isChaotic = message.content && message.content === message.content.toUpperCase() && message.content.length > 10;
    const shouldRandomlyRoast = Math.random() < 0.05 && isChaotic; // 5% chance

    if (isMentioned || isCommand || shouldRandomlyRoast) {
      this.generateAndSendReply(message, chat, io, { isGreeting, isCommand, isChaotic, shouldRandomlyRoast });
    }
  }

  async generateAndSendReply(incomingMsg, chat, io, context) {
    let replyContent = "I'm just a system bot, but I see you!";
    const senderName = incomingMsg.sender.displayName || incomingMsg.sender.username;

    const content = incomingMsg.content.toLowerCase();

    // Dynamic Responses
    if (content.includes('hi mica') || content.includes('hello mica') || content.includes('hey mica')) {
      replyContent = `hi how r u`;
    } else if (context.isGreeting) {
      const greetings = [
        `Hey there ${senderName}! Ready for some chaos?`,
        `What's up ${senderName}? Mica at your service ✌️`,
        `Hellooooo ${senderName}!`,
      ];
      replyContent = greetings[Math.floor(Math.random() * greetings.length)];
    } else if (content.includes('ping')) {
      replyContent = `Pong! I'm alive and watching y'all 👀`;
    } else if (content.includes('roast')) {
      replyContent = `You want a roast, ${senderName}? Your code is so messy even a try-catch block gave up on it. Boom.`;
    } else if (content.includes('joke')) {
      try {
        const res = await fetch('https://v2.jokeapi.dev/joke/Any?type=single');
        const data = await res.json();
        replyContent = data.joke || "Why did the programmer quit his job? Because he didn't get arrays.";
      } catch (e) {
        replyContent = "I couldn't think of a joke right now, sorry!";
      }
    } else if (context.shouldRandomlyRoast) {
      replyContent = `Woah, why are we screaming ${senderName}?! Chill out 😂`;
    } else if (content.match(/remove (\d+)/)) {
      const match = content.match(/remove (\d+)/);
      const numToRemove = parseInt(match[1], 10);
      
      const adminIds = chat.admins ? chat.admins.map(a => a.toString()) : [];
      const ownerId = chat.groupAdmin ? chat.groupAdmin.toString() : '';
      
      let membersToKick = chat.users.filter(u => {
        const id = (u._id || u).toString();
        return id !== this.micaId.toString() && id !== ownerId && !adminIds.includes(id);
      });
      
      membersToKick = membersToKick.slice(0, numToRemove);
      
      if (membersToKick.length === 0) {
        replyContent = `I can't remove anyone! Everyone left is an admin, the owner, or me. 🛡️`;
      } else {
        const idsToRemove = membersToKick.map(u => (u._id || u).toString());
        chat.users = chat.users.filter(u => !idsToRemove.includes((u._id || u).toString()));
        await chat.save();
        
        replyContent = `Done! I just chaotically kicked ${idsToRemove.length} members from the group. 🥾💥`;
      }
    } else {
      try {
        let cleanContent = incomingMsg.content.replace(/@?mica/gi, '').trim();
        if (!cleanContent) cleanContent = 'Hi';
        
        // Use Groq API
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are Mica, a witty, fun, and chaotic AI assistant in a group chat app called Relay. Keep your responses short (1-2 sentences), casual, and use emojis." },
            { role: "user", content: `${senderName} says: ${cleanContent}` }
          ],
          model: "llama-3.1-8b-instant",
          temperature: 0.8,
          max_tokens: 150,
        });
        
        replyContent = chatCompletion.choices[0]?.message?.content || "I have no words... literally.";
      } catch (err) {
          console.error('Groq AI error:', err);
          const genericReplies = [
            `Did someone say my name?`,
            `I'm Mica! Type "mica activity" or "mica leaderboard"!`,
            `You called, ${senderName}?`,
          ];
          replyContent = genericReplies[Math.floor(Math.random() * genericReplies.length)];
      }
    }
    try {
      // Create and send message
      const msgData = {
        sender: this.micaId,
        chat: chat._id,
        content: replyContent,
        messageType: 'text',
      };
      
      let message = await Message.create(msgData);
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
      console.error('Mica reply error:', e);
    }
  }

  async sendCustomMessage(chat, io, msgData) {
    try {
      let message = await Message.create(msgData);
      message = await Message.findById(message._id).populate('sender', 'username displayName profilePicture');

      // Update chat
      await Chat.findByIdAndUpdate(chat._id, { latestMessage: message._id });

      // Emit to all users in chat
      if (io) {
        const leanMsg = message.toObject ? message.toObject() : message;
        chat.users.forEach((userId) => {
          const uId = userId._id || userId;
          io.to(uId.toString()).emit('new_message', leanMsg);
        });
      }
    } catch (e) {
      console.error('Hippy message send error:', e);
    }
  }

  async onUserJoinedGroup(chat, newUserId, io) {
    if (!this.micaId) this.micaId = getMicaBotId();
    if (!this.micaId) return;

    try {
      const newUser = await User.findById(newUserId);
      if (!newUser) return;

      setTimeout(async () => {
        const replyContent = `Welcome to ${chat.chatName}, ${newUser.displayName || newUser.username}! I'm Mica, the group's chaotic system assistant. Try saying "Mica" or typing a command! 🤖`;
        
        const msgData = {
          sender: this.micaId,
          chat: chat._id,
          content: replyContent,
          messageType: 'text',
        };

        let message = await Message.create(msgData);
        message = await Message.findById(message._id).populate('sender', 'username displayName profilePicture');
        await Chat.findByIdAndUpdate(chat._id, { latestMessage: message._id });

        if (io) {
          const leanMsg = message.toObject ? message.toObject() : message;
          chat.users.forEach((userId) => {
            const uId = userId._id || userId;
            io.to(uId.toString()).emit('new_message', leanMsg);
          });
        }
      }, 1500);
    } catch (e) {
      console.error('Hippy welcome error:', e);
    }
  }
}

const engine = new BotEngine();
module.exports = engine;
