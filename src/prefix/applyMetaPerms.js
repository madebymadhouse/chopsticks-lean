// src/prefix/applyMetaPerms.js
// Reads meta.userPerms from slash command files and enforces them for prefix invocations.
import { join } from "path";
import { fileURLToPath } from "url";
import { PermissionFlagsBits } from "discord.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMMANDS_DIR = join(__dirname, "../commands");

// Cache: commandName -> meta object
const metaCache = new Map();

async function loadMeta(commandName) {
  if (metaCache.has(commandName)) return metaCache.get(commandName);
  try {
    const mod = await import(`../commands/${commandName}.js`);
    const meta = mod.meta ?? {};
    metaCache.set(commandName, meta);
    return meta;
  } catch {
    metaCache.set(commandName, {});
    return {};
  }
}

/**
 * Check if a Discord Message author has the required permissions for a command.
 * Returns { ok: true } or { ok: false, reason: string, missingPerms: string[] }
 */
export async function checkMetaPerms(message, commandName) {
  const meta = await loadMeta(commandName);

  // guildOnly check
  if (meta.guildOnly && !message.guild) {
    return { ok: false, reason: "This command can only be used in a server.", missingPerms: [] };
  }

  if (!message.guild) return { ok: true }; // DM, no perms to check

  const member = message.member;
  if (!member) return { ok: true }; // can't check, allow

  const perms = member.permissions;
  if (!perms) return { ok: true };

  const required = meta.userPerms ?? [];
  if (required.length === 0) return { ok: true };

  const missing = required.filter(p => !perms.has(p));
  if (missing.length > 0) {
    const names = missing.map(p => {
      // Convert PermissionFlagsBits value to readable name
      const str = String(p);
      return PERM_NAMES.get(str) ?? String(p);
    });
    return { ok: false, reason: `Missing permissions: ${names.join(", ")}`, missingPerms: names };
  }

  return { ok: true };
}

/** Clear cache (useful in tests) */
export function clearMetaCache() { metaCache.clear(); }

// Map BigInt perm values to readable names using PermissionFlagsBits
const PERM_NAMES = new Map(
  Object.entries(PermissionFlagsBits).map(([name, val]) => [String(val), name.replace(/([A-Z])/g, " $1").trim()])
);
