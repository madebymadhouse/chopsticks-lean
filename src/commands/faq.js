// src/commands/faq.js
// /faq — post or preview the Mad House FAQ

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from "discord.js";

export const meta = {
  deployGlobal: true,
  guildOnly: true,
  userPerms: [PermissionFlagsBits.ManageGuild],
  category: "server"
};

export const data = new SlashCommandBuilder()
  .setName("faq")
  .setDescription("Post or preview the Mad House FAQ")
  .addSubcommand(sub =>
    sub.setName("post")
      .setDescription("Post the FAQ to a channel")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Target channel").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("preview").setDescription("Preview the FAQ (visible only to you)")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const MH_PRIMARY = 0xCC3300;
const MH_NEUTRAL = 0x1A1A1A;

function buildFaqEmbeds() {
  const about = new EmbedBuilder()
    .setColor(MH_PRIMARY)
    .setTitle("What is Mad House?")
    .addFields(
      {
        name: "Mad House is a build studio.",
        value:
          "We build tools, bots, platforms, agents, and anything else worth building. " +
          "Mad House exists to incubate real projects and the people behind them. " +
          "The work is open. The community is open."
      },
      {
        name: "What gets built here?",
        value:
          "Tooling, automation, bots, research, infrastructure, design — anything with substance. " +
          "If it solves a real problem or moves something forward, it belongs here."
      },
      {
        name: "Is this open to the public?",
        value:
          "Yes. The community is open. Anyone can join, participate, and contribute. " +
          "If you want to be more involved — build something, apply, or just show up consistently."
      }
    )
    .setFooter({ text: "Mad House  —  FAQ" });

  const getInvolved = new EmbedBuilder()
    .setColor(MH_PRIMARY)
    .setTitle("Get Involved")
    .addFields(
      {
        name: "How do I join?",
        value:
          "You're already here. Participate in the community, show up in voice, " +
          "contribute to what's being built. That's what joining looks like."
      },
      {
        name: "How do I contribute?",
        value:
          "Anything counts — Discord activity, development, design, art, writing, ideas, " +
          "testing, feedback, GitHub contributions, tooling, research. " +
          "If it's useful to Mad House, it's a contribution."
      },
      {
        name: "How do I apply?",
        value:
          "Open a ticket. Tell us what you want to do or build. " +
          "No formal requirements — just be real about what you bring and what you're after."
      },
      {
        name: "How do I get in touch with the team?",
        value:
          "Open a ticket for anything formal. For general conversation, " +
          "reach out in the server or visit the community hub at hub.madebymadhouse.cloud."
      }
    )
    .setFooter({ text: "Mad House  —  FAQ" });

  const server = new EmbedBuilder()
    .setColor(MH_NEUTRAL)
    .setTitle("Using the Server")
    .addFields(
      {
        name: "How does the Creds system work?",
        value:
          "Creds are earned by chatting and spending time in voice channels. " +
          "They track your activity and unlock level roles automatically. " +
          "Use `!rank` to check your level and progress."
      },
      {
        name: "How do voice rooms work?",
        value:
          "Join the lobby voice channel and a private room is created for you instantly. " +
          "Use the control panel or `!vc help` to manage your room."
      },
      {
        name: "How do I open a support ticket?",
        value:
          "Use `/ticket open` or find the ticket panel in the designated support channel. " +
          "Staff review all tickets."
      },
      {
        name: "What commands are available?",
        value:
          "Use `!help` to see all available commands. " +
          "Most member-facing commands are prefix-based. " +
          "Slash commands are used for server setup and admin functions."
      },
      {
        name: "How do I get server updates in my DMs?",
        value:
          "Use `!subscribe` to opt in to DM updates from Mad House. " +
          "Use `!unsub` to opt out at any time."
      }
    )
    .setFooter({ text: "Mad House  —  FAQ" });

  return [about, getInvolved, server];
}

function buildFaqButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("faq:open_ticket")
      .setLabel("Open a Ticket")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel("Community Hub")
      .setStyle(ButtonStyle.Link)
      .setURL("https://hub.madebymadhouse.cloud")
  );
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "preview") {
    await interaction.reply({
      embeds: buildFaqEmbeds(),
      components: [buildFaqButtons()],
      ephemeral: true
    });
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
  await channel.send({ embeds: buildFaqEmbeds(), components: [buildFaqButtons()] });
  await interaction.editReply({ content: `FAQ posted in ${channel}.` });
}
