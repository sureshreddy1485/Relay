const CryptoJS = require('crypto-js');

const encryptSecurityKey = (key) => {
  return CryptoJS.AES.encrypt(key, process.env.SECURITY_KEY_SECRET).toString();
};

const decryptSecurityKey = (encryptedKey) => {
  const bytes = CryptoJS.AES.decrypt(encryptedKey, process.env.SECURITY_KEY_SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
};

const verifySecurityKey = (inputKey, encryptedStoredKey) => {
  const decrypted = decryptSecurityKey(encryptedStoredKey);
  return decrypted === inputKey;
};

module.exports = { encryptSecurityKey, decryptSecurityKey, verifySecurityKey };
