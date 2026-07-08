const CommandRegistry = {
  isAliasCommand: () => false,
  isValidGameCommand: () => false
};
const AliasManager = {
  resolve: async (chatId, txt) => txt
};

async function test(lowerText) {
  let activeBotStr = null;
  let activeBotId = null;
  let text = lowerText;
  
  const mentionsMica = lowerText.includes('mica');
  const mentionsMars = lowerText.includes('mars');

  if (mentionsMica && !mentionsMars) {
    activeBotStr = 'mica'; activeBotId = 'micaId';
  } else if (mentionsMars && !mentionsMica) {
    activeBotStr = 'mars'; activeBotId = 'marsId';
  } else if (mentionsMica && mentionsMars) {
    if (lowerText.indexOf('mica') < lowerText.indexOf('mars')) {
      activeBotStr = 'mica'; activeBotId = 'micaId';
    } else {
      activeBotStr = 'mars'; activeBotId = 'marsId';
    }
  }

  let cleanCommandText = lowerText;
  if (activeBotStr) {
    cleanCommandText = lowerText.replace(new RegExp(`@?${activeBotStr}\\s*`, 'gi'), '').trim();
  }

  let resolvedCommand = await AliasManager.resolve(null, cleanCommandText) || cleanCommandText;

  if (['games', 'ai', 'stats', 'admin'].includes(resolvedCommand)) {
    resolvedCommand = 'help ' + resolvedCommand;
  }
  if (['play', 'ask', 'rank', 'manage'].includes(resolvedCommand)) {
    resolvedCommand = 'guide ' + resolvedCommand;
  }

  const isStandaloneHelp = resolvedCommand === 'help' || resolvedCommand.startsWith('help ');
  const isStandaloneGuide = resolvedCommand === 'guide' || resolvedCommand.startsWith('guide ');
  const isGameCommand = CommandRegistry.isValidGameCommand(resolvedCommand);
  const standaloneCommands = ['score', 'scores', 'activity', 'leaderboard', 'aliases', 'reset', 'remove'];
  const isStandaloneUtility = standaloneCommands.includes(resolvedCommand.split(' ')[0]) || resolvedCommand.startsWith('summarize ') || resolvedCommand.startsWith('calc ') || resolvedCommand.startsWith('calculate ');
  const isMath = /^[0-9+\-*/().\s]+$/.test(resolvedCommand.replace(/\s+/g, ''));
  
  let effectiveBotStr = activeBotStr;
  let effectiveBotId = activeBotId;

  if (!effectiveBotStr) {
    if (isStandaloneHelp) {
      effectiveBotStr = 'mica';
      effectiveBotId = 'micaId';
    } else if (isStandaloneGuide) {
      effectiveBotStr = 'mars';
      effectiveBotId = 'marsId';
    } else if (isGameCommand || isStandaloneUtility || isMath) {
      const baseCmd = resolvedCommand.split(' ')[0];
      if (['breach', 'suspect', 'play', 'ask', 'rank', 'manage', 'guide'].includes(baseCmd)) {
         effectiveBotStr = 'mars';
         effectiveBotId = 'marsId';
      } else {
         effectiveBotStr = 'mica';
         effectiveBotId = 'micaId';
      }
    } else {
      return console.log(lowerText, "=> RETURNING NULL (Not matched)");
    }
  }

  activeBotStr = effectiveBotStr;
  activeBotId = effectiveBotId;

  if (resolvedCommand === 'help' || resolvedCommand.startsWith('help ')) {
    return console.log(lowerText, "=> HELP triggered as", activeBotStr, "Target:", resolvedCommand.replace('help', '').trim());
  }
  if (resolvedCommand === 'guide' || resolvedCommand.startsWith('guide ')) {
    return console.log(lowerText, "=> GUIDE triggered as", activeBotStr);
  }

  console.log(lowerText, "=> FELL THROUGH");
}

(async () => {
  await test('games');
  await test('mica games');
  await test('ai');
  await test('mica ai');
  await test('stats');
  await test('play');
  await test('mars play');
})();
