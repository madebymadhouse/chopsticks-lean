// src/registerCommands.js
import { voiceCommand } from "./tools/voice/commands.js";
import { levelCommand } from "./tools/leveling/commands.js";

const commands = [
  voiceCommand,
  levelCommand
];

export async function registerCommands(client) {
  const payload = commands.map(cmd => cmd.data.toJSON());

  await client.application.commands.set(payload);
  console.log("Commands registered");
}
