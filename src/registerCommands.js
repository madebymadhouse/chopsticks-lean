import { REST, Routes } from "discord.js";
import { config } from "dotenv";

import { voiceCommand } from "./tools/voice/commands.js";

config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    process.env.CLIENT_ID,
    process.env.DEV_GUILD_ID
  ),
  {
    body: [
      voiceCommand.data.toJSON()
    ]
  }
);

console.log("Commands registered");
