import { EmbedBuilder } from "discord.js";
import { reply } from "../helpers.js";
import { getPool } from "../../utils/storage_pg.js";
import { levelFromXp, xpForLevel } from "../../game/progression.js";
import COLORS from "../../utils/colors.js";

export default [
  {
    name: "rank",
    aliases: ["level", "xp", "lvl", "creds"],
    description: "Show your level and Creds — !rank [@user]",
    guildOnly: true,
    rateLimit: 5000,
    async execute(message, args) {
      const target = message.mentions.users.first() ?? message.author;
      const p = getPool();
      const r = await p.query(
        "SELECT xp, level FROM user_guild_xp WHERE user_id=$1 AND guild_id=$2",
        [target.id, message.guildId]
      ).catch(() => null);
      const row = r?.rows[0] ?? null;
      const xp = row?.xp ?? 0;
      const level = levelFromXp(xp);
      const curFloor = xpForLevel(level);
      const nextFloor = xpForLevel(level + 1);
      const progress = xp - curFloor;
      const needed = nextFloor - curFloor;
      const pct = needed > 0 ? Math.round((progress / needed) * 100) : 100;
      const bar = buildBar(pct, 20);

      // rank position
      const rankRow = await p.query(
        "SELECT COUNT(*)+1 AS rank FROM user_guild_xp WHERE guild_id=$1 AND xp > $2",
        [message.guildId, xp]
      ).catch(() => null);
      const rank = rankRow?.rows[0]?.rank ?? "?";

      const embed = new EmbedBuilder()
        .setTitle(`${target.displayName}'s Rank`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "Level", value: `**${level}**`, inline: true },
          { name: "Creds", value: `**${xp.toLocaleString()}**`, inline: true },
          { name: "Server Rank", value: `**#${rank}**`, inline: true },
          { name: `Progress to Level ${level + 1}`, value: `${bar} ${pct}%\n${progress.toLocaleString()} / ${needed.toLocaleString()} Creds` }
        )
        .setColor(COLORS.INFO)
        .setFooter({ text: "Mad House  —  !rank" });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "top",
    aliases: ["leaderboard", "lb"],
    description: "Top Creds leaderboard — !top",
    guildOnly: true,
    rateLimit: 8000,
    async execute(message) {
      const p = getPool();
      const rows = await p.query(
        "SELECT user_id, xp, level FROM user_guild_xp WHERE guild_id=$1 AND xp>0 ORDER BY xp DESC LIMIT 10",
        [message.guildId]
      ).catch(() => ({ rows: [] }));

      if (!rows.rows.length) return reply(message, "No Creds data yet for this server.");

      const lines = rows.rows.map((row, i) => {
        const medal = ["1.", "2.", "3."][i] ?? `#${i + 1}`;
        return `${medal} <@${row.user_id}> — Level **${row.level}** | ${Number(row.xp).toLocaleString()} Creds`;
      });

      const embed = new EmbedBuilder()
        .setTitle("Creds Leaderboard")
        .setDescription(lines.join("\n"))
        .setColor(COLORS.INFO)
        .setFooter({ text: "Use !rank to see your own stats  —  Mad House" });
      await message.reply({ embeds: [embed] });
    }
  },
];

function buildBar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
