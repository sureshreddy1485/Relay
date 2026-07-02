const GameManager = require('../engine/GameManager');
const GameSession = require('../../models/GameSession');

const NAMES = ["Victor", "Gloria", "Desmond", "Elara", "Titus", "Sylvia", "Ronan", "Cassidy", "Malik", "Lena"];
const ROLES = ["The Butler", "The Business Partner", "The Ex", "The Rival", "The Assistant", "The Neighbor", "The Bodyguard", "The Heir", "The Journalist"];
const WEAPONS = ["a poisoned dart", "a heavy wrench", "a silk tie", "a rare snake", "digital sabotage (pacemaker hack)", "an antique dagger", "a falling piano"];
const LOCATIONS = ["the penthouse suite", "the abandoned warehouse", "the moving train", "the underwater lab", "the VIP lounge", "the botanical garden"];

class SuspectGame {
  constructor() {
    this.sessions = new Map();
  }

  generateCase() {
    const { NAMES, ROLES, WEAPONS, LOCATIONS } = require('./SuspectData');

    const shuffledNames = [...NAMES].sort(() => 0.5 - Math.random());
    const shuffledRoles = [...ROLES].sort(() => 0.5 - Math.random());
    
    const suspects = [
      { id: 1, name: shuffledNames[0], role: shuffledRoles[0] },
      { id: 2, name: shuffledNames[1], role: shuffledRoles[1] },
      { id: 3, name: shuffledNames[2], role: shuffledRoles[2] }
    ];

    const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

    const culpritIndex = Math.floor(Math.random() * 3);
    const culprit = suspects[culpritIndex];
    const innocent1 = suspects[(culpritIndex + 1) % 3];
    const innocent2 = suspects[(culpritIndex + 2) % 3];

    const clues = [];

    clues.push(`The victim was found dead in ${location}, killed by ${weapon}.`);

    const alibiIndex = Math.floor(Math.random() * 3);
    const alibiTypes = [
      `Security cameras show ${innocent1.name} (${innocent1.role}) was miles away at the time.`,
      `Several witnesses saw ${innocent1.name} (${innocent1.role}) streaming live on video when it happened.`,
      `The victim's smart watch recorded the exact time of death, and ${innocent1.name} (${innocent1.role}) was on a flight at that exact moment.`
    ];
    clues.push(alibiTypes[alibiIndex]);
    const innocent1Reason = [
      "were seen on camera far away",
      "were broadcasting a live video at the time",
      "were on a flight when the victim died"
    ][alibiIndex];

    const redHerringIndex = Math.floor(Math.random() * 3);
    const redHerring = [
      `${innocent2.name} (${innocent2.role}) hated the victim, but clearly did not have the physical strength to use ${weapon}.`,
      `An angry letter from ${innocent2.name} (${innocent2.role}) was found, but they are terrified of blood.`,
      `${innocent2.name} (${innocent2.role}) owed the victim a lot of money, but their footprints were absolutely nowhere near ${location}.`
    ];
    clues.push(redHerring[redHerringIndex]);
    const innocent2Reason = [
      "were not strong enough to commit the act",
      "are terrified of blood and violence",
      "never left any evidence or footprints at the scene"
    ][redHerringIndex];

    const culpritClueIndex = Math.floor(Math.random() * 3);
    const culpritClue = [
      `A receipt matching the purchase of ${weapon} was found in the trash of ${culprit.name} (${culprit.role}).`,
      `A piece of clothing identical to what ${culprit.name} (${culprit.role}) wears was caught on a door at ${location}.`,
      `Bank records show ${culprit.name} (${culprit.role}) just received a massive financial payout directly tied to this death.`
    ];
    clues.push(culpritClue[culpritClueIndex]);
    const culpritReason1 = [
      `they bought the ${weapon}`,
      "their ripped clothing was left at the scene",
      "they were paid a huge sum for the victim's death"
    ][culpritClueIndex];

    const finalClueIndex = Math.floor(Math.random() * 3);
    const finalClue = [
      `When asked, ${culprit.name} (${culprit.role}) lied about knowing exactly where ${location} was.`,
      `The victim's final text message read: "I'm meeting with ${culprit.role} right now."`,
      `Only ${culprit.name} (${culprit.role}) had the secure access keys needed to enter ${location}.`
    ];
    clues.push(finalClue[finalClueIndex]);
    const culpritReason2 = [
      "lied about knowing the location",
      "were the last person to meet the victim",
      "were the only one with the keys to get inside"
    ][finalClueIndex];

    const firstClue = clues.shift();
    clues.sort(() => 0.5 - Math.random());
    clues.unshift(firstClue);

    const explanation = `Here is what actually happened: **${culprit.name}** did it because ${culpritReason1} and they ${culpritReason2}. ` +
                        `We knew it wasn't ${innocent1.name} because they ${innocent1Reason}. ` +
                        `And ${innocent2.name} couldn't have done it since they ${innocent2Reason}.`;

    return { suspects, clues, culprit, explanation };
  }

