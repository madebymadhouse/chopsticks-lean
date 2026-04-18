// src/utils/ticketAutoClose.js
// Hourly scanner — auto-closes tickets with no owner activity after 48h

import { ChannelType, EmbedBuilder } from "discord.js";
import { parseTicketTopic } from "./tickets.js";
import { loadGuildData } from "./storage.js";

const AUTO_CLOSE_MS = 48 * 60 * 60 * 1000;

async function scanGuild(guild) {
  let guildData;
  try { guildData = await loadGuildData(guild.id); } catch { return; }
  const cfg = guildData?.tickets;
  if (!cfg?.enabled || !cfg?.categoryId) return;

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    if (channel.parentId !== cfg.categoryId) continue;

    const topic = parseTicketTopic(channel.topic);
    if (!topic || topic.status !== "open") continue;

    const age = Date.now() - (topic.createdAt || 0);
    if (age < AUTO_CLOSE_MS) continue;

    const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    if (!msgs) continue;

    const ownerActive = msgs.some(m =>
      m.author?.id === topic.ownerId && !m.author?.bot
    );
    if (ownerActive) continue;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle("Ticket Auto-Closed")
          .setDescription(
            "This ticket was automatically closed after 48 hours of inactivity.\n" +
            "Open a new ticket if you need further assistance."
          )
          .setFooter({ text: "Mad House" })
          .setTimestamp()
      ]
    }).catch(() => null);

    setTimeout(() => channel.delete("Auto-closed: 48h inactivity").catch(() => null), 10_000);
  }
}

export function startTicketAutoClose(client) {
  const run = async () => {
    for (const [, guild] of client.guilds.cache) {
      await scanGuild(guild).catch(() => null);
    }
  };

  setTimeout(run, 10_000); // wait for cache to warm on startup
  setInterval(run, 60 * 60 * 1000);
}
