const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.log('=========================================');
console.log('🚀 RELAY ONE-CLICK PUBLISH UTILITY');
console.log('=========================================');
console.log('📝 Enter your update notes (patch notes) below.');
console.log('Press Ctrl+C to cancel, or type "DONE" on a new line and press Enter to publish:');
console.log('-----------------------------------------');

let messageLines = [];

rl.on('line', (line) => {
  if (line.trim() === 'DONE') {
    processUpdate();
  } else {
    messageLines.push(line);
  }
});

function processUpdate() {
  const message = messageLines.join('\n').trim();

  if (!message) {
    console.log('❌ Update cancelled: Message cannot be empty.');
    process.exit(0);
  }

  console.log('\n📦 1. Sending OTA Update to all users...');
  try {
    console.log('Pushing to production branch...');
    execSync(`cd frontend && npx eas update --branch production --message "${message.replace(/"/g, '\\"')}" --clear-cache`, { stdio: 'inherit' });
    console.log('Pushing to preview branch...');
    execSync(`cd frontend && npx eas update --branch preview --message "${message.replace(/"/g, '\\"')}" --clear-cache`, { stdio: 'inherit' });
    console.log('✅ OTA Update published successfully!');
  } catch (e) {
    console.log('❌ Failed to publish OTA update.');
    process.exit(1);
  }

  console.log('\n📢 2. Broadcasting update message to users via relay_bot...');
  try {
    const formattedMessage = `🚀 **New Update Available!**\n\n${message}\n\n*(Your app will ask you to restart automatically to apply this update!)*`;

    // Pass message via env var to avoid escaping issues
    execSync(`node scripts/broadcast.js`, {
      cwd: './backend',
      stdio: 'inherit',
      env: { ...process.env, BROADCAST_MESSAGE: formattedMessage }
    });
    console.log('✅ Broadcast sent successfully!');
  } catch (e) {
    console.log('❌ Failed to send broadcast.', e.message);
  }

  console.log('\n🎉 ALL DONE! Your app is updated and your users have been notified.');
  process.exit(0);
}
