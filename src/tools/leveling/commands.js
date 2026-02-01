// src/tools/leveling/commands.js
import { SlashCommandBuilder } from "discord.js";
import {
  getUserLevel,
  getLeaderboard
} from "./levelingController.js";

export const levelCommand = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Level and XP system")
    .addSubcommand(sub =>
      sub
        .setName("me")
        .setDescription("Show your level")
    )
    .addSubcommand(sub =>
      sub
        .setName("leaderboard")
        .setDescription("Show server leaderboard")
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "me") {
      const { xp, level } = getUserLevel(guildId, userId);

      await interaction.reply({
        content: `Level ${level}\nXP ${xp}`,
        flags: 64
      });
      return;
    }

    if (sub === "leaderboard") {
      const top = getLeaderboard(guildId, 10);

      if (top.length === 0) {
        await interaction.reply({
          content: "No leveling data yet",
          flags: 64
        });
        return;
      }

      const lines = top.map(
        (u, i) => `${i + 1}. <@${u.userId}> — L${u.level} (${u.xp} XP)`
      );

      await interaction.reply({
        content: lines.join("\n"),
        flags: 64
      });
      return;
    }
  }
};