  async start(chat, sender, io, botId) {
    const groupId = chat._id;
    const caseData = this.generateCase();
    
    const gameState = {
      gameType: 'suspect',
      status: 'active',
      suspects: caseData.suspects,
      clues: caseData.clues,
      culprit: caseData.culprit,
      explanation: caseData.explanation,
      currentClueIndex: 0,
      startedAt: Date.now(),
      botId: botId
    };

    GameManager.startGame(groupId, this);
    this.sessions.set(groupId.toString(), gameState);

    GameSession.create({
      groupId,
      gameType: 'suspect',
      status: 'active',
      state: gameState
    }).catch(console.error);

    let suspectList = caseData.suspects.map(s => `${s.id}. ${s.name} - ${s.role}`).join('\n');

    await this.sendBotMessage(chat, io, botId, `🔪 **CRIME SCENE ESTABLISHED** 🔪\n\nA murder has occurred. Review the suspects and clues to deduce the killer.\n\n**Suspects:**\n${suspectList}\n\n**Clue 1:** ${gameState.clues[0]}\n\n(Type the suspect's name or number to guess! Type "reset" to give up.)`);

    // Send the next clues every 20 seconds
    gameState.intervalId = setInterval(() => this.sendNextClue(groupId, chat, io), 20000);
  }

  async sendNextClue(groupId, chat, io) {
    const state = this.sessions.get(groupId.toString());
    if (!state || state.status !== 'active') return;

    state.currentClueIndex++;
    if (state.currentClueIndex < state.clues.length) {
      await this.sendBotMessage(chat, io, state.botId, `📂 **Clue ${state.currentClueIndex + 1}:** ${state.clues[state.currentClueIndex]}`);
    } else {
      if (state.intervalId) clearInterval(state.intervalId);
      await this.sendBotMessage(chat, io, state.botId, `⚠️ All clues have been revealed. Who is the killer? (Type their name or number)`);
    }
  }

  async handleMessage(message, chat, io) {
    const groupId = chat._id.toString();
    const state = this.sessions.get(groupId);
    
    if (!state || state.status !== 'active') return false;

    const text = (message.content || '').toLowerCase().trim();

    if (text === 'reset') {
      if (state.intervalId) clearInterval(state.intervalId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      await this.sendBotMessage(chat, io, state.botId, `🏳️ Case closed unsolved. The killer was **${state.culprit.name} (${state.culprit.role})**.\n\n${state.explanation}`);
      return true;
    }

    // Check if guess matches culprit (by name or id)
    const isCulpritName = text.includes(state.culprit.name.toLowerCase());
    const isCulpritId = text === state.culprit.id.toString();

    // Check if guess matches innocents
    const isInnocent = state.suspects.some(s => s.id !== state.culprit.id && (text.includes(s.name.toLowerCase()) || text === s.id.toString()));

    if (isCulpritName || isCulpritId) {
      if (state.intervalId) clearInterval(state.intervalId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      
      const winnerName = message.sender.displayName || message.sender.username;
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      const newScore = await GameManager.incrementScore(groupId, message.sender._id || message.sender, 5);

      await this.sendBotMessage(chat, io, state.botId, `🚨 **CASE SOLVED!**\n\n${winnerName} correctly identified the killer: **${state.culprit.name} (${state.culprit.role})**!\n\n${state.explanation}\n\nScore: ${newScore} pts. Nice detective work.`);
      return true;
    } else if (isInnocent) {
      // Wrong guess
      if (state.intervalId) clearInterval(state.intervalId);
      state.status = 'finished';
      GameManager.endGame(groupId);
      this.sessions.delete(groupId);
      
      GameSession.findOneAndUpdate({ groupId: chat._id, status: 'active' }, { status: 'finished' }).catch(console.error);
      
      await this.sendBotMessage(chat, io, state.botId, `❌ **WRONG SUSPECT!**\n\nYou arrested an innocent person. The real killer was **${state.culprit.name} (${state.culprit.role})**.\n\n${state.explanation}`);
      return true;
    }

    return false;
  }

  async sendBotMessage(chat, io, botId, content) {
    const botManager = require('../../utils/BotManager');
    await botManager.sendCustomMessage(chat, io, botId, content, 'text');
  }
}

module.exports = new SuspectGame();
