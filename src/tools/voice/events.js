// src/tools/voice/events.js
import {
  ChannelType,
  PermissionsBitField
} from "discord.js";
import {
  getVoiceState,
  saveVoiceState
} from "./schema.js";

export async function onVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const guildId = guild.id;
  const state = getVoiceState(guildId);

  /* ---------- JOIN LOBBY → CREATE CHANNEL ---------- */

  if (
    newState.channelId &&
    newState.channelId !== oldState.channelId &&
    state.lobbies[newState.channelId]
  ) {
    const lobby = state.lobbies[newState.channelId];
    const member = newState.member;
    if (!member) return;

    const name = lobby.nameTemplate.replace(
      "{user}",
      member.user.username
    );

    const channel = await guild.channels.create({
      name,
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

    state.tempChannels[channel.id] = {
      ownerId: member.id,
      lobbyId: newState.channelId
    };

    saveVoiceState(guildId, state);
    await member.voice.setChannel(channel);
  }

  /* ---------- LEAVE TEMP → DELETE IF EMPTY ---------- */

  if (
    oldState.channelId &&
    state.tempChannels[oldState.channelId]
  ) {
    const channel = oldState.channel;
    if (!channel) return;

    if (channel.members.size === 0) {
      delete state.tempChannels[channel.id];
      saveVoiceState(guildId, state);
      await channel.delete().catch(() => {});
    }
  }
}
