const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const broadcastMessage = async (messageContent) => {
  if (!messageContent) {
    console.error('❌ Error: No message content provided.');
    console.log('Usage: node broadcast.js "Your message here"');
    process.exit(1);
  }

  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 2. Find the relay_bot user
    const botUser = await User.findOne({ username: 'relay_bot' });
    if (!botUser) {
      console.error('❌ Error: relay_bot not found in the database. Please create it first.');
      process.exit(1);
    }

    // 3. Get all real users (excluding bots)
    const users = await User.find({ role: 'user', username: { $nin: ['relay_bot', 'relay', 'mica_bot'] } });
    console.log(`📡 Broadcasting to ${users.length} users...`);

    let sentCount = 0;

    for (const user of users) {
      try {
        // 4. Find or create a DM chat between relay_bot and the user
        let chat = await Chat.findOne({
          isGroupChat: false,
          $and: [
            { users: { $elemMatch: { $eq: botUser._id } } },
            { users: { $elemMatch: { $eq: user._id } } }
          ]
        });

        if (!chat) {
          // Create the chat if it doesn't exist
          chat = await Chat.create({
            chatName: 'sender',
            isGroupChat: false,
            users: [botUser._id, user._id],
            theme: 'default'
          });
        }

        // 5. Create and save the message
        const newMessage = await Message.create({
          sender: botUser._id,
          content: messageContent,
          chat: chat._id,
          messageType: 'text'
        });

        // 6. Update latestMessage in Chat
        await Chat.findByIdAndUpdate(chat._id, { latestMessage: newMessage._id });

        sentCount++;
      } catch (err) {
        console.error(`⚠️ Failed to send to user ${user.username}:`, err.message);
      }
    }

    console.log(`🎉 Broadcast complete! Successfully sent to ${sentCount}/${users.length} users.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
  }
};

// Get the message from the command line arguments or environment variables
const args = process.argv.slice(2);
const message = process.env.BROADCAST_MESSAGE || args.join(' ');

broadcastMessage(message);
