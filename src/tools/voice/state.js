import { loadVoice } from "./storage.js";

let cache = null;

export function getVoiceState(guildId) {
  if (!cache) cache = {};
  if (!cache[guildId]) {
    cache[guildId] = loadVoice(guildId);
  }
  return cache[guildId];
}

export function invalidateVoiceState(guildId) {
  if (cache) delete cache[guildId];
}
