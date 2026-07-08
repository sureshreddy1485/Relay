const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const generateRecoveryKey = () => {
  // Format: RELAY-XXXX-XXXX-XXXX-XXXX
  // 16 chars (uppercase letters and numbers)
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    const randomIndex = crypto.randomInt(0, characters.length);
    key += characters[randomIndex];
  }
  
  return `RELAY-${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}`;
};

const hashRecoveryKey = async (plainTextKey) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(plainTextKey, salt);
};

const verifyRecoveryKey = async (inputKey, hashedStoredKey) => {
  if (!inputKey || !hashedStoredKey) return false;
  return await bcrypt.compare(inputKey, hashedStoredKey);
};

module.exports = { generateRecoveryKey, hashRecoveryKey, verifyRecoveryKey };
