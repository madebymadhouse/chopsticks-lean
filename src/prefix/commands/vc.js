// src/prefix/commands/vc.js
// !vc <subcommand> — unified voice room control

import { PermissionsBitField } from "discord.js";
import { getVoiceState } from "../../tools/voice/schema.js";
import { getTempChannelRecord, transferTempChannelOwner } from "../../tools/voice/state.js";
import { ownerPermissionOverwrite } from "../../tools/voice/ownerPerms.js";
import { reply } from "../helpers.js";

async function resolveOwnerRoom(message) {
  const guild = message.guild;
  if (!guild) return { error: "Server only." };
  const voice = await getVoiceState(guild.id);
  if (!voice?.tempChannels) return { error: "No voice rooms active." };
  const entry = Object.entries(voice.tempChannels).find(([, r]) => r.ownerId === message.author.id);
  if (!entry) return { error: "You don't own a voice room. Join a lobby to create one." };
  const [channelId, record] = entry;
  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { error: "Your voice room no longer exists." };
  return { voice, channel, record, channelId };
}

async function resolveUser(message, args) {
  const mention = message.mentions.users.first();
  if (mention) return mention;
  const query = args[0];
  if (!query) return null;
  const cleaned = query.replace(/\D/g, "");
  if (cleaned) {
    const byId = message.guild.members.cache.get(cleaned)?.user;
    if (byId) return byId;
    try {
      const fetched = await message.guild.members.fetch(cleaned);
      if (fetched) return fetched.user;
    } catch {}
  }
  const q = query.toLowerCase().replace(/^@/, "");
  return message.guild.members.cache.find(
    m => m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q
  )?.user ?? null;
}

const err = (msg, text) => reply(msg, `> ❌ ${text}`);
const ok = (msg, text) => reply(msg, `> ✅ ${text}`);

const USAGE = [
  "**!vc — Voice Room Commands**",
  "`!vc kick @user` — disconnect someone from your room",
  "`!vc ban @user` — block someone from your room",
  "`!vc unban @user` — remove a ban",
  "`!vc allow @user` — whitelist someone (let them join locked room)",
  "`!vc lock` — lock your room (no new joins)",
  "`!vc unlock` — unlock your room",
  "`!vc limit <0-99>` — set user cap (0 = unlimited)",
  "`!vc rename <name>` — rename your room",
  "`!vc hide` — hide from channel list",
  "`!vc unhide` — show in channel list",
  "`!vc bitrate <kbps>` — set audio quality",
  "`!vc transfer @user` — transfer ownership",
  "`!vc claim` — claim ownerless room",
  "`!vc info` — show room status",
  "`!vc reset` — reset room to defaults",
].join("\n");

