import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType } from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";
import { Colors } from "../utils/discordOutput.js";
import { sanitizeString } from "../utils/validation.js";
import { buildWelcomeBannerSvg } from "../game/render/cards.js";
import { svgToPngBuffer } from "../game/render/imCards.js";

const MH_PRIMARY = 0xCC3300;
const MH_NEUTRAL = 0x1A1A1A;
const BANNER_URL = process.env.MADHOUSE_BANNER_URL ?? null;

const SKIP_PREFIXES = ["ticket-", "closed-"];

function isPublicChannel(channel, everyoneId) {
  if (!everyoneId) return true;
  const ow = channel.permissionOverwrites?.cache?.get(everyoneId);
  if (!ow) return true;
  const ViewChannel = 1024n;
  if (ow.deny && (BigInt(ow.deny) & ViewChannel) === ViewChannel) return false;
  return true;
}

function buildChannelTree(guild) {
  const everyoneId = guild.roles.everyone?.id;

  const cats = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  const lines = [];
  for (const cat of cats) {
    const children = [...guild.channels.cache.values()]
      .filter(c =>
        c.parentId === cat.id &&
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildAnnouncement) &&
        !SKIP_PREFIXES.some(p => c.name.startsWith(p)) &&
        isPublicChannel(c, everyoneId)
      )
      .sort((a, b) => a.position - b.position);

    if (!children.length) continue;
    lines.push(`**${cat.name.toUpperCase()}**`);
    for (const ch of children) {
      if (ch.type === ChannelType.GuildVoice) {
        lines.push(`${ch.name}`);
      } else {
        lines.push(`<#${ch.id}>`);
      }
    }
    lines.push("");
  }

  const result = lines.join("\n").trim();
  return result.length > 950 ? result.slice(0, 947) + "…" : (result || "No public channels configured.");
}

function buildLandingEmbeds(guild, bannerAttached = false) {
  const intro = new EmbedBuilder()
    .setColor(MH_PRIMARY)
    .setTitle("Mad House")
    .setDescription(
      "Mad House is a build studio.\n\n" +
      "We build tools, bots, platforms, agents, and anything worth building. " +
      "The work is open. The community is open. " +
      "Solid people, no BS.\n\n" +
      "Read the rules. Start contributing. Stay Mad."
    )
    .setFooter({ text: "Mad House" })
    .setTimestamp();

  if (bannerAttached) {
    intro.setImage("attachment://banner.png");
  } else if (BANNER_URL) {
    intro.setImage(BANNER_URL);
  }

  const nav = new EmbedBuilder()
    .setColor(MH_NEUTRAL)
    .setTitle("Get Around")
    .addFields(
      { name: "Rules", value: "Read them. Follow them. No exceptions.", inline: false },
      { name: "Creds", value: "Earned by chatting and spending time in voice. Use `!rank` to check your level.", inline: false },
      { name: "Voice", value: "Join the lobby channel. A private room is created for you instantly.", inline: false },
      { name: "Tickets", value: "Use `/ticket open` for support, applications, or anything formal.", inline: false }
    );

  if (guild) {
    const tree = buildChannelTree(guild);
    nav.addFields({ name: "Channels", value: tree, inline: false });
  }

  const support = new EmbedBuilder()
    .setColor(MH_PRIMARY)
    .setTitle("Get Support")
    .setDescription(
      "The ticket system is the official way to reach staff.\n\n" +
      "Use `/ticket open` or the button below to open a ticket. " +
      "Tell us what you need, what you want to build, or why you're applying. " +
      "Staff review everything.\n\n" +
      "For quick answers, check the FAQ. For everything else, open a ticket."
    )
    .setFooter({ text: "Mad House  —  Use /ticket for anything formal" });

  return [intro, nav, support];
}

function buildLandingButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("welcome:ticket")
        .setLabel("Open a Ticket")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("FAQ")
        .setStyle(ButtonStyle.Link)
        .setURL("https://hub.madebymadhouse.cloud"),
      new ButtonBuilder()
        .setLabel("Community Hub")
        .setStyle(ButtonStyle.Link)
        .setURL("https://hub.madebymadhouse.cloud"),
      new ButtonBuilder()
        .setLabel("GitHub")
        .setStyle(ButtonStyle.Link)
        .setURL("https://github.com/madebymadhouse")
    )
  ];
}

