import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder
} from "discord.js";

import { Colors } from "../utils/discordOutput.js";
import { showVoiceConsole } from "../tools/voice/ui.js";
import { getVoiceState } from "../tools/voice/schema.js";
import { ensureCustomVcsState, getCustomVcConfig } from "../tools/voice/customVcsState.js";
import { buildCustomVcPanelMessage } from "../tools/voice/customVcsUi.js";

export const meta = {
  deployGlobal: false,
  guildOnly: false,
  userPerms: [],
  category: "info"
};

const TUTORIAL_UI_PREFIX = "tutorialsui";

const TOPICS = [
  { key: "start", label: "Start Here", description: "Lean setup path for the hosted bot." },
  { key: "v1", label: "Readiness", description: "Voice and permissions readiness checklist." },
  { key: "voice", label: "VoiceMaster", description: "Auto temp rooms from lobbies." },
  { key: "customvcs", label: "Custom VCs", description: "Panel-based room creation and control." },
  { key: "moderation", label: "Moderation", description: "Core moderation and audit flow." },
  { key: "troubleshooting", label: "Troubleshooting", description: "Common hosted-bot issues." }
];

export const data = new SlashCommandBuilder()
  .setName("tutorials")
  .setDescription("Interactive tutorials and quick-start control center");

function hasManageGuild(interaction) {
  const perms = interaction.memberPermissions;
  return Boolean(
    perms?.has?.(PermissionFlagsBits.ManageGuild) ||
    perms?.has?.(PermissionFlagsBits.Administrator)
  );
}

function uiId(kind, userId, topicKey) {
  return `${TUTORIAL_UI_PREFIX}:${kind}:${userId}:${encodeURIComponent(String(topicKey || "start"))}`;
}

function parseUiId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== TUTORIAL_UI_PREFIX) return null;
  return {
    kind: parts[1],
    userId: parts[2],
    topicKey: decodeURIComponent(parts.slice(3).join(":"))
  };
}

function buildBaseEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(String(description || "").slice(0, 4096))
    .setColor(Colors.INFO)
    .setTimestamp();
}

function checklistLine(status, text) {
  const tag = status === "ok" ? "[OK]" : status === "todo" ? "[TODO]" : "[WARN]";
  return `${tag} ${text}`.slice(0, 240);
}

async function buildReadinessChecklist(interaction) {
  if (!interaction.inGuild?.()) return null;

  const lines = [];
  const canManage = hasManageGuild(interaction);
  lines.push(
    canManage
      ? checklistLine("ok", "Admin access: Manage Server detected.")
      : checklistLine("warn", "Admin access: missing Manage Server.")
  );

  try {
    const voice = await getVoiceState(interaction.guildId);
    const lobbies = voice?.lobbies && typeof voice.lobbies === "object" ? Object.values(voice.lobbies) : [];
    const enabled = lobbies.filter(l => l?.enabled).length;
    if (!lobbies.length) lines.push(checklistLine("todo", "VoiceMaster: no lobbies configured yet."));
    else if (enabled === 0) lines.push(checklistLine("warn", `VoiceMaster: ${lobbies.length} lobby(s) configured but none enabled.`));
    else lines.push(checklistLine("ok", `VoiceMaster: ${enabled}/${lobbies.length} lobby(s) enabled.`));

    if (voice) {
      ensureCustomVcsState(voice);
      const cfg = getCustomVcConfig(voice);
      if (!cfg.enabled) lines.push(checklistLine("todo", "Custom VCs: disabled."));
      else if (!cfg.categoryId) lines.push(checklistLine("warn", "Custom VCs: enabled but category not set."));
      else if (!cfg.panelMessageId) lines.push(checklistLine("todo", "Custom VCs: panel not posted yet."));
      else lines.push(checklistLine("ok", "Custom VCs: enabled and panel is posted."));
    }
  } catch {
    lines.push(checklistLine("warn", "Voice configuration could not be read."));
  }

  return lines.join("\n").slice(0, 1024);
}

