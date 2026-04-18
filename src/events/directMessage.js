// src/events/directMessage.js
// DMs are not handled — Chopsticks is a server bot.

import { ChannelType } from "discord.js";

export default {
  name: "messageCreate",
  async execute(message) {
    if (message.channel.type !== ChannelType.DM) return;
    // No response. Chopsticks does not operate in DMs.
  }
};
