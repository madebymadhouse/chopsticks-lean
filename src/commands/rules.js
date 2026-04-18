// src/commands/rules.js
// /rules — post the Mad House server rules

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from "discord.js";
import { buildRulesBannerSvg } from "../game/render/cards.js";
import { svgToPngBuffer } from "../game/render/imCards.js";

export const meta = {
  deployGlobal: true,
  guildOnly: true,
  userPerms: [PermissionFlagsBits.ManageGuild],
  category: "server"
};

export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Post the Mad House server rules")
  .addSubcommand(sub =>
    sub.setName("post")
      .setDescription("Post the rules to a channel")
      .addChannelOption(o => o.setName("channel").setDescription("Target channel").setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName("preview").setDescription("Preview rules (visible only to you)")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const MH = { primary: 0xCC3300, secondary: 0xFF5500, neutral: 0x1A1A1A, warning: 0xF39C12, error: 0xE74C3C };
const BANNER_URL = process.env.MADHOUSE_BANNER_URL ?? null;
const FOOTER = `Mad House  —  ${new Date().getFullYear()}`;
const f = () => ({ text: FOOTER });

function banner() {
  const e = new EmbedBuilder()
    .setColor(MH.primary)
    .setTitle("MAD HOUSE")
    .setDescription(
      "Mad House is a community. This Discord is where we operate.\n\n" +
      "These rules exist so it stays worth being here. " +
      "Read them. Follow them. Ignorance is not an excuse.\n\n" +
      "Violations result in mutes, kicks, or bans depending on severity. " +
      "Serious offenses are permanent with no warning."
    )
    .setFooter(f())
    .setTimestamp();
  if (BANNER_URL) e.setImage(BANNER_URL);
  return e;
}

function conduct() {
  return new EmbedBuilder()
    .setColor(MH.primary)
    .setTitle("Section 1 — Conduct")
    .addFields(
      { name: "1.1  Respect", value: "Treat everyone with basic respect. Harassment, hate speech, slurs, and targeted insults are not tolerated." },
      { name: "1.2  No Drama", value: "Keep personal issues in DMs. Public callouts, venting, and drama threads will be removed." },
      { name: "1.3  No Threats", value: "Zero tolerance for any threat — physical, digital, or otherwise. This includes doxxing or sharing private information. Immediate ban." },
      { name: "1.4  No Impersonation", value: "Do not impersonate members, staff, or public figures. This includes usernames, avatars, and role titles." }
    )
    .setFooter(f());
}

function content() {
  return new EmbedBuilder()
    .setColor(MH.secondary)
    .setTitle("Section 2 — Content")
    .addFields(
      { name: "2.1  Use the Right Channel", value: "Post content where it belongs. Off-topic posts will be moved or deleted." },
      { name: "2.2  NSFW", value: "Explicit content is only allowed in designated age-gated channels. Posting it elsewhere results in removal and a mute." },
      { name: "2.3  No Spam", value: "No message flooding, emoji spam, or repeated pings. Mass mentions (@everyone, @here) are staff-only." },
      { name: "2.4  No Illegal Content", value: "No piracy links, illegal media, or anything violating Discord's Terms of Service. Immediate permanent ban." },
      { name: "2.5  No Unsolicited Promotion", value: "No advertising other servers, products, or services without staff approval. This includes DM promotions." }
    )
    .setFooter(f());
}

function voice() {
  return new EmbedBuilder()
    .setColor(MH.neutral)
    .setTitle("Section 3 — Voice Channels")
    .addFields(
      { name: "3.1  Your Room, Your Rules — Within Limits", value: "When you create a room you are the owner. You can lock it, kick, ban, and whitelist. Server rules still apply inside your room." },
      { name: "3.2  No Audio Trolling", value: "No ear-rape, disruptive soundboards, or mic abuse. Room owners can kick; staff can force-disconnect." },
      { name: "3.3  No Evasion", value: "If you are kicked or banned from a room, do not repeatedly rejoin. Evasion is treated as harassment." }
    )
    .setFooter(f());
}

function levels() {
  return new EmbedBuilder()
    .setColor(MH.neutral)
    .setTitle("Section 4 — Levels and Roles")
    .addFields(
      { name: "4.1  No Farming Creds", value: "Creds are for genuine participation — chatting and time in voice. Spam or AFK farming results in resets and mutes." },
      { name: "4.2  Level Roles", value: "Roles unlock automatically as you level up. Abuse the perks and they get revoked." },
      { name: "4.3  No Alts", value: "Alt account leveling is prohibited. Detected alts will be banned." }
    )
    .setFooter(f());
}

function staff() {
  return new EmbedBuilder()
    .setColor(MH.error)
    .setTitle("Section 5 — Staff and Moderation")
    .addFields(
      { name: "5.1  Staff Word is Final", value: "If staff tells you to stop, stop. Arguing in chat makes it worse. Dispute decisions privately via DM to a senior staff member." },
      { name: "5.2  Do Not Ping Staff Unnecessarily", value: "Only ping staff for active violations or emergencies. Use the ticket system for everything else." },
      { name: "5.3  Escalation", value: "Minor — warn or mute.\nRepeated — longer mute or kick.\nSerious (threats, doxxing, illegal content) — immediate permanent ban.\nThere is no guaranteed warning for serious offenses." }
    )
    .setFooter(f());
}

function closing() {
  return new EmbedBuilder()
    .setColor(MH.primary)
    .setTitle("Stay Mad.")
    .setDescription(
      "Being here means you've agreed to these rules.\n\n" +
      "Show up, be yourself, do not be a problem — Mad House will be good to you.\n\n" +
      "Questions? Open a ticket or DM a staff member."
    )
    .setFooter({ text: `Mad House  —  Last updated ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}` })
    .setTimestamp();
}

function buildRules() {
  return [banner(), conduct(), content(), voice(), levels(), staff(), closing()];
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "preview") {
    await interaction.reply({ embeds: buildRules(), ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  const botMember = interaction.guild?.members?.me;
  if (botMember && channel.permissionsFor) {
    const perms = channel.permissionsFor(botMember);
    if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
      await interaction.reply({ content: `I cannot send embeds in ${channel}.`, ephemeral: true });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });

  const pngBuf = await svgToPngBuffer(buildRulesBannerSvg()).catch(() => null);
  const file = pngBuf ? new AttachmentBuilder(pngBuf, { name: "rules-banner.png" }) : null;

  const embeds = buildRules();
  if (file) embeds[0].setImage("attachment://rules-banner.png");

  await channel.send({ embeds, ...(file ? { files: [file] } : {}) });
  await interaction.editReply({ content: `Rules posted in ${channel}.` });
}
