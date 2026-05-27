// Diagnostic script: Check if users have FCM tokens saved
// Hits the live Render API so no local DB connection needed
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function checkTokens() {
  const API_URL = 'https://relay-api-jlpx.onrender.com/api/messages/check-tokens';
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Error:', data.message);
      process.exit(1);
    }

    console.log('\n📊 USER TOKEN STATUS:');
    console.log('='.repeat(60));
    for (const user of data.users) {
      const fcm = user.hasFcmToken ? '✅ FCM' : '❌ NO FCM';
      const expo = user.hasExpoToken ? '✅ EXPO' : '❌ NO EXPO';
      console.log(`  ${user.username.padEnd(20)} ${fcm}  |  ${expo}`);
    }
    console.log('='.repeat(60));
    console.log(`\nTotal: ${data.users.length} users`);
    console.log(`With FCM token: ${data.users.filter(u => u.hasFcmToken).length}`);
    console.log(`With Expo token: ${data.users.filter(u => u.hasExpoToken).length}`);
    console.log(`Without ANY token: ${data.users.filter(u => !u.hasFcmToken && !u.hasExpoToken).length}`);
    
    const noFcm = data.users.filter(u => !u.hasFcmToken && u.username !== 'relay_bot' && u.username !== 'mica_bot');
    if (noFcm.length > 0) {
      console.log('\n⚠️  Users WITHOUT FCM token (these users will NOT get background notifications):');
      noFcm.forEach(u => console.log(`   - ${u.username}`));
      console.log('\n💡 These users need to log out and log back in after installing the new APK.');
    }
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }
  process.exit(0);
}

checkTokens();
