const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const broadcastMessage = async (messageContent) => {
  if (!messageContent) {
    console.error('❌ Error: No message content provided.');
    console.log('Usage: node scripts/broadcast.js "Your message here"');
    process.exit(1);
  }

  try {
    console.log('📡 Sending broadcast request to production server...');
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is missing from .env');
    }

    // You can also change this to your local server (e.g. http://localhost:5000) if testing locally.
    const apiUrl = 'https://relay-api-jlpx.onrender.com/api/messages/broadcast';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: messageContent,
        adminSecret: process.env.JWT_SECRET
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Server returned an error');
    }

    console.log(`🎉 Success! ${data.message}`);
  } catch (error) {
    console.error('❌ Failed to broadcast:', error.message);
    process.exit(1);
  }
};

const args = process.argv.slice(2);
const message = process.env.BROADCAST_MESSAGE || args.join(' ');

broadcastMessage(message);
