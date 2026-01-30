import { loadGuild, saveGuild } from "../../utils/storage.js";

/**
 * Load voice state for a guild.
 */
export function getVoiceState(guildId) {
  const guild = loadGuild(guildId);
  if (!guild.voice) {
    guild.voice = { lobbies: {}, tempChannels: {} };
    saveGuild(guildId, guild);
  }
  return guild.voice;
}

/**
 * Persist updated voice state.
 */
export function setVoiceState(guildId, voiceState) {
  const guild = loadGuild(guildId);
  guild.voice = voiceState;
  saveGuild(guildId, guild);
}

/**
 * Add a lobby definition.
 */
export function addLobby(guildId, lobbyChannelId, config) {
  const voice = getVoiceState(guildId);

  if (voice.lobbies[lobbyChannelId]) {
    throw new Error("Lobby already exists");
  }

  voice.lobbies[lobbyChannelId] = config;
  setVoiceState(guildId, voice);
}

/**
 * Remove a lobby definition.
 */
export function removeLobby(guildId, lobbyChannelId) {
  const voice = getVoiceState(guildId);

  delete voice.lobbies[lobbyChannelId];
  setVoiceState(guildId, voice);
}

/**
 * Track a temporary voice channel.
 */
export function registerTempChannel(guildId, channelId, ownerId) {
  const voice = getVoiceState(guildId);

  voice.tempChannels[channelId] = {
    ownerId,
    createdAt: Date.now()
  };

  setVoiceState(guildId, voice);
}

/**
 * Remove a temporary voice channel.
 */
export function unregisterTempChannel(guildId, channelId) {
  const voice = getVoiceState(guildId);

  delete voice.tempChannels[channelId];
  setVoiceState(guildId, voice);
}
