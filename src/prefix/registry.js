import {
  isValidAliasName,
  normalizeAliasName,
  normalizePrefixValue,
  resolveAliasedCommand
} from "./hardening.js";

import metaCommands from "./commands/meta.js";
import utilityCommands from "./commands/utility.js";
import subscribeCommands from "./commands/subscribe.js";
import aiCommands from "./commands/ai.js";
import funCommands from "./commands/fun.js";
import infoCommands from "./commands/info.js";
import modCommands from "./commands/mod.js";
import serverCommands from "./commands/server.js";
import economyCommands from "./commands/economy.js";
import socialCommands from "./commands/social.js";
import voiceRoomCommands from "./commands/voiceroom.js";
import vcCommands from "./commands/vc.js";
import levelCommands from "./commands/levels.js";

const CATEGORY_GROUPS = [
  { category: "meta",    commands: metaCommands,    emoji: "⚙️" },
  { category: "utility", commands: [...utilityCommands, ...subscribeCommands], emoji: "🔧" },
  { category: "social",  commands: socialCommands,  emoji: "💬" },
  { category: "info",    commands: infoCommands,     emoji: "ℹ️" },
  { category: "economy", commands: economyCommands,  emoji: "💰" },
  { category: "fun",     commands: funCommands,      emoji: "🎉" },
  { category: "mod",     commands: modCommands,      emoji: "🔨" },
  { category: "server",  commands: serverCommands,   emoji: "🏰" },
  { category: "ai",      commands: aiCommands,       emoji: "🤖" },
  { category: "voice",   commands: [...voiceRoomCommands, ...vcCommands], emoji: "🔊" },
  { category: "levels",  commands: levelCommands,    emoji: "⭐" },
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
