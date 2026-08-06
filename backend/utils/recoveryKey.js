const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const generateSingleCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, characters.length);
    key += characters[randomIndex];
  }
  return `RELAY-${key.slice(0, 4)}-${key.slice(4, 8)}`;
};

const generateRecoveryKeys = (count = 9) => {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(generateSingleCode());
  }
  return keys;
};

// Backward compatibility alias
const generateRecoveryKey = () => generateSingleCode();

const hashRecoveryKey = async (plainTextKey) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainTextKey, salt);
};

const hashRecoveryKeys = async (plainTextKeys) => {
  const salt = await bcrypt.genSalt(10);
  const hashedArray = [];
  for (const k of plainTextKeys) {
    const hashed = await bcrypt.hash(k, salt);
    hashedArray.push({ code: hashed, used: false });
  }
  return hashedArray;
};

const verifyRecoveryCode = async (inputCode, storedUser) => {
  if (!inputCode || !storedUser) return { valid: false };

  const cleanInput = inputCode.trim().toUpperCase();

  // 1. Check array of recovery keys
  if (Array.isArray(storedUser.recoveryKeys) && storedUser.recoveryKeys.length > 0) {
    for (let i = 0; i < storedUser.recoveryKeys.length; i++) {
      const item = storedUser.recoveryKeys[i];
      if (!item.used && item.code) {
        const isMatch = await bcrypt.compare(cleanInput, item.code);
        if (isMatch) {
          return { valid: true, keyIndex: i, isArray: true };
        }
      }
    }
  }

  // 2. Check legacy single recovery key
  if (storedUser.recoveryKey) {
    const isMatch = await bcrypt.compare(cleanInput, storedUser.recoveryKey);
    if (isMatch) {
      return { valid: true, isLegacy: true };
    }
  }

  return { valid: false };
};

const verifyRecoveryKey = async (inputKey, hashedStoredKey) => {
  if (!inputKey || !hashedStoredKey) return false;
  return await bcrypt.compare(inputKey.trim().toUpperCase(), hashedStoredKey);
};

module.exports = {
  generateRecoveryKeys,
  generateRecoveryKey,
  hashRecoveryKey,
  hashRecoveryKeys,
  verifyRecoveryCode,
  verifyRecoveryKey
};
