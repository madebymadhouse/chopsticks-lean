// src/config/branding.js
// ─────────────────────────────────────────────────────────────────────────────
// FORK-FRIENDLY BRANDING CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// Self-hosters: edit this file to rebrand the bot entirely.
// Everything here is also overridable via environment variables.
// ─────────────────────────────────────────────────────────────────────────────

export const Branding = {
  name:          process.env.BOT_NAME        ?? "Chopsticks",
  tagline:       process.env.BOT_TAGLINE     ?? "Mad House — lean, mean, and always running",
  supportServer: process.env.SUPPORT_SERVER_URL ?? "",
  inviteUrl:     process.env.BOT_INVITE_URL  ?? "",
  website:       process.env.BOT_WEBSITE     ?? "https://github.com/samhcharles/chopsticks-lean",
  github:        process.env.BOT_GITHUB      ?? "https://github.com/samhcharles/chopsticks-lean",

  // Default footer for all embeds. {botname} is replaced at runtime.
  footerText: process.env.BOT_FOOTER ?? "Mad House  •  {botname}",

  // Static thumbnail URL (optional). Falls back to bot avatar.
  thumbnailUrl: process.env.BOT_THUMBNAIL_URL ?? null,

  // Mad House color palette
  colors: {
    primary:   Number(process.env.COLOR_PRIMARY   ?? 0xCC3300), // deep red-orange
    secondary: Number(process.env.COLOR_SECONDARY ?? 0xFF5500), // bright orange-red
    success:   Number(process.env.COLOR_SUCCESS   ?? 0x2ECC71),
    error:     Number(process.env.COLOR_ERROR     ?? 0xE74C3C),
    warning:   Number(process.env.COLOR_WARNING   ?? 0xF39C12),
    neutral:   Number(process.env.COLOR_NEUTRAL   ?? 0x1A1A1A), // near-black
    info:      Number(process.env.COLOR_INFO      ?? 0x1A1A1A),
  },

  // Feature flags — set env var to "false" to disable globally
  features: {
    economy:       (process.env.FEATURE_ECONOMY      ?? "true") === "true",
    ai:            (process.env.FEATURE_AI           ?? "true") === "true",
    leveling:      (process.env.FEATURE_LEVELING     ?? "true") === "true",
    voicemaster:   (process.env.FEATURE_VOICE        ?? "true") === "true",
    tickets:       (process.env.FEATURE_TICKETS      ?? "true") === "true",
    moderation:    (process.env.FEATURE_MODERATION   ?? "true") === "true",
    fun:           (process.env.FEATURE_FUN          ?? "true") === "true",
    social:        (process.env.FEATURE_SOCIAL       ?? "true") === "true",
    notifications: (process.env.FEATURE_NOTIFY       ?? "true") === "true",
  },
};

export default Branding;
