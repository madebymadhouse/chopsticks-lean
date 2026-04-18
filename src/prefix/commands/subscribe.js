// src/prefix/commands/subscribe.js
// !subscribe / !unsub — opt in/out of DM updates from Mad House

import { loadGuildData } from "../../utils/storage.js";

export default [
  {
    name: "subscribe",
    aliases: ["sub", "updates"],
    description: "Opt in to DM updates from Mad House — !subscribe",
    guildOnly: true,
    async execute(message) {
      const data = await loadGuildData(message.guildId);
      const roleId = data.dmUpdatesRoleId;
      if (!roleId) {
        return message.reply("Updates are not configured for this server yet.");
      }
      const role = message.guild.roles.cache.get(roleId);
      if (!role) {
        return message.reply("The Updates role no longer exists. Ask an admin to reconfigure it.");
      }
      if (message.member.roles.cache.has(roleId)) {
        return message.reply(`You already have the ${role.name} role.`);
      }
      await message.member.roles.add(role).catch(() => null);
      return message.reply(`You're in. You'll receive DM updates when they're sent out.`);
    }
  },
  {
    name: "unsub",
    aliases: ["unsubscribe", "noupdates"],
    description: "Opt out of DM updates — !unsub",
    guildOnly: true,
    async execute(message) {
      const data = await loadGuildData(message.guildId);
      const roleId = data.dmUpdatesRoleId;
      if (!roleId) {
        return message.reply("Updates are not configured for this server.");
      }
      if (!message.member.roles.cache.has(roleId)) {
        return message.reply("You don't have the Updates role.");
      }
      await message.member.roles.remove(roleId).catch(() => null);
      return message.reply("Removed. You won't receive DM updates.");
    }
  }
];
