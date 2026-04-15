// src/index.js
// ENTRY

import "dotenv/config";

function readEnvBool(name, defaultValue = true) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

const DASHBOARD_ENABLED = readEnvBool("DASHBOARD_ENABLED", false);
const AGENTS_ENABLED = readEnvBool("AGENTS_ENABLED", false);
const MUSIC_ENABLED = readEnvBool("MUSIC_ENABLED", false);

// ===================== CONFIGURATION VALIDATION =====================
if (process.env.STORAGE_DRIVER !== 'postgres') {
  botLogger.error("FATAL: STORAGE_DRIVER environment variable must be set to 'postgres'.");
  process.exit(1);
}

if (AGENTS_ENABLED && (!process.env.AGENT_TOKEN_KEY || process.env.AGENT_TOKEN_KEY.length !== 64)) {
  botLogger.warn(
    "AGENT_TOKEN_KEY is missing or not a 64-character hex key — agent token encryption disabled. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and add it to your .env as AGENT_TOKEN_KEY."
  );
  // Non-fatal: bot runs normally; agent tokens will be marked corrupt until key is set.
} else {
  botLogger.info("✅ Configuration validated.");
}
// ====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ActivityType, Client, Collection, GatewayIntentBits, Events, Partials, PermissionFlagsBits } from "discord.js";
import {
  handleButton as handleAudiobookButton,
  handleSelect as handleAudiobookSelect,
  maybeHandleAudiobookMessage,
} from "./commands/audiobook.js";
import { handleButton as handleCommandsButton, handleSelect as handleCommandsSelect } from "./commands/commands.js";
import {
  handleButton as handleVoiceButton,
  handleSelect as handleVoiceSelect,
  handleModal as handleVoiceModal
} from "./commands/voice.js";
import { handleSelect as handleHelpSelect } from "./commands/help.js";
import { handleModal as handleModelModal } from "./commands/model.js";
import { handleAiModal } from "./commands/ai.js";
import { registerAllCommands } from "../scripts/registerAllCommands.js";
import { handleButton as handlePurgeButton } from "./commands/purge.js";
import { handleButton as handleGiveawayButton } from "./commands/giveaway.js";
import { handleButton as handleBackupButton } from "./commands/backup.js";
import { handleButton as handlePetButton } from "./commands/pet.js";
import { handleButton as handleGameButton, handleSelect as handleGameSelect } from "./commands/game.js";
import { handleButton as handleQuestsButton } from "./commands/quests.js";
import { handleButton as handleCraftButton, handleSelect as handleCraftSelect } from "./commands/craft.js";
import { handleButton as handleTriviaButton, handleSelect as handleTriviaSelect } from "./commands/trivia.js";
import { handleButton as handleSetupButton, handleSelect as handleSetupSelect } from "./commands/setup.js";
import { handleButton as handleTicketsButton, handleSelect as handleTicketsSelect } from "./commands/tickets.js";
import { handleButton as handleTutorialsButton, handleSelect as handleTutorialsSelect } from "./commands/tutorials.js";
import {
  startHealthServer,
  getAndResetCommandDeltas
} from "./utils/healthServer.js";
import { flushCommandStats, flushCommandStatsDaily } from "./utils/audit.js";
import { checkRateLimit } from "./utils/ratelimit.js";
import { getRateLimitForCommand } from "./utils/rateLimitConfig.js";
import { sanitizeString } from "./utils/validation.js";
import { canRunCommand, canRunPrefixCommand } from "./utils/permissions.js";
import { getPrefixCommands } from "./prefix/registry.js";
import { checkMetaPerms } from "./prefix/applyMetaPerms.js";
import { parsePrefixArgs, resolveAliasedCommand, suggestCommandNames } from "./prefix/hardening.js";
import { addCommandLog } from "./utils/commandlog.js";
import { botLogger } from "./utils/modernLogger.js";
import { trackCommand, trackCommandInvocation, trackCommandError, trackRateLimit } from "./utils/metrics.js";
import { redisHealthOk } from "./utils/metrics.js";
import { checkRedisHealth, cacheIncr, cacheGet, cacheSet } from "./utils/cache.js";
import { buildErrorEmbed, replyInteraction, replyInteractionIfFresh } from "./utils/interactionReply.js";
import { patchInteractionUiMethods } from "./utils/interactionUiPatch.js";
import { generateCorrelationId } from "./utils/logger.js";
import { claimIdempotencyKey } from "./utils/idempotency.js";
import { installProcessSafety } from "./utils/processSafety.js";
import { recordUserCommandStat } from "./profile/usage.js";
import { runGuildEventAutomations } from "./utils/automations.js";
import { ensureSchema, ensureEconomySchema, loadGuildData } from "./utils/storage.js";
import { runMigrations } from "./utils/migrations/runner.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HARD_DISABLED_SLASH_COMMANDS = new Map([
  ["dashboard", "Dashboard is disabled by this deployment."],
  ["console", "Dashboard is disabled by this deployment."],
  ["agents", "Agent features are disabled by this deployment."],
  ["agent", "Agent features are disabled by this deployment."],
  ["agentkeys", "Agent features are disabled by this deployment."],
  ["pools", "Agent pool features are disabled by this deployment."],
  ["assistant", "Assistant is disabled by this deployment."],
  ["music", "Music is disabled by this deployment."]
]);

function getHardDisabledSlashReason(commandName) {
  if (!DASHBOARD_ENABLED && (commandName === "dashboard" || commandName === "console")) {
    return HARD_DISABLED_SLASH_COMMANDS.get(commandName);
  }
  if (!AGENTS_ENABLED && ["agents", "agent", "agentkeys", "pools", "assistant"].includes(commandName)) {
    return HARD_DISABLED_SLASH_COMMANDS.get(commandName);
  }
  if (!MUSIC_ENABLED && commandName === "music") {
    return HARD_DISABLED_SLASH_COMMANDS.get(commandName);
  }
  return null;
}

