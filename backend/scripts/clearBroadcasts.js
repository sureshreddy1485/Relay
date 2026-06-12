const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const deleteBroadcasts = async () => {
  console.log('📡 Sending request to delete broadcast messages...');
  try {
    const res = await fetch('https://relay-api-jlpx.onrender.com/api/messages/broadcast', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminSecret: process.env.JWT_SECRET })
    });
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ Success:', data.message);
    } else {
      console.error('❌ Failed:', data.message);
    }
  } catch (e) {
    console.error('❌ Error hitting API:', e.message);
  }
};

deleteBroadcasts();
