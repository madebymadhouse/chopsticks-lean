export const XP_FACTOR = 100;

export function levelFromXP(xp) {
  return Math.floor(Math.sqrt(xp / XP_FACTOR));
}

export function xpForNextLevel(level) {
  return XP_FACTOR * (level + 1) ** 2;
}