function getHardDisabledPrefixReason(name, cmd) {
  if (!MUSIC_ENABLED && cmd?.category === "music") {
    return "Music is disabled by this deployment.";
  }
  if (!AGENTS_ENABLED && name === "agents") {
    return "Agent features are disabled by this deployment.";
  }
  return null;
}

/* ===================== CLIENT ===================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

installProcessSafety("chopsticks-bot", botLogger);

global.client = client;
client.commands = new Collection();

/* ===================== HEALTH/METRICS ===================== */

const healthServer = startHealthServer();

/* ===================== COMMAND LOADER ===================== */

const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs
    .readdirSync(commandsPath, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(".js"))
    .map(d => d.name)
    .sort();

  for (const file of files) {
    const filePath = path.join(commandsPath, file);

    let mod;
    try {
      mod = await import(pathToFileURL(filePath).href);
    } catch (err) {
      botLogger.error({ err, file }, "[command:load] failed");
      continue;
    }

    let cmd =
      mod.default ??
      (mod.data && mod.execute
        ? { data: mod.data, execute: mod.execute, meta: mod.meta, autocomplete: mod.autocomplete }
        : null);

    if (cmd && !cmd.autocomplete && typeof mod.autocomplete === "function") {
      cmd = { ...cmd, autocomplete: mod.autocomplete };
    }

    if (!cmd?.data?.name || typeof cmd.execute !== "function") continue;

    client.commands.set(cmd.data.name, cmd);
  }
}

/* ===================== EVENT LOADER ===================== */

const eventsPath = path.join(__dirname, "events");

if (fs.existsSync(eventsPath)) {
  const files = fs
    .readdirSync(eventsPath, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(".js"))
    .map(d => d.name)
    .sort();

  for (const file of files) {
    const filePath = path.join(eventsPath, file);

    let mod;
    try {
      mod = await import(pathToFileURL(filePath).href);
    } catch (err) {
      botLogger.error({ err, file }, "[event:load] failed");
      continue;
    }

    const event = mod.default;
    if (!event?.name || typeof event.execute !== "function") continue;

    client.on(event.name, async (...args) => {
      try {
        await event.execute(...args);
      } catch (err) {
        botLogger.error({ err, event: event.name }, "[event] handler threw");
      }
    });
  }
}

/* ===================== INTERACTIONS ===================== */

