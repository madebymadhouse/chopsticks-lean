// src/commands/dmupdate.js
// /dm-update — role-gated DM broadcast system for Mad House updates

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";

export const meta = {
  deployGlobal: true,
  guildOnly: true,
  userPerms: [PermissionFlagsBits.ManageGuild],
  category: "server"
};

export const data = new SlashCommandBuilder()
  .setName("dm-update")
  .setDescription("Send DM updates to opted-in members")
  .addSubcommand(sub =>
    sub.setName("broadcast")
      .setDescription("DM all members with the Updates role")
      .addStringOption(o =>
        o.setName("message").setDescription("Message to send").setRequired(true).setMaxLength(1800)
      )
  )
  .addSubcommand(sub =>
    sub.setName("user")
      .setDescription("DM a specific member through the bot")
      .addUserOption(o =>
        o.setName("target").setDescription("Member to DM").setRequired(true)
      )
      .addStringOption(o =>
        o.setName("message").setDescription("Message to send").setRequired(true).setMaxLength(1800)
      )
  )
  .addSubcommand(sub =>
    sub.setName("set-role")
      .setDescription("Set the role members use to opt in to DM updates")
      .addRoleOption(o =>
        o.setName("role").setDescription("Updates opt-in role").setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const MH_PRIMARY = 0xCC3300;

function buildUpdateEmbed(text, senderName) {
  return new EmbedBuilder()
    .setColor(MH_PRIMARY)
    .setDescription(text)
    .setFooter({ text: `Mad House  —  from ${senderName}` })
    .setTimestamp();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const data_ = await loadGuildData(interaction.guildId);

  if (sub === "set-role") {
    const role = interaction.options.getRole("role", true);
    data_.dmUpdatesRoleId = role.id;
    await saveGuildData(interaction.guildId, data_);
    await interaction.reply({
      content: `Updates role set to ${role}. Members can use \`!subscribe\` to opt in.`,
      ephemeral: true
    });
    return;
  }

  if (sub === "user") {
    const target = interaction.options.getUser("target", true);
    const message = interaction.options.getString("message", true);
    await interaction.deferReply({ ephemeral: true });
    try {
      await target.send({ embeds: [buildUpdateEmbed(message, interaction.user.username)] });
      await interaction.editReply({ content: `DM sent to ${target.tag}.` });
    } catch {
      await interaction.editReply({ content: `Could not DM ${target.tag} — they may have DMs disabled.` });
    }
    return;
  }

  if (sub === "broadcast") {
    const message = interaction.options.getString("message", true);
    const roleId = data_.dmUpdatesRoleId;

    if (!roleId) {
      await interaction.reply({
        content: "No Updates role configured. Use `/dm-update set-role` first.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    await guild.members.fetch().catch(() => {});
    const holders = guild.members.cache.filter(m =>
      !m.user.bot && m.roles.cache.has(roleId)
    );

    if (!holders.size) {
      await interaction.editReply({ content: "No members currently have the Updates role." });
      return;
    }

    let sent = 0;
    let failed = 0;
    const embed = buildUpdateEmbed(message, interaction.user.username);

    for (const [, member] of holders) {
      try {
        await member.send({ embeds: [embed] });
        sent++;
      } catch {
        failed++;
      }
      await sleep(1100); // stay well under Discord's DM rate limit
    }

    await interaction.editReply({
      content: `Broadcast complete. Sent: **${sent}** — Failed: **${failed}** (DMs disabled or blocked).`
    });
  }
}
