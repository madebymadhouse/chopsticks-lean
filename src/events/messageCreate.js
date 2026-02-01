// src/events/messageCreate.js
import { addMessageXP } from "../tools/leveling/levelingController.js";

export default {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild) return;
    if (message.author.bot) return;

    addMessageXP(message.guild.id, message.author.id);
  }
};
