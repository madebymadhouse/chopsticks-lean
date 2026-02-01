// src/tools/voice/commands.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

    const added = await addLobby(guildId, channel.id, category.id);

    await interaction.reply({
      content: added
        ? "Voice lobby added"
        : "That voice lobby is already registered",
      flags: 64
    });
    return;
  }

  if (sub === "lobby-remove") {
    const channel = interaction.options.getChannel("channel");

    // CRITICAL: pass the lobby channel ID verbatim
    const removed = await removeLobby(guildId, channel.id);

    await interaction.reply({
      content: removed
        ? "Voice lobby removed"
        : "That voice lobby is already removed",
      flags: 64
    });
    return;
  }

  if (sub === "reset") {
    await resetVoice(guildId);
    await interaction.reply({
      content: "Voice configuration reset",
      flags: 64
    });
    return;
  }

  if (sub === "status") {
    const status = await getStatus(guildId);
    await interaction.reply({
      content: "```json\n" + JSON.stringify(status, null, 2) + "\n```",
      flags: 64
    });
    return;
  }
}
};
