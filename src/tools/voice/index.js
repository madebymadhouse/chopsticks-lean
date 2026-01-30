import { registerVoiceCommands } from "./commands.js";
import { handleVoiceState } from "./events.js";

export function initVoiceTool(client) {
  registerVoiceCommands(client);
  client.on("voiceStateUpdate", handleVoiceState);
}
