import { ChannelType, PermissionsBitField } from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";
import { startVoiceSession, endVoiceSession } from "../tools/leveling/levelingController.js";

export default {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const guildId = guild.id;
    const userId = newState.id;
    const now = Date.now();

    if (!oldState.channelId && newState.channelId) {
      startVoiceSession(guildId, userId, now);
    }

    if (oldState.channelId && !newState.channelId) {
      endVoiceSession(guildId, userId, now);
    }

    if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      endVoiceSession(guildId, userId, now);
      startVoiceSession(guildId, userId, now);
    }

    const data = loadGuildData(guildId);

    if (
      newState.channelId &&
      newState.channelId !== oldState.channelId
    ) {
      const lobby = data.lobbies?.[newState.channelId];
      if (!lobby || lobby.enabled !== true) return;

      const member = newState.member;
      if (!member) return;

      const channel = await guild.channels.create({
        name: `${member.user.username}'s room`,
        type: ChannelType.GuildVoice,
        parent: lobby.categoryId,
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
        ownerId: member.id,
        lobbyId: newState.channelId
      };

      saveGuildData(guildId, data);
      await member.voice.setChannel(channel);
      return;
    }

    if (
      oldState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      const temp = data.tempChannels?.[oldState.channelId];
      if (!temp) return;

      const channel = guild.channels.cache.get(oldState.channelId);
      if (!channel) return;

      if (channel.members.size === 0) {
        delete data.tempChannels[oldState.channelId];
        saveGuildData(guildId, data);
        await channel.delete().catch(() => {});
      }
    }
  }
};
