// src/events/voiceStateUpdate.js
import { ChannelType, PermissionsBitField } from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";

export default {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const guild = newState.guild;
    if (!guild) return;

    const guildId = guild.id;
    const data = loadGuildData(guildId);

    // ---------- USER JOINED A CHANNEL ----------
    if (!oldState.channelId && newState.channelId) {
      const lobby = data.lobbies?.[newState.channelId];
      if (!lobby) return;

      const member = newState.member;
      const categoryId = lobby.categoryId;

      const channel = await guild.channels.create({
        name: `${member.user.username}'s room`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers
            ]
          }
        ]
      });

      data.tempChannels[channel.id] = {
        ownerId: member.id
      };

      saveGuildData(guildId, data);

      await member.voice.setChannel(channel);
      return;
    }

    // ---------- USER LEFT A CHANNEL ----------
    if (oldState.channelId && !newState.channelId) {
      const temp = data.tempChannels?.[oldState.channelId];
      if (!temp) return;

      const channel = guild.channels.cache.get(oldState.channelId);
      if (!channel) return;

      if (channel.members.size === 0) {
        delete data.tempChannels[oldState.channelId];
        saveGuildData(guildId, data);
        await channel.delete();
      }
    }
  }
};
