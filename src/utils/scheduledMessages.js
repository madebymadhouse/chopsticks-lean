// src/utils/scheduledMessages.js
// Persistent scheduled messages — stored in guild data, reloaded on restart.
// Types: water_reminder, random_roast, poll, custom

import { loadGuildData, saveGuildData } from "./storage.js";
import { logger } from "./logger.js";
import { EmbedBuilder } from "discord.js";

const MH_PINK = 0xCC3300;

// In-memory interval handles: guildId:scheduleId -> intervalId
const handles = new Map();

// ── Roast bank ───────────────────────────────────────────────────────────────
const ROASTS = [
  "{user} called and asked if we knew how to check the weather. Google was unavailable.",
  "Congrats {user} — most people grow up. You grew sideways.",
  "{user} is living proof that you can survive on vibes alone.",
  "If effort were a crime, {user} would walk free every time.",
  "{user} showed up late to their own personality.",
  "Scientists confirm {user} has discovered a new form of energy: the audacity.",
  "{user} is not a bad person, just a compelling argument against optimism.",
  "The real Mad House was the {user} we met along the way.",
];

function pickRoast(displayName) {
  const template = ROASTS[Math.floor(Math.random() * ROASTS.length)];
  return template.replace(/\{user\}/g, `**${displayName}**`);
}

// ── Water reminder messages ───────────────────────────────────────────────────
const WATER_LINES = [
  "Drink some water. Hydration keeps you sharp.",
  "When did you last have water? Right. Go drink some.",
  "Your brain is 75% water. Top it off.",
  "Quick check — water. Not soda, not energy drinks. Water.",
  "Hydrate. You will thank yourself later.",
];

function pickWater() {
  return WATER_LINES[Math.floor(Math.random() * WATER_LINES.length)];
}

// ── Execute a scheduled action ────────────────────────────────────────────────
async function runSchedule(client, guildId, schedule) {
  try {
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = guild.channels.cache.get(schedule.channelId)
      ?? await guild.channels.fetch(schedule.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    if (schedule.type === "water_reminder") {
      const embed = new EmbedBuilder()
        .setColor(MH_PINK)
        .setDescription(pickWater())
        .setFooter({ text: "Mad House  —  Hydration Check" });
      await channel.send({ embeds: [embed] });

    } else if (schedule.type === "random_roast") {
      const members = await guild.members.fetch().catch(() => guild.members.cache);
      const humans = [...members.values()].filter(m => !m.user.bot);
      if (!humans.length) return;
      const target = humans[Math.floor(Math.random() * humans.length)];
      const roast = pickRoast(target.displayName ?? target.user.username);
      const embed = new EmbedBuilder()
        .setColor(MH_PINK)
        .setDescription(roast)
        .setFooter({ text: "Mad House  —  Random Roast" });
      await channel.send({ content: `<@${target.id}>`, embeds: [embed] });

    } else if (schedule.type === "poll") {
      const { question, options } = schedule.config ?? {};
      if (!question || !Array.isArray(options) || options.length < 2) return;
      const letters = ["A", "B", "C", "D"];
      const optText = options.slice(0, 4).map((o, i) => `${letters[i]}.  ${o}`).join("\n");
      const embed = new EmbedBuilder()
        .setColor(MH_PINK)
        .setTitle("Poll")
        .setDescription(`**${question}**\n\n${optText}`)
        .setFooter({ text: "Mad House  —  Scheduled Poll" })
        .setTimestamp();
      const msg = await channel.send({ embeds: [embed] });
      for (const letter of letters.slice(0, options.length)) {
        await msg.react(letter === "A" ? "🇦" : letter === "B" ? "🇧" : letter === "C" ? "🇨" : "🇩").catch(() => {});
      }

    } else if (schedule.type === "custom") {
      const text = schedule.config?.message;
      if (!text) return;
      const embed = new EmbedBuilder()
        .setColor(MH_PINK)
        .setDescription(text)
        .setFooter({ text: "Mad House  —  Scheduled Message" })
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    }

    // Update lastRun in guild data
    const data = await loadGuildData(guildId);
    const entry = (data.scheduledMessages ?? []).find(s => s.id === schedule.id);
    if (entry) {
      entry.lastRun = Date.now();
      await saveGuildData(guildId, data);
    }
  } catch (err) {
    logger.warn({ err, guildId, scheduleId: schedule.id }, "scheduledMessages: run error");
  }
}

// ── Register one schedule ─────────────────────────────────────────────────────
function register(client, guildId, schedule) {
  const key = `${guildId}:${schedule.id}`;
  const existing = handles.get(key);
  if (existing) clearInterval(existing);

  const intervalMs = (schedule.intervalMinutes ?? 60) * 60 * 1000;
  if (intervalMs < 60000) return; // minimum 1 minute

  const handle = setInterval(() => {
    runSchedule(client, guildId, schedule).catch(() => {});
  }, intervalMs);

  handles.set(key, handle);
}

function unregister(guildId, scheduleId) {
  const key = `${guildId}:${scheduleId}`;
  const handle = handles.get(key);
  if (handle) { clearInterval(handle); handles.delete(key); }
}

// ── Load all schedules on startup ─────────────────────────────────────────────
export async function loadAllScheduledMessages(client) {
  let loaded = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const data = await loadGuildData(guild.id);
      const schedules = data.scheduledMessages ?? [];
      for (const s of schedules) {
        if (s.enabled !== false) {
          register(client, guild.id, s);
          loaded++;
        }
      }
    } catch {}
  }
  logger.info({ loaded }, "scheduledMessages: loaded from DB");
}

// ── CRUD helpers (used by the command) ───────────────────────────────────────
export async function addSchedule(client, guildId, schedule) {
  const data = await loadGuildData(guildId);
  data.scheduledMessages ??= [];
  data.scheduledMessages.push(schedule);
  await saveGuildData(guildId, data);
  register(client, guildId, schedule);
}

export async function removeSchedule(client, guildId, scheduleId) {
  const data = await loadGuildData(guildId);
  if (!data.scheduledMessages) return false;
  const idx = data.scheduledMessages.findIndex(s => s.id === scheduleId);
  if (idx === -1) return false;
  data.scheduledMessages.splice(idx, 1);
  await saveGuildData(guildId, data);
  unregister(guildId, scheduleId);
  return true;
}

export async function listSchedules(guildId) {
  const data = await loadGuildData(guildId);
  return data.scheduledMessages ?? [];
}

export async function runNow(client, guildId, scheduleId) {
  const data = await loadGuildData(guildId);
  const schedule = (data.scheduledMessages ?? []).find(s => s.id === scheduleId);
  if (!schedule) return false;
  await runSchedule(client, guildId, schedule);
  return true;
}
