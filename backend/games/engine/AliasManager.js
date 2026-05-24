const GroupGameSettings = require('../../models/GroupGameSettings');

class AliasManager {
  constructor() {
    this.cache = new Map(); // groupId -> { alias -> command }
  }

  async loadGroupSettings(groupId) {
    if (this.cache.has(groupId.toString())) return this.cache.get(groupId.toString());
    
    let settings = await GroupGameSettings.findOne({ groupId });
    if (!settings) {
      settings = await GroupGameSettings.create({ groupId, aliases: {} });
    }
    
    // Convert Map to plain object for cache
    const aliasObj = {};
    if (settings.aliases) {
      for (const [key, value] of settings.aliases.entries()) {
        aliasObj[key] = value;
      }
    }
    this.cache.set(groupId.toString(), aliasObj);
    return aliasObj;
  }

  async resolve(groupId, text) {
    const cleanText = text.trim().toLowerCase();
    const aliases = await this.loadGroupSettings(groupId);
    if (aliases[cleanText]) {
      return aliases[cleanText];
    }
    return null;
  }

  async setAlias(groupId, alias, command) {
    const cleanAlias = alias.trim().toLowerCase();
    const cleanCommand = command.trim().toLowerCase();

    // Prevent spaces or long aliases
    if (cleanAlias.includes(' ') || cleanAlias.length > 20) {
      throw new Error('Invalid alias format. Aliases cannot contain spaces and must be short.');
    }

    const settings = await GroupGameSettings.findOneAndUpdate(
      { groupId },
      { $set: { [`aliases.${cleanAlias}`]: cleanCommand } },
      { new: true, upsert: true }
    );

    // Update cache
    const aliases = await this.loadGroupSettings(groupId);
    aliases[cleanAlias] = cleanCommand;
    this.cache.set(groupId.toString(), aliases);
    
    return true;
  }
}

module.exports = new AliasManager();
