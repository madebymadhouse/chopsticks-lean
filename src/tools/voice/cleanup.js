import { ChannelType } from "discord.js";
import { loadState, saveState } from "./state.js";

export async function cleanupVoiceState(client) {
  const state = loadState();

  for (const guildId of Object.keys(state.guilds ?? {})) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const guildState = state.guilds[guildId];
    const active = guildState.activeChannels ?? {};

    for (const channelId of Object.keys(active)) {
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        delete active[channelId];
        continue;
      }

      if (channel.type !== ChannelType.GuildVoice) {
        delete active[channelId];
        continue;
      }

      if (channel.members.size === 0) {
        await channel.delete().catch(() => {});
        delete active[channelId];
      }
    }
  }

  saveState(state);
}
