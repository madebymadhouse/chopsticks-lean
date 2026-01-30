import {
  SlashCommandBuilder,
  ChannelType
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("chopsticks")
  .setDescription("Chopsticks admin control plane")

  .addSubcommandGroup(group =>
    group
      .setName("voice")
      .setDescription("Voice management")

      .addSubcommand(cmd =>
        cmd
          .setName("lobby-add")
          .setDescription("Add a voice lobby")
          .addChannelOption(opt =>
            opt
              .setName("lobby")
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
          .addStringOption(opt =>
            opt
              .setName("name")
              .setDescription("Channel name template ({user})")
              .setRequired(true)
          )
          .addIntegerOption(opt =>
            opt
              .setName("limit")
              .setDescription("User limit (0 = unlimited)")
              .setRequired(true)
          )
          .addBooleanOption(opt =>
            opt
              .setName("lock")
              .setDescription("Lock channel on creation")
              .setRequired(true)
          )
      )

      .addSubcommand(cmd =>
        cmd
          .setName("lobby-remove")
          .setDescription("Remove a voice lobby")
          .addChannelOption(opt =>
            opt
              .setName("lobby")
              .setDescription("Lobby voice channel")
              .addChannelTypes(ChannelType.GuildVoice)
              .setRequired(true)
          )
      )

      .addSubcommand(cmd =>
        cmd
          .setName("status")
          .setDescription("Show voice configuration")
      )

      .addSubcommand(cmd =>
        cmd
          .setName("reset")
          .setDescription("Reset all voice configuration")
      )
  );
