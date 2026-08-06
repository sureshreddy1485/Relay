const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Story = require('../models/Story');
const GameSession = require('../models/GameSession');
const GroupGameSettings = require('../models/GroupGameSettings');
const PlayerGameStats = require('../models/PlayerGameStats');
const { initializeMicaBot, initializeRelayBot, initializeMarsBot } = require('../utils/botHelper');

const resetDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB database...');
    await connectDB();

    console.log('\n🧹 Starting Database Reset...');

    // 1. Delete all messages
    const deletedMessages = await Message.deleteMany({});
    console.log(`✅ Messages cleared: ${deletedMessages.deletedCount}`);

    // 2. Delete all chats
    const deletedChats = await Chat.deleteMany({});
    console.log(`✅ Chats cleared: ${deletedChats.deletedCount}`);

    // 3. Delete all stories / moments
    const deletedStories = await Story.deleteMany({});
    console.log(`✅ Stories cleared: ${deletedStories.deletedCount}`);

    // 4. Delete game sessions & stats
    const deletedSessions = await GameSession.deleteMany({});
    const deletedSettings = await GroupGameSettings.deleteMany({});
    const deletedStats = await PlayerGameStats.deleteMany({});
    console.log(`✅ Game Data cleared: ${deletedSessions.deletedCount + deletedSettings.deletedCount + deletedStats.deletedCount}`);

    // 5. Delete all user accounts EXCEPT Mica, Relay, and Mars (Bots are kept intact and NOT erased)
    const BOT_USERNAMES = ['mica_bot', 'relay_bot', 'mars_bot'];
    const deletedUsers = await User.deleteMany({
      username: { $nin: BOT_USERNAMES },
      role: { $ne: 'system_bot' }
    });
    console.log(`✅ All Regular Users cleared: ${deletedUsers.deletedCount}`);

    // 6. Ensure System Bots (Mica, Relay, Mars) are verified & active
    console.log('\n🤖 Verifying System Bots (Mica, Relay, Mars)...');
    await initializeMicaBot();
    await initializeRelayBot();
    await initializeMarsBot();

    const remainingBots = await User.find({ username: { $in: BOT_USERNAMES } }, 'username displayName email role');
    console.log('\n✨ Preserved System Bots in Database (NOT erased):');
    remainingBots.forEach(bot => {
      console.log(` - ${bot.displayName} (@${bot.username}) [${bot.email}]`);
    });

    console.log('\n🎉 DATABASE RESET COMPLETE! All user data wiped while Mica, Relay, and Mars remain active.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
    process.exit(1);
  }
};

resetDatabase();
