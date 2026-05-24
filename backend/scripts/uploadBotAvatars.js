/**
 * One-shot script: uploads Mica & Relay avatars to Cloudinary
 * Run: node scripts/uploadBotAvatars.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cloudinary = require('../config/cloudinary');

const ASSETS = path.join(__dirname, '../../frontend/assets');

async function upload(filePath, publicId) {
  const result = await cloudinary.uploader.upload(filePath, {
    public_id: publicId,
    folder: 'relay/profile_pictures',
    overwrite: true,
    resource_type: 'image',
  });
  return result.secure_url;
}

(async () => {
  try {
    console.log('Uploading Mica avatar...');
    const micaUrl = await upload(path.join(ASSETS, 'mica-profile.jpg'), 'mica_bot');
    console.log('✅ Mica URL:', micaUrl);

    console.log('Uploading Relay avatar (favicon)...');
    const relayUrl = await upload(path.join(ASSETS, 'favicon.png'), 'relay_bot');
    console.log('✅ Relay URL:', relayUrl);

    console.log('\n--- Copy these into botHelper.js ---');
    console.log(`MICA  profilePicture: '${micaUrl}'`);
    console.log(`RELAY profilePicture: '${relayUrl}'`);
    process.exit(0);
  } catch (e) {
    console.error('Upload failed:', e.message);
    process.exit(1);
  }
})();