client.once(Events.ClientReady, async () => {
  botLogger.info(`✅ Ready as ${client.user.tag}`);
  botLogger.info(`📊 Serving ${client.guilds.cache.size} guilds`);
  
  // Seed achievement definitions into DB (idempotent)
  try {
    const { ensureAchievementsSeed } = await import('./game/achievements.js');
    await ensureAchievementsSeed();
  } catch {}
  
  // Auto-register all commands in help registry
  try {
    await registerAllCommands();
    const loadedCount = client.commands.size;
    botLogger.info(`📚 Help registry initialized with ${loadedCount} commands`);
    if (loadedCount < 50) {
      botLogger.warn({ loadedCount }, "⚠️  Fewer commands than expected loaded — check for import errors above");
    }
  } catch (err) {
    botLogger.warn({ err }, `⚠️  Help registry initialization failed`);
  }

  // Rotating bot presence — cycles every 20s, prefix-command focused with live stats
  let presenceTimer = null;
  let _presenceTick = 0;
  try {
    const enabled = String(process.env.BOT_PRESENCE_ENABLED ?? "true").toLowerCase() !== "false";
    if (enabled && client.user) {
      const botStatus = String(process.env.BOT_PRESENCE_STATUS || "online");

      function buildActivities() {
        const guilds  = client.guilds.cache.size;
        const cmdCount = 162; // prefix command count (static — avoids async in timer)
        const activities = [
          { name: `!help — ${cmdCount} prefix commands`,      type: ActivityType.Playing   },
          { name: `${guilds} server${guilds !== 1 ? "s" : ""} | !help`, type: ActivityType.Watching },
          { name: `!rank — check your XP & level`,            type: ActivityType.Playing   },
          { name: `!top — XP leaderboard`,                    type: ActivityType.Competing },
          { name: `!blackjack — wager credits`,               type: ActivityType.Playing   },
        ];
        activities.push({ name: "VoiceMaster temp rooms", type: ActivityType.Watching });
        activities.push({ name: "Moderation + server tools", type: ActivityType.Playing });
        return activities;
      }

      function rotatePresence() {
        if (!client.isReady()) return;
        try {
          const acts = buildActivities();
          _presenceTick = (_presenceTick + 1) % acts.length;
          client.user.setPresence({ activities: [acts[_presenceTick]], status: botStatus });
        } catch {}
      }

      rotatePresence();
      presenceTimer = setInterval(rotatePresence, 20_000);
      presenceTimer.unref();
    }
  } catch {}

  if (AGENTS_ENABLED) botLogger.warn("AGENTS_ENABLED=true but this lean build does not support that optional stack.");
  else botLogger.info("AGENTS_ENABLED=false.");
  if (MUSIC_ENABLED) botLogger.warn("MUSIC_ENABLED=true but this lean build does not support that optional stack.");
  else botLogger.info("MUSIC_ENABLED=false.");
  if (DASHBOARD_ENABLED) botLogger.warn("DASHBOARD_ENABLED=true but this lean build does not support that optional stack.");
  else botLogger.info("DASHBOARD_ENABLED=false.");

  // Ensure database schema is up-to-date
  try {
    await ensureSchema();
    botLogger.info("✅ Database schema ensured.");
    await ensureEconomySchema();
    botLogger.info("✅ Economy schema ensured.");
    
    // Run database migrations (Level 1: Invariants Locked)
    await runMigrations();
    botLogger.info("✅ Database migrations completed.");
  } catch (err) {
    botLogger.error({ err }, "❌ Database schema assurance failed");
    return;
  }
  botLogger.info("Lean runtime initialized without removed optional stacks.");

  const flushMs = Math.max(5_000, Math.trunc(Number(process.env.ANALYTICS_FLUSH_MS || 15000)));
  const flushTimer = setInterval(() => {
    const deltas = getAndResetCommandDeltas();
    const rows = [];
    for (const r of deltas.global) {
      rows.push({ guildId: null, ...r });
    }
    for (const r of deltas.perGuild) {
      rows.push({ guildId: r.guildId, command: r.command, ok: r.ok, err: r.err, totalMs: r.totalMs, count: r.count });
    }
    if (rows.length) {
      flushCommandStats(rows).catch(() => {});
      flushCommandStatsDaily(rows).catch(() => {});
    }
  }, flushMs);

  const shutdown = async (signal) => {
    global.__botShuttingDown = true;
    botLogger.info({ signal }, "[shutdown] Graceful shutdown initiated");
    clearInterval(flushTimer);
    if (presenceTimer) clearInterval(presenceTimer);

    // 1. Flush pending command stats to DB
    try {
      const deltas = getAndResetCommandDeltas();
      const rows = [];
      for (const r of deltas.global) rows.push({ guildId: null, ...r });
      for (const r of deltas.perGuild) {
        rows.push({ guildId: r.guildId, command: r.command, ok: r.ok, err: r.err, totalMs: r.totalMs, count: r.count });
      }
      if (rows.length) {
        await flushCommandStats(rows);
        await flushCommandStatsDaily(rows);
      }
    } catch {}

    // 2. Disconnect Discord client
    try {
      await client.destroy();
    } catch {}

    // 3. Stop health server
    try {
      healthServer?.close?.();
    } catch {}

    // 4. Close Redis connection
    try {
      const { closeRedis } = await import("./utils/redis.js");
      await closeRedis();
    } catch {}

    // 5. Close PostgreSQL pool
    try {
      const { closeStoragePg } = await import("./utils/storage_pg.js");
      await closeStoragePg();
    } catch {}

    botLogger.info("[shutdown] Clean exit");
    // Force exit after 5s in case something is hanging
    setTimeout(() => process.exit(0), 5_000).unref();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  /* ===================== TEMP ROLE EXPIRY LOOP ===================== */
  setInterval(async () => {
    try {
      const { getExpiredTempRoles, removeTempRole } = await import("./tools/roles/menus.js");
      for (const guild of client.guilds.cache.values()) {
        try {
          const expired = await getExpiredTempRoles(guild.id);
          for (const record of expired) {
            const member = await guild.members.fetch(record.userId).catch(() => null);
            if (member && member.roles.cache.has(record.roleId)) {
              await member.roles.remove(record.roleId, "Temp role expired").catch(() => null);
            }
            await removeTempRole(guild.id, record.userId, record.roleId);
          }
        } catch { /* per-guild error must not stop others */ }
      }
    } catch { /* expiry loop must never crash */ }
  }, 60_000);

  /* ===================== STREAM NOTIFICATION POLLERS ===================== */
  {
    const { pollTwitchNotifications } = await import("./tools/notify/twitch.js");
    const { pollYouTubeNotifications } = await import("./tools/notify/youtube.js");
    // Twitch: poll every 5 minutes
    setInterval(() => pollTwitchNotifications(client).catch(() => null), 5 * 60_000);
    // YouTube: poll every 15 minutes
    setInterval(() => pollYouTubeNotifications(client).catch(() => null), 15 * 60_000);
  }

});

/* ===================== PREFIX COMMANDS ===================== */

const prefixCommands = await getPrefixCommands();
const MUTATION_COMMANDS = new Set([
  "daily",
  "work",
  "pay",
  "bank",
  "gather",
  "use",
  "warn",
  "timeout",
  "ban",
  "kick",
  "purge",
  "pools",
  "agents"
]);

// ── DM Relay: maps relayed message ID → { userId, expiresAt } ──────────────
// Also tracks per-(guild,user) thread ID so all DMs from the same user are threaded.
const DM_RELAY_TTL_MS       = 48 * 60 * 60 * 1000; // 48 h
const DM_RELAY_MAP_MAX      = 5_000;
const dmRelayMap            = new Map(); // relayMsgId → { userId, expiresAt }
const dmRelayThreadMap      = new Map(); // `${guildId}:${userId}` → threadId

function dmRelaySet(msgId, userId) {
  // Prune a stale entry when at capacity
  if (dmRelayMap.size >= DM_RELAY_MAP_MAX) {
    const now = Date.now();
    // First try to evict an expired entry
    let evicted = false;
    for (const [k, v] of dmRelayMap) {
      if (v.expiresAt < now) { dmRelayMap.delete(k); evicted = true; break; }
    }
    // Fall back to FIFO eviction
    if (!evicted) dmRelayMap.delete(dmRelayMap.keys().next().value);
  }
  dmRelayMap.set(msgId, { userId, expiresAt: Date.now() + DM_RELAY_TTL_MS });
}

function dmRelayGet(msgId) {
  const entry = dmRelayMap.get(msgId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { dmRelayMap.delete(msgId); return null; }
  return entry.userId;
}

client.on(Events.MessageCreate, async message => {
  if (message.author?.bot) return;

  // ── DM Passthrough relay ──────────────────────────────────────────────────
  if (!message.guildId) {
    try {
      const { getPool } = await import("./utils/storage_pg.js");
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT guild_id, data->>'dmRelayChannelId' AS relay_ch
           FROM guild_settings
          WHERE data->>'dmRelayChannelId' IS NOT NULL`
      );
      if (!rows.length) return;

      const user    = message.author;
      const content = message.content?.slice(0, 1800) || "(no text)";
      const attachments = message.attachments.size
        ? [...message.attachments.values()].map(a => a.url)
        : [];

      const { EmbedBuilder } = await import("discord.js");

      for (const row of rows) {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        const ch = guild.channels.cache.get(row.relay_ch);
        if (!ch?.isTextBased?.()) continue;

        const threadKey = `${guild.id}:${user.id}`;
        let thread = null;

        // Try to reuse an existing active thread for this user
        const existingThreadId = dmRelayThreadMap.get(threadKey);
        if (existingThreadId) {
          thread = ch.threads?.cache.get(existingThreadId)
            ?? await ch.threads?.fetch(existingThreadId).catch(() => null);
          if (thread?.archived) {
            await thread.setArchived(false).catch(() => {});
          }
          if (thread?.locked) thread = null; // can't post to locked threads
        }

        // Create a thread if none exists
        if (!thread && ch.threads?.create) {
          thread = await ch.threads.create({
            name: `DM — ${user.username} (${user.id})`,
            autoArchiveDuration: 10080, // 7 days
            reason: `DM relay thread for ${user.username}`
          }).catch(() => null);
          if (thread) dmRelayThreadMap.set(threadKey, thread.id);
        }

        const embed = new EmbedBuilder()
          .setDescription(content + (attachments.length ? `\n📎 ${attachments.join(" ")}` : ""))
          .setColor(0x5865F2)
          .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL?.() ?? undefined })
          .setFooter({ text: `Reply to this message to respond via DM  ·  User ID: ${user.id}` })
          .setTimestamp();

        const target = thread ?? ch;
        const relayMsg = await target.send({ embeds: [embed] }).catch(() => null);
        if (relayMsg) dmRelaySet(relayMsg.id, user.id);

        // If we just created the thread, also pin a header in the parent channel
        if (thread && !existingThreadId) {
          const header = new EmbedBuilder()
            .setDescription(`📬 DM thread opened with **${user.username}** (<@${user.id}>)\nAll messages in <#${thread.id}>`)
            .setColor(0x5865F2)
            .setTimestamp();
          await ch.send({ embeds: [header] }).catch(() => {});
        }
      }
    } catch (err) {
      botLogger.error({ err }, "[dm-relay] Failed to relay DM");
    }
    return;
  }

  // ── DM Passthrough: staff reply forwarding ────────────────────────────────
  if (message.guildId && message.reference?.messageId) {
    const refId        = message.reference.messageId;
    const targetUserId = dmRelayGet(refId);
    if (targetUserId) {
      const staffPerms = message.member?.permissions;
      const isStaff = staffPerms?.has(PermissionFlagsBits.ManageMessages) ||
                      staffPerms?.has(PermissionFlagsBits.ModerateMembers) ||
                      staffPerms?.has(PermissionFlagsBits.ManageGuild) ||
                      staffPerms?.has(PermissionFlagsBits.Administrator);
      if (isStaff) {
        try {
          const { EmbedBuilder } = await import("discord.js");
          const targetUser = await client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            const staffContent = message.content?.slice(0, 1800) || "(no text)";
            const guild         = message.guild;
            const replyEmbed    = new EmbedBuilder()
              .setDescription(staffContent)
              .setColor(0x57F287)
              .setAuthor({ name: `Support — ${guild?.name ?? "Staff"}`, iconURL: guild?.iconURL() ?? undefined })
              .setFooter({ text: "This is a reply from the support team" })
              .setTimestamp();
            const sent = await targetUser.send({ embeds: [replyEmbed] }).catch(() => null);
            await message.react(sent ? "✅" : "❌").catch(() => {});
          }
        } catch {}
      } else {
        // Non-staff replied to a relay message — inform them quietly
        await message.react("🔒").catch(() => {});
      }
    }
  }

  // ── Antispam enforcement ──────────────────────────────────────────────────
  if (message.guildId && message.guild) {
    try {
      const gd = await loadGuildData(message.guildId);
      const as = gd?.antispam;
      if (as?.enabled && as.threshold > 0) {
        const key = `antispam:${message.guildId}:${message.author.id}`;
        const count = await cacheIncr(key, as.window || 10);
        if (count >= as.threshold) {
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          if (member && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            if (as.action === "ban") {
              await member.ban({ reason: "Antispam: message threshold exceeded" }).catch(() => {});
            } else if (as.action === "kick") {
              await member.kick("Antispam: message threshold exceeded").catch(() => {});
            } else {
              // mute: apply communication timeout for window duration (min 60s)
              const muteMs = Math.max((as.window || 10) * 2, 60) * 1000;
              await member.timeout(muteMs, "Antispam: message threshold exceeded").catch(() => {});
            }
            await message.delete().catch(() => {});
            return;
          }
        }
      }
    } catch {}
  }

  // ── AutoMod content filtering ─────────────────────────────────────────────
  if (message.guildId && message.guild) {
    try {
      const { processAutomod, enforceAutomod } = await import("./tools/automod/engine.js");
      const hit = await processAutomod(message);
      if (hit) {
        await enforceAutomod(message, hit);
        return; // stop further processing for this message
      }
    } catch { /* automod must never crash the bot */ }
  }

  // ── Analytics: count messages per day ────────────────────────────────────
  if (message.guildId) {
    (async () => {
      try {
        const { loadGuildData: lgd, saveGuildData: sgd } = await import("./utils/storage.js");
        const gd = await lgd(message.guildId);
        const key = new Date().toISOString().slice(0, 10);
        gd.analytics ??= {};
        gd.analytics.messages ??= {};
        gd.analytics.messages[key] ??= { total: 0 };
        gd.analytics.messages[key].total++;
        // Prune to 30 days
        const days = Object.keys(gd.analytics.messages).sort();
        if (days.length > 30) delete gd.analytics.messages[days[0]];
        await sgd(message.guildId, gd);
      } catch {}
    })();
  }

  // ── Auto-thread & Auto-publish ────────────────────────────────────────────
  if (message.guildId && message.guild && !message.system) {
    (async () => {
      try {
        const gd = await loadGuildData(message.guildId);
        const threads = gd?.threads;
        if (threads?.autoThread?.some(e => e.channelId === message.channelId)) {
          const entry = threads.autoThread.find(e => e.channelId === message.channelId);
          const threadName = entry.prefix
            ? `${entry.prefix} — ${message.author.username}`
            : (message.content.slice(0, 50) || `Thread by ${message.author.username}`);
          await message.startThread({ name: threadName, autoArchiveDuration: 1440 }).catch(() => null);
        }
        if (threads?.autoPublish?.includes(message.channelId)) {
          if (message.crosspostable) await message.crosspost().catch(() => null);
        }
      } catch {}
    })();
  }

  // ── Custom commands ───────────────────────────────────────────────────────
  if (message.guildId && message.content) {
    (async () => {
      try {
        const gd = await loadGuildData(message.guildId);
        const prefix = gd?.prefix ?? "!";
        if (message.content.startsWith(prefix)) {
          const [cmdName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
          if (cmdName) {
            const { getCustomCmd } = await import("./tools/customcmd/store.js");
            const { executeCustomCmd } = await import("./tools/customcmd/executor.js");
            const cmd = await getCustomCmd(message.guildId, cmdName.toLowerCase());
            if (cmd) await executeCustomCmd(message, cmd, args);
          }
        }
      } catch {}
    })();
  }

  // ── Auto-responders ───────────────────────────────────────────────────────
  if (message.guildId) {
    (async () => {
      const { processAutoresponders } = await import("./commands/autoresponder.js");
      await processAutoresponders(message);
    })().catch(() => null);
  }

  // ── Keyword highlights ────────────────────────────────────────────────────
  if (message.guildId) {
    (async () => {
      const { processHighlights } = await import("./commands/highlight.js");
      await processHighlights(message);
    })().catch(() => null);
  }

    void runGuildEventAutomations({
      guild: message.guild,
      eventKey: "message_create",
      channel: message.channel,
      user: message.author,
      message
    }).catch(() => {});

  // ── Per-guild message XP + stats ────────────────────────────────────────
  if (message.guildId && !message.author.bot) {
    void (async () => {
      try {
        const { addStat } = await import('./game/activityStats.js');
        const { addGuildXp } = await import('./game/guildXp.js');
        addStat(message.author.id, message.guildId, 'messages_sent', 1);
        await addGuildXp(message.author.id, message.guildId, 'message', { client }).catch(() => {});
      } catch {}
    })();
  }

  // ── AFK system ────────────────────────────────────────────────────────────
  if (message.guildId) {
    void (async () => {
      try {
        const { cacheGet, cacheSet, getRedis } = await import("./utils/cache.js");
        const clearAfk = async (k) => {
          try { const rc = getRedis(); if (rc) { await rc.del(k); return; } } catch {}
          await cacheSet(k, "", 1).catch(() => {});
        };
        const authorKey = `afk:${message.guildId}:${message.author.id}`;
        // Clear AFK if the AFK user speaks
        const authorAfk = await cacheGet(authorKey).catch(() => null);
        if (authorAfk) {
          await clearAfk(authorKey);
          await message.reply({ content: "👋 Welcome back! Your AFK status has been cleared.", allowedMentions: { repliedUser: false } }).catch(() => {});
        }
        // Notify if mentioned user is AFK
        if (message.mentions.users.size > 0) {
          for (const [uid, user] of message.mentions.users) {
            if (uid === message.author.id) continue;
            const afkKey = `afk:${message.guildId}:${uid}`;
            const afkRaw = await cacheGet(afkKey).catch(() => null);
            if (!afkRaw) continue;
            try {
              const { reason, since } = JSON.parse(afkRaw);
              const sinceStr = since ? `<t:${Math.floor(since / 1000)}:R>` : "";
              await message.reply({
                content: `💤 **${user.username}** is AFK${sinceStr ? ` (${sinceStr})` : ""}: *${reason}*`,
                allowedMentions: { repliedUser: false }
              }).catch(() => {});
            } catch {}
          }
        }
      } catch {}
    })();
  }

  let prefix = "!";
  let aliases = {};
  let guildData = null;
  if (message.guildId) {
    try {
      guildData = await loadGuildData(message.guildId);
      prefix = guildData?.prefix?.value || "!";
      aliases = guildData?.prefix?.aliases || {};
    } catch {}
  }

  // Music "Audio Drops": if enabled for this channel, show a button-driven panel
  // to play uploaded audio attachments in voice via agents.
  if (message.guildId) {
    void maybeHandleAudiobookMessage(message).catch(() => {});
  }

  if (!message.content?.startsWith(prefix)) return;

  const raw = message.content.slice(prefix.length).trim();
  if (!raw) return;
  // Guard: ignore messages with pathologically long raw content
  if (raw.length > 2000) return;

  const parts = parsePrefixArgs(raw);
  if (!parts.length) return;
  const requestedName = String(parts.shift() || "").toLowerCase();
  const aliasResolution = resolveAliasedCommand(requestedName, aliases, 20);
  if (!aliasResolution.ok) {
    if (aliasResolution.error === "cycle" || aliasResolution.error === "depth" || aliasResolution.error === "invalid-target") {
      try {
        const hintRate = await checkRateLimit(`pfx:aliaswarn:${message.author.id}`, 1, 15);
        if (hintRate.ok) {
          await message.reply("Alias configuration error detected. Run `/alias list` and fix alias chains.");
        }
      } catch {}
    }
    return;
  }
  const name = aliasResolution.commandName;

  // Global prefix burst guard — 5 requests per 3s across ALL commands (silent drop, !help exempt)
  if (name !== "help") {
    try {
      const burstRl = await checkRateLimit(`pfx:burst:${message.author.id}`, 5, 3);
      if (!burstRl.ok) return; // Silent drop — no reply to avoid spam embeds in chat
    } catch {}
  }

  // prefix rate limit (per-command)
  try {
    const rl = await checkRateLimit(`pfx:${message.author.id}:${name}`, 5, 10);
    if (!rl.ok) return;
  } catch {}

  let cmd = prefixCommands.get(name);
  if (!cmd && message.guildId && guildData) {
    try {
      const custom = guildData.customCommands?.[name];
      if (custom?.response) {
        const rendered = custom.response
          .replace("{user}", `<@${message.author.id}>`)
          .replace("{user.tag}", message.author.tag)
          .replace("{guild}", message.guild?.name || "")
          .replace("{channel}", message.channel?.name || "");
        await message.reply(rendered).catch(() => {});
        return;
      }
      const macro = guildData.macros?.[name];
      if (Array.isArray(macro) && macro.length) {
        let count = 0;
        for (const step of macro) {
          if (count++ >= 10) break;
          const target = prefixCommands.get(step.name);
          if (!target) continue;
          const gate2 = await canRunPrefixCommand(message, step.name, target);
          if (!gate2.ok) continue;
          const hardDisabledMacroReason = getHardDisabledPrefixReason(step.name, target);
          if (hardDisabledMacroReason) continue;
          await target.execute(message, step.args || [], { prefix, commands: prefixCommands });
        }
        return;
      }
    } catch {}
  }
  if (!cmd) {
    const candidates = [
      ...prefixCommands.keys(),
      ...Object.keys(aliases || {}),
      ...Object.keys(guildData?.customCommands || {}),
      ...Object.keys(guildData?.macros || {})
    ];
    const suggestions = suggestCommandNames(name, candidates, 3);
    if (suggestions.length) {
      try {
        const hintRate = await checkRateLimit(`pfx:unknown:${message.author.id}`, 1, 15);
        if (hintRate.ok) {
          const line = suggestions.map(s => `\`${prefix}${s}\``).join(", ");
          await message.reply(`Unknown command \`${name}\`. Try: ${line}`);
        }
      } catch {}
    }
    return;
  }

  // Per-command cooldown (in addition to global rate limit)
  if (cmd?.rateLimit) {
    try {
      const cmdRl = await checkRateLimit(`pfx:cd:${message.author.id}:${name}`, 1, cmd.rateLimit / 1000);
      if (!cmdRl.ok) {
        const cooldownSec = Math.ceil(cmd.rateLimit / 1000);
        await message.reply(`⏳ Slow down! \`${prefix}${name}\` has a ${cooldownSec}s cooldown.`).catch(() => {});
        return;
      }
    } catch {}
  }

  const gate = await canRunPrefixCommand(message, cmd.name, cmd);
  if (!gate.ok) return;

  const hardDisabledPrefixReason = getHardDisabledPrefixReason(name, cmd);
  if (hardDisabledPrefixReason) {
    await message.reply({ content: `❌ ${hardDisabledPrefixReason}` }).catch(() => {});
    return;
  }

  // Enforce slash-command meta.userPerms for prefix path
  const permCheck = await checkMetaPerms(message, name);
  if (!permCheck.ok) {
    await message.reply({ content: `❌ ${permCheck.reason}` }).catch(() => {});
    return;
  }

  const prefixStartedAt = Date.now();
  try {
    const sanitizedArgs = parts.map(a => (typeof a === "string" ? sanitizeString(a) : a));
    await cmd.execute(message, sanitizedArgs, { prefix, commands: prefixCommands });
    const duration = Date.now() - prefixStartedAt;
    trackCommandInvocation(cmd.name, "prefix");
    void recordUserCommandStat({
      userId: message.author.id,
      command: cmd.name,
      ok: true,
      durationMs: duration,
      source: "prefix"
    }).catch(() => {});
    if (message.guildId) {
      await addCommandLog(message.guildId, {
        name: cmd.name,
        userId: message.author.id,
        at: Date.now(),
        ok: true,
        source: "prefix"
      });
    }
  } catch (err) {
    botLogger.error({ err, command: cmd.name }, "[prefix] command handler threw");
    const duration = Date.now() - prefixStartedAt;
    void recordUserCommandStat({
      userId: message.author.id,
      command: cmd.name,
      ok: false,
      durationMs: duration,
      source: "prefix"
    }).catch(() => {});
    if (message.guildId) {
      await addCommandLog(message.guildId, {
        name: cmd.name,
        userId: message.author.id,
        at: Date.now(),
        ok: false,
        source: "prefix"
      });
    }
    try {
      await message.reply({ content: `❌ Something went wrong with \`${prefix}${cmd.name}\`. Please try again.`, allowedMentions: { repliedUser: false } });
    } catch {}
  }
});

