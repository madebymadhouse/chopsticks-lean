// src/tools/leveling/levelingController.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

const VOICE_XP_PER_MIN = 5;
const MESSAGE_XP = 2;

function ensureUser(data, userId) {
  if (!data.leveling) data.leveling = {};
  if (!data.leveling[userId]) {
    data.leveling[userId] = {
      xp: 0,
      level: 0,
      voiceStart: null
    };
  }
  return data.leveling[userId];
}

function xpForLevel(level) {
  return 100 + level * 50;
}

function applyXP(user, amount) {
  user.xp += amount;

  while (user.xp >= xpForLevel(user.level)) {
    user.xp -= xpForLevel(user.level);
    user.level += 1;
  }
}

/* =======================
   MESSAGE XP
   ======================= */

export function addMessageXP(guildId, userId) {
  const data = loadGuildData(guildId);
  const user = ensureUser(data, userId);

  applyXP(user, MESSAGE_XP);
  saveGuildData(guildId, data);
}

/* =======================
   VOICE XP
   ======================= */

export function startVoiceSession(guildId, userId, timestamp) {
  const data = loadGuildData(guildId);
  const user = ensureUser(data, userId);

  user.voiceStart = timestamp;
  saveGuildData(guildId, data);
}

export function endVoiceSession(guildId, userId, timestamp) {
  const data = loadGuildData(guildId);
  const user = ensureUser(data, userId);

  if (!user.voiceStart) return;

  const minutes = Math.floor((timestamp - user.voiceStart) / 60000);
  if (minutes > 0) {
    applyXP(user, minutes * VOICE_XP_PER_MIN);
  }

  user.voiceStart = null;
  saveGuildData(guildId, data);
}

/* =======================
   READ API
   ======================= */

export function getUserLevel(guildId, userId) {
  const data = loadGuildData(guildId);
  const user = ensureUser(data, userId);

  return {
    xp: user.xp,
    level: user.level
  };
}

export function getLeaderboard(guildId, limit = 10) {
  const data = loadGuildData(guildId);
  if (!data.leveling) return [];

  return Object.entries(data.leveling)
    .map(([userId, u]) => ({
      userId,
      level: u.level,
      xp: u.xp
    }))
    .sort((a, b) =>
      b.level === a.level ? b.xp - a.xp : b.level - a.level
    )
    .slice(0, limit);
}