const sub = {
  async kick(message, args) {
    const user = await resolveUser(message, args);
    if (!user) return err(message, "User not found. Usage: `!vc kick @user`");
    if (user.id === message.author.id) return err(message, "Can't kick yourself.");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    const member = message.guild.members.cache.get(user.id);
    if (!member?.voice?.channelId || member.voice.channelId !== res.channelId)
      return err(message, `**${user.username}** is not in your room.`);
    await member.voice.disconnect().catch(() => null);
    return ok(message, `**${user.username}** disconnected from your room.`);
  },

  async ban(message, args) {
    const user = await resolveUser(message, args);
    if (!user) return err(message, "User not found. Usage: `!vc ban @user`");
    if (user.id === message.author.id) return err(message, "Can't ban yourself.");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(user, { Connect: false }).catch(() => null);
    const member = message.guild.members.cache.get(user.id);
    if (member?.voice?.channelId === res.channelId) await member.voice.disconnect().catch(() => null);
    return ok(message, `**${user.username}** banned from your room.`);
  },

  async unban(message, args) {
    const user = await resolveUser(message, args);
    if (!user) return err(message, "User not found. Usage: `!vc unban @user`");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(user, { Connect: null }).catch(() => null);
    return ok(message, `**${user.username}** unbanned.`);
  },

  async allow(message, args) {
    const user = await resolveUser(message, args);
    if (!user) return err(message, "User not found. Usage: `!vc allow @user`");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(user, { Connect: true }).catch(() => null);
    return ok(message, `**${user.username}** whitelisted — can join even if room is locked.`);
  },

  async whitelist(message, args) { return sub.allow(message, args); },
  async permit(message, args) { return sub.allow(message, args); },

  async lock(message) {
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false }).catch(() => null);
    return ok(message, "Room **locked**. No new members can join.");
  },

  async unlock(message) {
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null }).catch(() => null);
    return ok(message, "Room **unlocked**.");
  },

  async limit(message, args) {
    const n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0 || n > 99) return err(message, "Usage: `!vc limit <0–99>` (0 = unlimited)");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.setUserLimit(n).catch(() => null);
    return ok(message, n === 0 ? "User limit removed (unlimited)." : `User cap set to **${n}**.`);
  },

  async cap(message, args) { return sub.limit(message, args); },

  async rename(message, args) {
    const name = args.join(" ").trim().slice(0, 90);
    if (!name) return err(message, "Usage: `!vc rename <new name>`");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.setName(name).catch(() => null);
    return ok(message, `Room renamed to **${name}**.`);
  },

  async hide(message) {
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => null);
    return ok(message, "Room **hidden** from channel list.");
  },

  async unhide(message) {
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => null);
    return ok(message, "Room is now **visible**.");
  },

  async bitrate(message, args) {
    const kbps = parseInt(args[0], 10);
    if (isNaN(kbps) || kbps < 8 || kbps > 384) return err(message, "Usage: `!vc bitrate <8–384>` (kbps)");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    const maxBitrate = message.guild.maximumBitrate ?? 96000;
    const bps = Math.min(kbps * 1000, maxBitrate);
    await res.channel.setBitrate(bps).catch(() => null);
    return ok(message, `Bitrate set to **${Math.floor(bps / 1000)} kbps**.`);
  },

  async transfer(message, args) {
    const user = await resolveUser(message, args);
    if (!user) return err(message, "User not found. Usage: `!vc transfer @user`");
    if (user.id === message.author.id) return err(message, "You already own this room.");
    if (user.bot) return err(message, "Can't transfer to a bot.");
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    const moved = await transferTempChannelOwner(message.guild.id, res.channelId, user.id, res.voice);
    if (!moved.ok) return err(message, "Transfer failed.");
    const lobby = res.voice.lobbies?.[res.record?.lobbyId];
    await res.channel.permissionOverwrites.edit(user, ownerPermissionOverwrite(lobby?.ownerPermissions)).catch(() => null);
    await res.channel.permissionOverwrites.delete(message.author.id).catch(() => null);
    return ok(message, `Ownership transferred to **${user.username}**.`);
  },

  async claim(message) {
    const guild = message.guild;
    if (!guild) return err(message, "Server only.");
    const member = guild.members.cache.get(message.author.id);
    const vcId = member?.voice?.channelId;
    if (!vcId) return err(message, "You're not in a voice channel.");
    const voice = await getVoiceState(guild.id);
    if (!voice?.tempChannels?.[vcId]) return err(message, "Not a managed temp room.");
    const record = getTempChannelRecord(guild.id, vcId, voice);
    const channel = guild.channels.cache.get(vcId);
    if (!channel) return err(message, "Channel not found.");
    if (channel.members.has(record?.ownerId)) return err(message, "Owner is still in the room. Can only claim after they leave.");
    if (record?.ownerId === message.author.id) return err(message, "You already own this room.");
    const moved = await transferTempChannelOwner(guild.id, vcId, message.author.id, voice);
    if (!moved.ok) return err(message, "Claim failed.");
    const lobby = voice.lobbies?.[record?.lobbyId];
    await channel.permissionOverwrites.edit(message.author.id, ownerPermissionOverwrite(lobby?.ownerPermissions)).catch(() => null);
    return ok(message, "You are now the owner of this room.");
  },

  async info(message) {
    const guild = message.guild;
    if (!guild) return err(message, "Server only.");
    const member = guild.members.cache.get(message.author.id);
    const voice = await getVoiceState(guild.id);
    const entry = Object.entries(voice?.tempChannels ?? {}).find(([, r]) => r.ownerId === message.author.id)
      ?? (member?.voice?.channelId && voice?.tempChannels?.[member.voice.channelId]
          ? [member.voice.channelId, voice.tempChannels[member.voice.channelId]]
          : null);
    if (!entry) return err(message, "You have no active voice room.");
    const [channelId, record] = entry;
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return err(message, "Room not found.");
    const members = channel.members.filter(m => !m.user.bot);
    const ow = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    const locked = ow?.deny?.has?.(PermissionsBitField.Flags.Connect) ?? false;
    const hidden = ow?.deny?.has?.(PermissionsBitField.Flags.ViewChannel) ?? false;
    const ownerMember = guild.members.cache.get(record?.ownerId);
    return reply(message, [
      `**Room:** ${channel.name}`,
      `**Owner:** ${ownerMember?.displayName ?? record?.ownerId ?? "Unknown"}`,
      `**Members:** ${members.size}${channel.userLimit ? `/${channel.userLimit}` : ""}`,
      `**Status:** ${locked ? "🔒 Locked" : "🔓 Open"}${hidden ? "  👻 Hidden" : ""}`,
      `**Bitrate:** ${Math.floor(channel.bitrate / 1000)} kbps`,
    ].join("\n"));
  },

  async reset(message) {
    const res = await resolveOwnerRoom(message);
    if (res.error) return err(message, res.error);
    await res.channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null, ViewChannel: null }).catch(() => null);
    await res.channel.setUserLimit(0).catch(() => null);
    return ok(message, "Room reset — unlocked, visible, no user limit.");
  },

  async help(message) { return reply(message, USAGE); },
};

export default [
  {
    name: "vc",
    aliases: ["room", "myvc", "vcroom"],
    category: "voice",
    description: "Manage your voice room. Usage: !vc <subcommand>",
    usage: "!vc <kick|ban|unban|allow|lock|unlock|limit|rename|hide|unhide|bitrate|transfer|claim|info|reset|help>",
    rateLimit: 1500,
    async execute(message, args) {
      const subName = args[0]?.toLowerCase();
      const rest = args.slice(1);
      if (!subName || subName === "help") return reply(message, USAGE);
      const fn = sub[subName];
      if (!fn) return err(message, `Unknown subcommand \`${subName}\`. Type \`!vc help\` to see all commands.`);
      return fn(message, rest);
    }
  }
];
