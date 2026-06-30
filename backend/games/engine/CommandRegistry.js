const GAME_COMMANDS = ['riddle', 'guess', 'assassination', 'doubleagent', 'mafia', 'scramble', 'jumble', 'reset', 'emojiguess', 'breach', 'suspect'];

class CommandRegistry {
  static isValidGameCommand(command) {
    return GAME_COMMANDS.includes(command.toLowerCase());
  }

  static isAliasCommand(text) {
    return text.includes('=');
  }
}

module.exports = CommandRegistry;
