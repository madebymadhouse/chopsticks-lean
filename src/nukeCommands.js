// src/nukeCommands.js
import { REST, Routes } from "discord.js";
import { config } from "dotenv";

config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

async function nuke() {
  if (!CLIENT_ID || !GUILD_ID) {
    throw new Error("CLIENT_ID or GUILD_ID missing");
  }

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [] }
  );

  console.log("Guild commands nuked");
}

nuke();