/* ===================== INTERACTIONS ===================== */

client.on(Events.InteractionCreate, async interaction => {
  patchInteractionUiMethods(interaction);

  if (
    interaction.isStringSelectMenu?.() ||
    interaction.isRoleSelectMenu?.() ||
    interaction.isUserSelectMenu?.()
  ) {
    try {
      if (await handleAudiobookSelect(interaction)) return;
      if (await handleTicketsSelect(interaction)) return;
      if (await handleSetupSelect(interaction)) return;
      if (await handleTriviaSelect(interaction)) return;
      if (await handleGameSelect(interaction)) return;
      if (await handleCraftSelect(interaction)) return;
      if (await handleTutorialsSelect(interaction)) return;
      if (await handleHelpSelect(interaction)) return;
      if (await handleCommandsSelect(interaction)) return;
      if (await handleVoiceSelect(interaction)) return;
      // Role menu select
      {
        const { handleRoleMenuSelect } = await import("./tools/roles/handler.js");
        if (await handleRoleMenuSelect(interaction)) return;
      }
    } catch (err) {
      botLogger.error({ err }, "[select] interaction handler threw");
      try {
        await replyInteractionIfFresh(interaction, {
          embeds: [buildErrorEmbed("Selection failed.")]
        });
      } catch {}
    }
  }

  if (interaction.isButton?.()) {
    try {
      if (await handleAudiobookButton(interaction)) return;
      if (await handleTicketsButton(interaction)) return;
      if (await handleSetupButton(interaction)) return;
      if (await handleTriviaButton(interaction)) return;
      if (await handleGameButton(interaction)) return;
      if (await handleQuestsButton(interaction)) return;
      if (await handleCraftButton(interaction)) return;
      if (await handleCommandsButton(interaction)) return;
      if (await handleVoiceButton(interaction)) return;
      if (await handlePurgeButton(interaction)) return;
      if (await handleGiveawayButton(interaction)) return;
      if (await handleBackupButton(interaction)) return;
      if (await handlePetButton(interaction)) return;
      if (await handleTutorialsButton(interaction)) return;
      // Verification system button
      if (interaction.customId === "chopsticks:verify:button") {
        const { handleVerifyButton } = await import("./tools/verify/handler.js");
        await handleVerifyButton(interaction);
        return;
      }
      // Marriage proposal buttons
      if (interaction.customId.startsWith("chopsticks:marry:")) {
        const { handleMarryButton } = await import("./commands/marry.js");
        await handleMarryButton(interaction);
        return;
      }
      // Role menu buttons
      {
        const { handleRoleMenuButton } = await import("./tools/roles/handler.js");
        if (await handleRoleMenuButton(interaction)) return;
      }
    } catch (err) {
      botLogger.error({ err }, "[button] interaction handler threw");
      try {
        await replyInteractionIfFresh(interaction, {
          embeds: [buildErrorEmbed("Button action failed.")]
        });
      } catch {}
    }
  }

  if (interaction.isModalSubmit?.()) {
    try {
      if (await handleVoiceModal(interaction)) return;
      if (await handleModelModal(interaction)) return;
      if (await handleAiModal(interaction)) return;
    } catch (err) {
      botLogger.error({ err }, "[modal] interaction handler threw");
      try {
        await replyInteractionIfFresh(interaction, {
          embeds: [buildErrorEmbed("Form submit failed.")]
        });
      } catch {}
    }
  }

  if (interaction.isAutocomplete?.()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) {
      try { await interaction.respond([]); } catch {}
      return;
    }
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      botLogger.error({ err }, "[autocomplete] interaction handler threw");
      try {
        await interaction.respond([]);
      } catch {}
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const startTime = Date.now();
  const requestId = interaction.id || generateCorrelationId();
  const commandLog = botLogger.child({
    requestId,
    commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId
  });
  commandLog.info("Command received");

  const command = client.commands.get(commandName);

  if (!command) {
    commandLog.warn("No matching command found");
    return;
  }

  const hardDisabledSlashReason = getHardDisabledSlashReason(commandName);
  if (hardDisabledSlashReason) {
    await replyInteraction(interaction, { content: `❌ ${hardDisabledSlashReason}` });
    return;
  }

  try {
    const { limit: rlLimit, windowSec: rlWindow } = getRateLimitForCommand(
      commandName,
      command.meta?.category
    );
    const rl = await checkRateLimit(
      `slash:${interaction.user.id}:${commandName}`,
      rlLimit,
      rlWindow
    );
    if (!rl.ok) {
      trackRateLimit("command");
      await replyInteraction(interaction, {
        content: `Rate limited. Try again in about ${rl.resetIn}s.`
      });
      commandLog.warn({ resetInSec: rl.resetIn, category: command.meta?.category }, "Slash command rate limited");
      return;
    }
  } catch (error) {
    commandLog.warn({ error: error?.message ?? String(error) }, "Rate limiter backend error; continuing");
  }

  if (MUTATION_COMMANDS.has(commandName)) {
    try {
      const first = await claimIdempotencyKey(`interaction:${interaction.id}`, 300);
      if (!first) {
        commandLog.warn("Duplicate mutation interaction ignored by idempotency guard");
        await replyInteractionIfFresh(interaction, {
          content: "Duplicate request ignored."
        });
        return;
      }
    } catch (error) {
      commandLog.warn({ error: error?.message ?? String(error) }, "Idempotency backend error; continuing");
    }
  }

  const gate = await canRunCommand(interaction, commandName, command.meta || {});
  if (!gate.ok) {
    const reason = gate.reason || "unknown";
    let msg = "You cannot run this command.";
    if (reason === "disabled") msg = "This command is disabled in this server.";
    else if (reason === "disabled-category") msg = "This command category is disabled in this server.";
    else if (reason === "no-perms" || reason === "missing-perms" || reason === "missing-role") msg = "You do not have permission to run this command.";

    try {
      await replyInteraction(interaction, { content: msg });
    } catch {}
    return;
  }

  // Feature gate: check if the command's category is enabled in this server's theme
  if (interaction.guildId) {
    try {
      const CATEGORY_FEATURE_MAP = {
        economy: "economy", bank: "economy", shop: "economy", casino: "economy",
        music: "music",
        ai: "ai", assistant: "ai",
        levels: "leveling", xp: "leveling", leaderboard: "leveling",
        voice: "voicemaster",
        tickets: "tickets",
        mod: "moderation", moderation: "moderation",
        fun: "fun", games: "fun",
        social: "social",
        notify: "notifications",
      };
      const feat = CATEGORY_FEATURE_MAP[command.meta?.category] ?? CATEGORY_FEATURE_MAP[commandName];
      if (feat) {
        const { getTheme } = await import("./utils/theme.js");
        const theme = await getTheme(interaction.guildId);
        if (theme.features[feat] === false) {
          await replyInteraction(interaction, { content: `> The **${feat}** module is disabled in this server.` });
          return;
        }
      }
    } catch { /* feature gate errors must not block commands */ }
  }

  try {
    await command.execute(interaction);
    
    // Track successful command execution
    const duration = Date.now() - startTime;
    trackCommand(commandName, duration, "success");
    trackCommandInvocation(commandName, "slash");
    void recordUserCommandStat({
      userId: interaction.user.id,
      command: commandName,
      ok: true,
      durationMs: duration,
      source: "slash"
    }).catch(() => {});
    // Per-guild commands_used stat (fire-and-forget)
    if (interaction.guildId) {
      void import('./game/activityStats.js').then(m => m.addStat(interaction.user.id, interaction.guildId, 'commands_used', 1)).catch(() => {});
      // Analytics: track command uses
      (async () => {
        try {
          const { loadGuildData: lgd2, saveGuildData: sgd2 } = await import("./utils/storage.js");
          const g2 = await lgd2(interaction.guildId);
          g2.analytics ??= {};
          g2.analytics.commandUses ??= {};
          g2.analytics.commandUses[commandName] = (g2.analytics.commandUses[commandName] ?? 0) + 1;
          await sgd2(interaction.guildId, g2);
        } catch {}
      })();
    }
    commandLog.info({ duration }, "Command executed successfully");
    
  } catch (error) {
    const duration = Date.now() - startTime;
    trackCommand(commandName, duration, "error");
    trackCommandError(commandName);
    void recordUserCommandStat({
      userId: interaction.user.id,
      command: commandName,
      ok: false,
      durationMs: duration,
      source: "slash"
    }).catch(() => {});
    
    commandLog.error({
      error: error.message, 
      stack: error.stack,
    }, "Command execution failed");
    
    const errorMsg = process.env.NODE_ENV === 'development' 
      ? `Command failed: ${error?.message ?? String(error)}`
      : "Command failed.";
    
    try {
      await replyInteraction(interaction, {
        embeds: [buildErrorEmbed(errorMsg)]
      });
    } catch (replyError) {
      commandLog.error({ error: replyError.message }, "Failed to send error response");
    }
  }
});

