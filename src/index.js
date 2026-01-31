// src/index.js
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { config } from "dotenv";

import { voiceCommand } from "./tools/voice/commands.js";
import voiceStateEvent from "./events/voiceStateUpdate.js";
config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

/* ---------- COMMAND MAP ---------- */

client.commands = new Collection();
client.commands.set(voiceCommand.data.name, voiceCommand);

/* ---------- INTERACTION ROUTER ---------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // SUBCOMMAND DISPATCH — THIS WAS MISSING
    const sub = interaction.options.getSubcommand(false);

    if (sub && command.subcommands?.[sub]) {
      await command.subcommands[sub](interaction);
      return;
    }

    // FALLBACK (flat command)
    if (typeof command.execute === "function") {
      await command.execute(interaction);
      return;
    }

    throw new Error("No handler for command");
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Command failed",
        ephemeral: true
      });
    }
  }
});

/* ---------- EVENTS ---------- */

client.on(
  voiceStateEvent.name,
  voiceStateEvent.execute
);

/* ---------- READY ---------- */

client.once("ready", () => {
  console.log("Chopsticks online");
});

/* ---------- LOGIN ---------- */

client.login(process.env.DISCORD_TOKEN);
