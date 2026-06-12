const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sendWelcomeBroadcast = async () => {
  const content = `🚀 **WELCOME TO RELAY V1.0** 🚀

We are thrilled to officially welcome you to Relay — the lightning-fast, ultra-secure messaging platform. We've packed this release with incredible features. Here is your official patch note guide to everything you can do:

💬 **Instant Messaging & Media**
Chat with your friends effortlessly. Send texts, voice notes, photos, and files. Made a typo? You have 15 minutes to edit your messages.

👻 **Disappearing Messages**
Privacy is our priority. Tap the '+' button to send 'View Once' media, or enable disappearing messages in any chat's settings to have all messages self-destruct automatically.

🤖 **Meet Mica & Mars (AI Bots)**
Relay features two native AI companions! Mica is helpful and friendly. Mars is sarcastic and witty. In any group chat, admins can instantly switch the active bot by typing \`!swap\`. Ask them anything!

🎮 **Play Games & Compete**
Bored? Just type \`!scramble\` in any group chat with Mica or Mars. The bot will jumble a word, and everyone can race to solve it. Your scores are tracked on the Global Leaderboard!

👥 **Communities & Group Tags**
Build your community by creating Group Chats. Every group has a unique 'Group Tag' that others can search to join instantly!

🔔 **Native Stacked Notifications**
Even if your app is completely closed, our native background engine ensures you never miss a message. You can even reply and mark messages as read directly from your lock screen.

🔒 **Privacy Control**
Go to Settings to fine-tune your visibility. Hide your Last Seen, Profile Picture, or Read Receipts whenever you want.

We hope you love using Relay as much as we loved building it. Enjoy chatting!`;

  console.log('📡 Sending Welcome Broadcast...');
  try {
    const res = await fetch('https://relay-api-jlpx.onrender.com/api/messages/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content,
        adminSecret: process.env.JWT_SECRET
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ Success:', data);
    } else {
      console.error('❌ Failed:', data);
    }
  } catch (e) {
    console.error('❌ Error hitting API:', e.message);
  }
};

sendWelcomeBroadcast();