/* ===================== LOGIN ===================== */

const skipDiscordLogin = String(process.env.CI_SKIP_DISCORD_LOGIN || "false").toLowerCase() === "true";
if (skipDiscordLogin) {
  botLogger.warn("CI_SKIP_DISCORD_LOGIN=true - starting control plane without Discord gateway login");
} else {
  if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN missing");
  await client.login(process.env.DISCORD_TOKEN);
}

// Periodic Redis health check — update metric every 30 seconds
setInterval(async () => {
  try {
    const ok = await checkRedisHealth();
    redisHealthOk.set(ok ? 1 : 0);
  } catch {
    redisHealthOk.set(0);
  }
}, 30_000).unref();

// Birthday & Events reminder scheduler — runs every hour
setInterval(async () => {
  try {
    const { getPool } = await import("./utils/storage_pg.js");
    const res = await getPool().query("SELECT guild_id, data FROM guild_settings WHERE data IS NOT NULL");
    const now = new Date();
    const todayMD = `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

    for (const row of res.rows) {
      const guildId = row.guild_id;
      const data = row.data || {};

      // Birthday reminders
      if (data.birthdays) {
        const birthdayChannelId = data.birthdayChannelId;
        const guild = client.guilds.cache.get(guildId);
        if (guild && birthdayChannelId) {
          const channel = guild.channels.cache.get(birthdayChannelId);
          if (channel?.isTextBased()) {
            for (const [userId, info] of Object.entries(data.birthdays)) {
              if (info.date === todayMD) {
                const alreadyKey = `bday:${guildId}:${userId}:${now.getUTCFullYear()}`;
                const already = await cacheGet(alreadyKey);
                if (!already) {
                  await cacheSet(alreadyKey, 1, 86400);
                  channel.send(`🎂 Happy Birthday <@${userId}>!`).catch(() => {});
                }
              }
            }
          }
        }
      }

      // Events reminders (10 minutes before)
      if (Array.isArray(data.events)) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const upcoming = data.events.filter(e => {
            const t = new Date(e.time_iso).getTime();
            const diff = t - now.getTime();
            return diff > 0 && diff <= 10 * 60 * 1000; // within next 10 min
          });
          for (const ev of upcoming) {
            const reminderKey = `evtremind:${guildId}:${ev.id}`;
            const already = await cacheGet(reminderKey);
            if (!already) {
              await cacheSet(reminderKey, 1, 700);
              const evtCh = data.eventChannelId ? guild.channels.cache.get(data.eventChannelId) : null;
              const target = evtCh?.isTextBased() ? evtCh : null;
              if (target) {
                target.send(`📅 **Event reminder:** "${ev.title}" starts in ~10 minutes!`).catch(() => {});
              }
            }
          }
        }
      }
    }
  } catch {}
}, 60 * 60 * 1000).unref(); // every hour

// Stats channels — refresh channel names every 10 minutes
setInterval(async () => {
  try {
    const { refreshStatsChannels } = await import("./commands/statschannel.js");
    await refreshStatsChannels(client);
  } catch {}
}, 10 * 60 * 1000).unref();
