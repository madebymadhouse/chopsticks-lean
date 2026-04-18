// src/commands/schedulemsg.js
// /schedulemsg — set up persistent scheduled messages (water reminders, roasts, polls, custom)

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { addSchedule, removeSchedule, listSchedules, runNow } from "../utils/scheduledMessages.js";
import { randomUUID } from "node:crypto";

export const meta = {
  deployGlobal: true,
  guildOnly: true,
  userPerms: [PermissionFlagsBits.ManageGuild],
  category: "server"
};

export const data = new SlashCommandBuilder()
  .setName("schedulemsg")
  .setDescription("Set up recurring scheduled messages for this server")
  .addSubcommand(sub =>
    sub.setName("add")
      .setDescription("Add a new scheduled message")
      .addStringOption(o =>
        o.setName("type")
          .setDescription("Message type")
          .setRequired(true)
          .addChoices(
            { name: "Water Reminder", value: "water_reminder" },
            { name: "Random Roast", value: "random_roast" },
            { name: "Poll", value: "poll" },
            { name: "Custom Message", value: "custom" }
          )
      )
      .addChannelOption(o =>
        o.setName("channel").setDescription("Channel to post in").setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("interval")
          .setDescription("How often to post (in minutes, minimum 60)")
          .setRequired(true)
          .setMinValue(60)
          .setMaxValue(10080)  // 1 week
      )
      .addStringOption(o =>
        o.setName("poll_question")
          .setDescription("Poll question (required if type is poll)")
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName("poll_options")
          .setDescription("Poll options separated by | (e.g. Yes | No | Maybe)")
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName("message")
          .setDescription("Message text (required if type is custom)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List all scheduled messages for this server")
  )
  .addSubcommand(sub =>
    sub.setName("remove")
      .setDescription("Remove a scheduled message by ID")
      .addStringOption(o =>
        o.setName("id").setDescription("Schedule ID (from /schedulemsg list)").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("run")
      .setDescription("Trigger a scheduled message immediately")
      .addStringOption(o =>
        o.setName("id").setDescription("Schedule ID (from /schedulemsg list)").setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const MH_PINK = 0xCC3300;
const TYPE_LABELS = {
  water_reminder: "Water Reminder",
  random_roast:   "Random Roast",
  poll:           "Poll",
  custom:         "Custom"
};

function minutesToHuman(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── add ──────────────────────────────────────────────────────────────────────
  if (sub === "add") {
    const type = interaction.options.getString("type", true);
    const channel = interaction.options.getChannel("channel", true);
    const interval = interaction.options.getInteger("interval", true);

    let config = {};

    if (type === "poll") {
      const question = interaction.options.getString("poll_question");
      const rawOptions = interaction.options.getString("poll_options");
      if (!question || !rawOptions) {
        await interaction.reply({ content: "Poll type requires `poll_question` and `poll_options`.", ephemeral: true });
        return;
      }
      const options = rawOptions.split("|").map(s => s.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 4) {
        await interaction.reply({ content: "Polls need 2–4 options separated by `|`.", ephemeral: true });
        return;
      }
      config = { question, options };
    }

    if (type === "custom") {
      const message = interaction.options.getString("message");
      if (!message) {
        await interaction.reply({ content: "Custom type requires a `message`.", ephemeral: true });
        return;
      }
      config = { message };
    }

    const schedule = {
      id: randomUUID().slice(0, 8),
      type,
      channelId: channel.id,
      intervalMinutes: interval,
      config,
      enabled: true,
      createdAt: Date.now(),
      lastRun: null
    };

    await addSchedule(interaction.client, interaction.guildId, schedule);

    const embed = new EmbedBuilder()
      .setColor(MH_PINK)
      .setTitle("Schedule Added")
      .addFields(
        { name: "ID",       value: `\`${schedule.id}\``,                  inline: true },
        { name: "Type",     value: TYPE_LABELS[type] ?? type,              inline: true },
        { name: "Channel",  value: `<#${channel.id}>`,                    inline: true },
        { name: "Interval", value: minutesToHuman(interval),               inline: true }
      );

    if (type === "poll") {
      embed.addFields({ name: "Question", value: config.question });
      embed.addFields({ name: "Options", value: config.options.join("\n") });
    }
    if (type === "custom") {
      embed.addFields({ name: "Message", value: config.message.slice(0, 200) });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── list ─────────────────────────────────────────────────────────────────────
  if (sub === "list") {
    const schedules = await listSchedules(interaction.guildId);

    if (!schedules.length) {
      await interaction.reply({ content: "No scheduled messages set up. Use `/schedulemsg add` to create one.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(MH_PINK)
      .setTitle("Scheduled Messages")
      .setDescription(`${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} active`);

    for (const s of schedules) {
      const last = s.lastRun ? `<t:${Math.floor(s.lastRun / 1000)}:R>` : "Never";
      embed.addFields({
        name: `\`${s.id}\`  —  ${TYPE_LABELS[s.type] ?? s.type}`,
        value: `Channel: <#${s.channelId}>  •  Every ${minutesToHuman(s.intervalMinutes)}  •  Last ran: ${last}`
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── remove ───────────────────────────────────────────────────────────────────
  if (sub === "remove") {
    const scheduleId = interaction.options.getString("id", true);
    const removed = await removeSchedule(interaction.client, interaction.guildId, scheduleId);
    if (!removed) {
      await interaction.reply({ content: `No schedule found with ID \`${scheduleId}\`.`, ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Schedule \`${scheduleId}\` removed.`, ephemeral: true });
    return;
  }

  // ── run ──────────────────────────────────────────────────────────────────────
  if (sub === "run") {
    const scheduleId = interaction.options.getString("id", true);
    const ok = await runNow(interaction.client, interaction.guildId, scheduleId);
    if (!ok) {
      await interaction.reply({ content: `No schedule found with ID \`${scheduleId}\`.`, ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Schedule \`${scheduleId}\` triggered.`, ephemeral: true });
  }
}
