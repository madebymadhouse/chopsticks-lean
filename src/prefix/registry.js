import {
  isValidAliasName,
  normalizeAliasName,
  normalizePrefixValue,
  resolveAliasedCommand
} from "./hardening.js";

import metaCommands from "./commands/meta.js";
import utilityCommands from "./commands/utility.js";
import aiCommands from "./commands/ai.js";
import funCommands from "./commands/fun.js";
import infoCommands from "./commands/info.js";
import modCommands from "./commands/mod.js";
import serverCommands from "./commands/server.js";
import mediaCommands from "./commands/media.js";
import economyCommands from "./commands/economy.js";
import socialCommands from "./commands/social.js";
import animalCommands from "./commands/animals.js";
import entertainmentCommands from "./commands/entertainment.js";
import knowledgeCommands from "./commands/knowledge.js";
import minigameCommands from "./commands/minigames.js";
import voiceRoomCommands from "./commands/voiceroom.js";
import levelCommands from "./commands/levels.js";

const CATEGORY_GROUPS = [
  { category: "meta",          commands: metaCommands,          emoji: "⚙️" },
  { category: "ai",            commands: aiCommands,            emoji: "🤖" },
  { category: "utility",       commands: utilityCommands,       emoji: "🔧" },
  { category: "fun",           commands: funCommands,           emoji: "🎉" },
  { category: "social",        commands: socialCommands,        emoji: "💬" },
  { category: "info",          commands: infoCommands,          emoji: "ℹ️" },
  { category: "mod",           commands: modCommands,           emoji: "🔨" },
  { category: "server",        commands: serverCommands,        emoji: "🏰" },
  { category: "media",         commands: mediaCommands,         emoji: "🎬" },
  { category: "economy",       commands: economyCommands,       emoji: "💰" },
  { category: "animals",       commands: animalCommands,        emoji: "🐾" },
  { category: "entertainment", commands: entertainmentCommands, emoji: "🎭" },
  { category: "knowledge",     commands: knowledgeCommands,     emoji: "📚" },
  { category: "minigames",     commands: minigameCommands,      emoji: "🎮" },
  { category: "voice",         commands: voiceRoomCommands,     emoji: "🔊" },
  { category: "levels",        commands: levelCommands,         emoji: "⭐" },
];

export const CATEGORIES = CATEGORY_GROUPS.map(g => ({ category: g.category, emoji: g.emoji }));

export async function getPrefixCommands() {
  const map = new Map();
  for (const { category, commands } of CATEGORY_GROUPS) {
    for (const cmd of commands) {
      map.set(cmd.name, { ...cmd, category });
    }
  }
  return map;
}
