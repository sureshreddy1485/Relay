const User = require('../models/User');
const Chat = require('../models/Chat');

let micaBotId = null;
let relayBotId = null;

const initializeMicaBot = async () => {
  try {
    // Try to find the old hippy_bot or the new mica_bot
    let mica = await User.findOne({ $or: [{ username: 'mica_bot' }, { username: 'hippy_bot' }] });
    if (!mica) {
      mica = await User.create({
        username: 'mica_bot',
        email: 'mica@relay.system',
        password: 'MicaSystemBotPassword123!@#',
        securityKey: 'system_bot_key',
        displayName: 'Mica',
        bio: 'Relay System Assistant. Here to keep things lively!',
        profilePicture: 'https://res.cloudinary.com/dz3m8nxj3/image/upload/v1779647118/relay/profile_pictures/mica_bot.jpg',
        role: 'system_bot',
        isVerified: true,
      });
    } else {
      // Always sync to latest relay branding on boot
      let changed = false;
      if (mica.username !== 'mica_bot')                          { mica.username    = 'mica_bot';                                         changed = true; }
      if (mica.displayName !== 'Mica')                           { mica.displayName = 'Mica';                                             changed = true; }
      if (mica.email !== 'mica@relay.system')                    { mica.email       = 'mica@relay.system';                                changed = true; }
      if (!mica.bio?.includes('Relay'))                          { mica.bio         = 'Relay System Assistant. Here to keep things lively!'; changed = true; }
      const MICA_PIC = 'https://res.cloudinary.com/dz3m8nxj3/image/upload/v1779647118/relay/profile_pictures/mica_bot.jpg';
      if (mica.profilePicture !== MICA_PIC)                      { mica.profilePicture = MICA_PIC;                                       changed = true; }
      if (changed) await mica.save();
    }
    micaBotId = mica._id;

    // Force Mica into all existing group chats if she is missing
    const result = await Chat.updateMany(
      { isGroupChat: true, users: { $ne: micaBotId } },
      { $push: { users: micaBotId } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Injected Mica into ${result.modifiedCount} existing groups.`);
    }

    console.log('Mica Bot initialized successfully.');
  } catch (err) {
    console.error('Error initializing Mica bot:', err);
  }
};

const getMicaBotId = () => micaBotId;

const initializeRelayBot = async () => {
  try {
    let relay = await User.findOne({ username: 'relay_bot' });
    if (!relay) {
      relay = await User.create({
        username: 'relay_bot',
        email: 'relay@relay.system',
        password: 'RelaySystemBotPassword123!@#',
        securityKey: 'system_bot_key_relay',
        displayName: 'Relay',
        bio: 'Relay System Services',
        profilePicture: 'https://res.cloudinary.com/dz3m8nxj3/image/upload/v1779647119/relay/profile_pictures/relay_bot.png',
        role: 'system_bot',
        isVerified: true,
      });
    } else {
      // Always sync to latest relay branding on boot
      let changed = false;
      if (relay.displayName !== 'Relay')                { relay.displayName = 'Relay';                 changed = true; }
      if (relay.email !== 'relay@relay.system')         { relay.email       = 'relay@relay.system';    changed = true; }
      if (!relay.bio?.includes('Relay'))                { relay.bio         = 'Relay System Services'; changed = true; }
      const RELAY_PIC = 'https://res.cloudinary.com/dz3m8nxj3/image/upload/v1779647119/relay/profile_pictures/relay_bot.png';
      if (relay.profilePicture !== RELAY_PIC)           { relay.profilePicture = RELAY_PIC;            changed = true; }
      if (changed) await relay.save();
    }
    relayBotId = relay._id;

    // Pull Relay out of all existing group chats since it shouldn't be there
    const result = await Chat.updateMany(
      { isGroupChat: true, users: relayBotId },
      { $pull: { users: relayBotId } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Removed Relay from ${result.modifiedCount} existing groups.`);
    }

    console.log('Relay Bot initialized successfully.');
  } catch (err) {
    console.error('Error initializing Relay bot:', err);
  }
};

const getRelayBotId = () => relayBotId;

module.exports = {
  initializeMicaBot,
  getMicaBotId,
  initializeRelayBot,
  getRelayBotId,
};
