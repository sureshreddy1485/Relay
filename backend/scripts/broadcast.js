const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const broadcastMessage = async (messageContent) => {
  if (!messageContent) {
    console.error('❌ Error: No message content provided.');
    console.log('Usage: node broadcast.js "Your message here"');
    process.exit(1);
  }

  try {
    console.log('📡 Hitting live Render API to bypass local DNS blocks...');
    
    // Hit the deployed production API
    const API_URL = 'https://relay-api-jlpx.onrender.com/api/messages/broadcast';
    
    const response = await axios.post(API_URL, {
      content: messageContent,
      adminSecret: process.env.JWT_SECRET
    });

    console.log(`🎉 Broadcast complete! ${response.data.message}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to broadcast:', error.response?.data?.message || error.message);
    process.exit(1);
  }
};

const args = process.argv.slice(2);
const message = process.env.BROADCAST_MESSAGE || args.join(' ');

broadcastMessage(message);
