const dotenv = require('dotenv');
const path = require('path');

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
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: messageContent,
        adminSecret: process.env.JWT_SECRET
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    console.log(`🎉 Broadcast complete! ${data.message}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to broadcast:', error.message);
    process.exit(1);
  }
};

const args = process.argv.slice(2);
const message = process.env.BROADCAST_MESSAGE || args.join(' ');

broadcastMessage(message);
