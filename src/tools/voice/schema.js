// src/tools/voice/schema.js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "guilds");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function guildFile(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function baseState() {
  return {
    lobbies: {},
    tempChannels: {}
  };
}

function readRaw(guildId) {
  ensureDir();
  const file = guildFile(guildId);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeRaw(guildId, data) {
  ensureDir();
  writeFileSync(guildFile(guildId), JSON.stringify(data, null, 2));
}

function isSnowflake(v) {
  return typeof v === "string" && /^[0-9]{17,20}$/.test(v);
}

function normalize(state) {
  const out = baseState();

  if (state.lobbies && typeof state.lobbies === "object") {
    for (const [lobbyId, lobby] of Object.entries(state.lobbies)) {
      if (!isSnowflake(lobbyId)) continue;
      if (!lobby || typeof lobby !== "object") continue;
      if (!isSnowflake(lobby.categoryId)) continue;

      out.lobbies[lobbyId] = {
        categoryId: lobby.categoryId,
        nameTemplate:
          typeof lobby.nameTemplate === "string"
            ? lobby.nameTemplate
            : "🔊 {user}"
      };
    }
  }

  if (state.tempChannels && typeof state.tempChannels === "object") {
    for (const [channelId, meta] of Object.entries(state.tempChannels)) {
      if (!isSnowflake(channelId)) continue;
      if (!meta || typeof meta !== "object") continue;
      if (!isSnowflake(meta.ownerId)) continue;
      if (!isSnowflake(meta.lobbyId)) continue;
      if (!out.lobbies[meta.lobbyId]) continue;

      out.tempChannels[channelId] = {
        ownerId: meta.ownerId,
        lobbyId: meta.lobbyId
      };
    }
  }

  return out;
}

export function initGuildVoiceState(guildId) {
  const raw = readRaw(guildId);
  const normalized = normalize(raw.voice || raw);
  writeRaw(guildId, { voice: normalized });
  return normalized;
}

export function getVoiceState(guildId) {
  const raw = readRaw(guildId);
  return normalize(raw.voice || raw);
}

export function saveVoiceState(guildId, state) {
  const normalized = normalize(state);
  writeRaw(guildId, { voice: normalized });
  return normalized;
}
