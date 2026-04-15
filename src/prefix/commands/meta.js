import { PermissionsBitField } from "discord.js";
import { reply } from "../helpers.js";
import { loadGuildData, saveGuildData } from "../../utils/storage.js";
import {
  isValidAliasName,
  normalizeAliasName,
  resolveAliasedCommand
} from "../hardening.js";

const BUILTIN_COMMAND_NAMES = new Set([
  "aliases",
  "ping", "uptime", "help", "echo", "choose", "invite",
  "roll", "coinflip", "8ball", "fun",
  "serverinfo", "userinfo", "avatar", "roleinfo", "botinfo",
  "purge", "slowmode", "kick", "ban", "unban", "timeout",
  "warn", "warnings", "clearwarns", "lock", "unlock", "nick", "softban", "role",
  "poll", "giveaway", "remind", "welcome", "autorole", "prefix"
]);

export default [
  {
    name: "aliases",
    guildOnly: true,
    rateLimit: 3000,
    userPerms: [PermissionsBitField.Flags.ManageGuild],
    async execute(message, args) {
      const sub = args[0];
      const data = await loadGuildData(message.guildId);
      data.prefix ??= { aliases: {} };
      data.prefix.aliases ??= {};

      if (sub === "list") {
        const entries = Object.entries(data.prefix.aliases).sort((a, b) => a[0].localeCompare(b[0]));
        if (!entries.length) return reply(message, "No aliases.");
        return reply(message, entries.map(([alias, command]) => `${alias} -> ${command}`).join("\n").slice(0, 1900));
      }

      if (sub === "set") {
        const alias = normalizeAliasName(args[1]);
        const target = normalizeAliasName(args[2]);
        if (!alias || !target) return reply(message, "Usage: aliases set <alias> <command|alias>");
        if (!isValidAliasName(alias)) return reply(message, "Alias must be 1-24 chars: letters, numbers, '_' or '-'.");
        if (BUILTIN_COMMAND_NAMES.has(alias)) return reply(message, `Alias '${alias}' is reserved by a built-in prefix command.`);

        const customNames = new Set([
          ...Object.keys(data.customCommands ?? {}).map(normalizeAliasName),
          ...Object.keys(data.macros ?? {}).map(normalizeAliasName)
        ]);
        const targetExists =
          BUILTIN_COMMAND_NAMES.has(target) ||
          customNames.has(target) ||
          Object.prototype.hasOwnProperty.call(data.prefix.aliases, target);
        if (!targetExists) {
          return reply(message, `Target '${target}' not found in prefix commands, custom commands, macros, or aliases.`);
        }

        const projected = { ...data.prefix.aliases, [alias]: target };
        const resolved = resolveAliasedCommand(alias, projected, 20);
        if (!resolved.ok && resolved.error === "cycle") return reply(message, "Alias rejected: this creates an alias cycle.");
        if (!resolved.ok && resolved.error === "depth") return reply(message, "Alias rejected: chain too deep.");

        data.prefix.aliases[alias] = target;
        await saveGuildData(message.guildId, data);
        return reply(message, `Alias set: ${alias} -> ${target} (resolves to ${resolved.ok ? resolved.commandName : target})`);
      }

      if (sub === "clear") {
        const alias = normalizeAliasName(args[1]);
        if (!alias) return reply(message, "Usage: aliases clear <alias>");
        delete data.prefix.aliases[alias];
        await saveGuildData(message.guildId, data);
        return reply(message, `Alias cleared: ${alias}`);
      }

      return reply(message, "Usage: aliases <list|set|clear>");
    }
  }
];