function topicContent(topicKey) {
  if (topicKey === "voice") {
    return {
      title: "Tutorial: VoiceMaster",
      body: [
        "VoiceMaster creates temporary voice rooms from configured lobby channels.",
        "",
        "1. Run `/voice setup` to create or wire lobby channels.",
        "2. Join the lobby voice channel to spawn a temp room.",
        "3. Use `/voice console` or the room dashboard to rename, lock, cap, or release the room.",
        "4. Use `/voice status` when room spawning or cleanup is not behaving as expected."
      ].join("\n")
    };
  }

  if (topicKey === "customvcs") {
    return {
      title: "Tutorial: Custom VCs",
      body: [
        "Custom VCs are separate from VoiceMaster. They create on-demand managed rooms from a panel.",
        "",
        "1. Enable the feature with `/voice customs_setup`.",
        "2. Set the category and defaults for room creation.",
        "3. Post the request panel with `/voice customs_panel`.",
        "4. Members create a room, then manage guest access and room settings from the control panel."
      ].join("\n")
    };
  }

  if (topicKey === "moderation") {
    return {
      title: "Tutorial: Moderation",
      body: [
        "The lean hosted bot keeps the core moderation surface.",
        "",
        "1. Configure `/modlogs`, `/logs`, and `/automod`.",
        "2. Use `/warn`, `/timeout`, `/ban`, and `/purge` for enforcement.",
        "3. Use `/tickets`, `/verify`, and `/setup wizard` for server operations."
      ].join("\n")
    };
  }

  if (topicKey === "troubleshooting") {
    return {
      title: "Tutorial: Troubleshooting",
      body: [
        "Common lean-hosted bot issues:",
        "",
        "1. Temp room did not spawn: check `/voice status` and category permissions.",
        "2. Custom VC panel exists but requests fail: confirm the target category and Manage Channels permissions.",
        "3. Room dashboard appears but controls fail: ensure the user owns the room or has admin privileges.",
        "4. If DMs are blocked, use the in-server room dashboard delivery mode."
      ].join("\n")
    };
  }

  if (topicKey === "v1") {
    return {
      title: "Tutorial: Hosted Readiness",
      body: [
        "This lean build removes dashboard, agents, assistant, music, and Lavalink.",
        "",
        "The supported hosted path is moderation, core guild tooling, VoiceMaster, Custom VCs, temp room voice events, and PostgreSQL/Redis-backed runtime."
      ].join("\n")
    };
  }

  return {
    title: "Chopsticks Tutorials",
    body: [
      "This repo is now a lean hosted bot build.",
      "",
      "Kept: moderation, core guild tooling, VoiceMaster, Custom VCs, temp room voice events, PostgreSQL/Redis runtime.",
      "Removed: dashboard, agents, assistant, music, Lavalink, and the web app.",
      "",
      "Use the topic selector below for the supported setup paths."
    ].join("\n")
  };
}

async function buildTutorialEmbed(topicKey, interaction) {
  const topic = topicContent(topicKey);
  const embed = buildBaseEmbed(topic.title, topic.body);
  if (!interaction.inGuild?.()) {
    embed.addFields({
      name: "Server Context",
      value: "Voice setup and room-control actions require a server context.",
      inline: false
    });
    return embed;
  }

  if (topicKey === "start" || topicKey === "v1") {
    const checklist = await buildReadinessChecklist(interaction);
    if (checklist) {
      embed.addFields({ name: "Checklist", value: checklist, inline: false });
    }
  }

  return embed;
}

function buildTutorialComponents(interaction, userId, topicKey) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(uiId("select", userId, topicKey))
    .setPlaceholder("Pick a tutorial topic")
    .addOptions(
      TOPICS.map(topic => ({
        label: topic.label,
        value: topic.key,
        description: topic.description,
        default: topic.key === topicKey
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(uiId("open_voice_console", userId, topicKey))
      .setLabel("Voice Console")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!interaction.inGuild?.()),
    new ButtonBuilder()
      .setCustomId(uiId("open_customvcs", userId, topicKey))
      .setLabel("Custom VCs Panel")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!interaction.inGuild?.() || !hasManageGuild(interaction)),
    new ButtonBuilder()
      .setCustomId(uiId("refresh", userId, topicKey))
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

async function renderTutorial(interaction, { update = false, topicKey = "start" } = {}) {
  const embed = await buildTutorialEmbed(topicKey, interaction);
  const components = buildTutorialComponents(interaction, interaction.user.id, topicKey);
  const payload = { embeds: [embed], components, flags: MessageFlags.Ephemeral };
  if (update) return interaction.update(payload);
  return interaction.reply(payload);
}

export async function execute(interaction) {
  await renderTutorial(interaction, { topicKey: "start" });
}

export async function handleSelect(interaction) {
  if (!interaction.isStringSelectMenu?.()) return false;
  const parsed = parseUiId(interaction.customId);
  if (!parsed || parsed.kind !== "select") return false;

  if (parsed.userId !== interaction.user.id) {
    await interaction.reply({
      embeds: [buildBaseEmbed("Panel Locked", "This tutorial panel belongs to another user.").setColor(Colors.ERROR)],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const topicKey = TOPICS.some(topic => topic.key === interaction.values?.[0]) ? interaction.values[0] : "start";
  await renderTutorial(interaction, { update: true, topicKey });
  return true;
}

export async function handleButton(interaction) {
  if (!interaction.isButton?.()) return false;
  const parsed = parseUiId(interaction.customId);
  if (!parsed) return false;

  if (parsed.userId !== interaction.user.id) {
    await interaction.reply({
      embeds: [buildBaseEmbed("Panel Locked", "This tutorial panel belongs to another user.").setColor(Colors.ERROR)],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (parsed.kind === "refresh") {
    await renderTutorial(interaction, { update: true, topicKey: parsed.topicKey || "start" });
    return true;
  }

  if (!interaction.inGuild?.()) {
    await interaction.reply({
      embeds: [buildBaseEmbed("Guild Only", "This action needs a server context.").setColor(Colors.ERROR)],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (parsed.kind === "open_voice_console") {
    await showVoiceConsole(interaction);
    return true;
  }

  if (parsed.kind === "open_customvcs") {
    if (!hasManageGuild(interaction)) {
      await interaction.reply({
        embeds: [buildBaseEmbed("Permission Required", "You need `Manage Server` to open the custom VC panel preview.").setColor(Colors.ERROR)],
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const voice = await getVoiceState(interaction.guildId);
    ensureCustomVcsState(voice);
    const cfg = getCustomVcConfig(voice);
    await interaction.reply({
      ...buildCustomVcPanelMessage(cfg),
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  return false;
}
