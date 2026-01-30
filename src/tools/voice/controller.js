// src/tools/voice/controller.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

export const addLobby = async (guildId, lobbyChannelId, categoryId) => {
  const data = loadGuildData(guildId);
  data.lobbies[lobbyChannelId] = { categoryId };
  saveGuildData(guildId, data);
};

export const removeLobby = async (guildId, lobbyChannelId) => {
  const data = loadGuildData(guildId);
  delete data.lobbies[lobbyChannelId];
  saveGuildData(guildId, data);
};

export const resetVoice = async (guildId) => {
  saveGuildData(guildId, {
    lobbies: {},
    tempChannels: {}
  });
};

export const getStatus = async (guildId) => {
  return loadGuildData(guildId);
};

