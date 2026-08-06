const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const resetProductionDB = async () => {
  console.log('⚠️ Sending request to reset Production Database on Render...');
  try {
    const res = await fetch('https://relay-api-jlpx.onrender.com/api/messages/reset-db', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminSecret: process.env.JWT_SECRET })
    });
    const data = await res.json();
    
    if (res.ok) {
      console.log('🎉 SUCCESS:', data.message);
    } else {
      console.error('❌ Failed:', data.message);
    }
  } catch (e) {
    console.error('❌ Error hitting API:', e.message);
  }
};

resetProductionDB();