export const meta = {
  deployGlobal: true,
  category: "admin",
  guildOnly: true,
  userPerms: [PermissionFlagsBits.ManageGuild]
};

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Welcome and goodbye message settings")
  .addSubcommand(s =>
    s.setName("post")
      .setDescription("Post the Mad House welcome landing page to a channel")
      .addChannelOption(o => o.setName("channel").setDescription("Target channel").setRequired(true))
  )
  .addSubcommand(s =>
    s.setName("set").setDescription("Set welcome channel")
      .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
  .addSubcommand(s =>
    s.setName("message").setDescription("Set welcome message")
      .addStringOption(o => o.setName("text").setDescription("Message with {user}, {server}, {membercount}").setRequired(true)))
  .addSubcommand(s => s.setName("preview").setDescription("Preview current welcome configuration"))
  .addSubcommand(s => s.setName("disable").setDescription("Disable welcome messages"))
  // DM on join
  .addSubcommand(s =>
    s.setName("dm-set").setDescription("Set a DM message sent to new members")
      .addStringOption(o => o.setName("text").setDescription("DM text (supports {user}, {server})").setRequired(true).setMaxLength(1900)))
  .addSubcommand(s => s.setName("dm-enable").setDescription("Enable DM on join"))
  .addSubcommand(s => s.setName("dm-disable").setDescription("Disable DM on join"))
  // Goodbye
  .addSubcommand(s =>
    s.setName("goodbye-set").setDescription("Set goodbye channel and message")
      .addChannelOption(o => o.setName("channel").setDescription("Goodbye channel").setRequired(true))
      .addStringOption(o => o.setName("text").setDescription("Goodbye message (supports {user}, {server})").setMaxLength(1900)))
  .addSubcommand(s => s.setName("goodbye-enable").setDescription("Enable goodbye messages"))
  .addSubcommand(s => s.setName("goodbye-disable").setDescription("Disable goodbye messages"))
  // Member count VC
  .addSubcommand(s =>
    s.setName("membercount").setDescription("Set a voice channel to display live member count")
      .addChannelOption(o => o.setName("channel").setDescription("Voice channel").setRequired(true)))
  .addSubcommand(s => s.setName("membercount-disable").setDescription("Disable member count voice channel"))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function reply(title, description, color = Colors.INFO) {
  return { embeds: [{ title, description, color, timestamp: new Date().toISOString() }], flags: MessageFlags.Ephemeral };
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gd = await loadGuildData(interaction.guildId);
  gd.welcome ??= { enabled: false, channelId: null, message: "Welcome {user}!" };
  gd.goodbye ??= { enabled: false, channelId: null, message: "Goodbye {user}." };
  gd.joinDm ??= { enabled: false, message: null };

  if (sub === "post") {
    const channel = interaction.options.getChannel("channel", true);
    const botMember = interaction.guild?.members?.me;
    if (botMember && channel.permissionsFor) {
      const perms = channel.permissionsFor(botMember);
      if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
        return interaction.reply(reply("Missing Permissions", `I cannot send embeds in ${channel}.`, Colors.ERROR));
      }
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pngBuf = await svgToPngBuffer(buildWelcomeBannerSvg()).catch(() => null);
    const file = pngBuf ? new AttachmentBuilder(pngBuf, { name: "banner.png" }) : null;

    await channel.send({
      embeds: buildLandingEmbeds(interaction.guild, Boolean(file)),
      components: buildLandingButtons(),
      ...(file ? { files: [file] } : {})
    });
    return interaction.editReply({ content: `Welcome landing posted in ${channel}.` });
  }

  if (sub === "set") {
    const channel = interaction.options.getChannel("channel", true);
    gd.welcome.channelId = channel.id;
    gd.welcome.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Welcome Channel Updated", `Welcome messages will post in <#${channel.id}>.`, Colors.SUCCESS));
  }

  if (sub === "message") {
    gd.welcome.message = sanitizeString(interaction.options.getString("text", true));
    gd.welcome.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Welcome Message Updated", `Template saved.\n\nPreview:\n${gd.welcome.message.slice(0, 900)}`, Colors.SUCCESS));
  }

  if (sub === "preview") {
    const channelLine = gd.welcome.channelId ? `<#${gd.welcome.channelId}>` : "Not set";
    return interaction.reply(reply(
      "Welcome Configuration",
      `Status: **${gd.welcome.enabled ? "Enabled" : "Disabled"}**\nChannel: ${channelLine}\nTemplate:\n${String(gd.welcome.message || "Welcome {user}!").slice(0, 900)}\n\nPlaceholders: \`{user}\`, \`{server}\`, \`{membercount}\``,
      Colors.INFO
    ));
  }

  if (sub === "disable") {
    gd.welcome.enabled = false;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Welcome Disabled", "Welcome messages are now disabled.", Colors.WARNING));
  }

  if (sub === "dm-set") {
    gd.joinDm.message = sanitizeString(interaction.options.getString("text", true));
    gd.joinDm.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("DM on Join Updated", "New members will receive this DM when they join.", Colors.SUCCESS));
  }

  if (sub === "dm-enable") {
    if (!gd.joinDm.message) return interaction.reply(reply("No DM Set", "Use `/welcome dm-set` first.", Colors.WARNING));
    gd.joinDm.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("DM on Join Enabled", "New members will receive a DM on join.", Colors.SUCCESS));
  }

  if (sub === "dm-disable") {
    gd.joinDm.enabled = false;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("DM on Join Disabled", "Join DMs are now off.", Colors.WARNING));
  }

  if (sub === "goodbye-set") {
    const channel = interaction.options.getChannel("channel", true);
    const text = interaction.options.getString("text");
    gd.goodbye.channelId = channel.id;
    if (text) gd.goodbye.message = sanitizeString(text);
    gd.goodbye.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Goodbye Configured", `Goodbye messages will post in <#${channel.id}>.`, Colors.SUCCESS));
  }

  if (sub === "goodbye-enable") {
    if (!gd.goodbye.channelId) return interaction.reply(reply("No Channel Set", "Use `/welcome goodbye-set` first.", Colors.WARNING));
    gd.goodbye.enabled = true;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Goodbye Enabled", "Goodbye messages are now on.", Colors.SUCCESS));
  }

  if (sub === "goodbye-disable") {
    gd.goodbye.enabled = false;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Goodbye Disabled", "Goodbye messages are now off.", Colors.WARNING));
  }

  if (sub === "membercount") {
    const channel = interaction.options.getChannel("channel", true);
    gd.memberCountChannelId = channel.id;
    await saveGuildData(interaction.guildId, gd);
    // Update immediately
    const vc = interaction.guild.channels.cache.get(channel.id);
    if (vc) await vc.setName(`Members: ${interaction.guild.memberCount}`).catch(() => null);
    return interaction.reply(reply("Member Count Channel Set", `<#${channel.id}> will show live member count.`, Colors.SUCCESS));
  }

  if (sub === "membercount-disable") {
    delete gd.memberCountChannelId;
    await saveGuildData(interaction.guildId, gd);
    return interaction.reply(reply("Member Count Disabled", "Member count channel updates are off.", Colors.WARNING));
  }
}

