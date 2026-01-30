import { REST, Routes } from "discord.js";
import { config } from "dotenv";

config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.DEV_GUILD_ID;

async function nuke() {
  // GLOBAL
  const global = await rest.get(
    Routes.applicationCommands(CLIENT_ID)
  );

  for (const cmd of global) {
    if (cmd.name === "chopsticks") {
      await rest.delete(
        Routes.applicationCommand(CLIENT_ID, cmd.id)
      );
      console.log("Deleted global:", cmd.name);
    }
  }

  // GUILD
  const guild = await rest.get(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  );

  for (const cmd of guild) {
    if (cmd.name === "chopsticks") {
      await rest.delete(
        Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id)
      );
      console.log("Deleted guild:", cmd.name);
    }
  }
}

nuke();
