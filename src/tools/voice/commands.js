// src/tools/voice/commands.js
import {
  SlashCommandBuilder,
  ChannelType
} from "discord.js";

import {
  addLobby,
  removeLobby,
  resetVoice,
  getStatus
} from "./controller.js";

export const voiceCommand = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice management")
    .addSubcommand(sub =>
      sub
        .setName("lobby-add")
        .setDescription("Register a voice lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName("category")
            .setDescription("Category for temp channels")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("lobby-remove")
        .setDescription("Remove a voice lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("reset")
        .setDescription("Reset all voice configuration")
    )
    .addSubcommand(sub =>
      sub
        .setName("status")
        .setDescription("Show voice configuration")
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "lobby-add") {
      const channel = interaction.options.getChannel("channel");
      const category = interaction.options.getChannel("category");
      await addLobby(guildId, channel.id, category.id);
      return interaction.reply({ content: "Voice lobby added", ephemeral: true });
    }

    if (sub === "lobby-remove") {
      const channel = interaction.options.getChannel("channel");
      await removeLobby(guildId, channel.id);
      return interaction.reply({ content: "Voice lobby removed", ephemeral: true });
    }

    if (sub === "reset") {
      await resetVoice(guildId);
      return interaction.reply({ content: "Voice configuration reset", ephemeral: true });
    }

    if (sub === "status") {
      const status = await getStatus(guildId);
      return interaction.reply({
        content: "```json\n" + JSON.stringify(status, null, 2) + "\n```",
        ephemeral: true
      });
    }
  }
};
