import fs from "fs";
import path from "path";

const BASE = path.join(process.cwd(), "data", "leveling");

function ensureDir() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
}

function filePath(guildId) {
  ensureDir();
  return path.join(BASE, `${guildId}.json`);
}

export function loadGuildLeveling(guildId) {
  const p = filePath(guildId);
  if (!fs.existsSync(p)) {
    return { users: {}, config: { xpPerMinuteVoice: 5, xpPerMessage: 1 } };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function saveGuildLeveling(guildId, data) {
  fs.writeFileSync(filePath(guildId), JSON.stringify(data, null, 2));
}
