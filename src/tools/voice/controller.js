// src/tools/voice/controller.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

/*
Data shape assumed 

{
  lobbies: {
    [lobbyChannelId]: {
      categoryId
    }
  },
  tempChannels: {
    [tempChannelId]: {
      ownerId,
      categoryId
    }
  }
}
*/

export const addLobby = async (guildId, lobbyChannelId, categoryId) => {
  const data = loadGuildData(guildId);

  // prevent add loop / duplicates
  if (data.lobbies[lobbyChannelId]) {
    return { ok: false, reason: "exists" };
  }

  data.lobbies[lobbyChannelId] = { categoryId };
  saveGuildData(guildId, data);

  return { ok: true };
};

export const removeLobby = async (guildId, lobbyChannelId) => {
  const data = loadGuildData(guildId);
  const lobby = data.lobbies[lobbyChannelId];

  if (!lobby) {
    return { ok: false, reason: "missing" };
  }

  const categoryId = lobby.categoryId;

  // block removal if temp channels still exist in this category
  const hasActiveTemps = Object.values(data.tempChannels).some(
    ch => ch.categoryId === categoryId
  );

  if (hasActiveTemps) {
    return { ok: false, reason: "active" };
  }

  delete data.lobbies[lobbyChannelId];
  saveGuildData(guildId, data);

  return { ok: true };
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
