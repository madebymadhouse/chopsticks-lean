import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";

import { Colors, replyError } from "../utils/discordOutput.js";
import { pickTriviaQuestion, listTriviaCategories } from "../game/trivia/bank.js";
import { makeTriviaSessionId, shuffleChoices, computeReward, formatDifficulty } from "../game/trivia/engine.js";
import { pickDmIntro } from "../game/trivia/narration.js";
import {
  getActiveTriviaSessionId,
  setActiveTriviaSessionId,
  clearActiveTriviaSessionId,
  loadTriviaSession,
  saveTriviaSession,
  deleteTriviaSession
} from "../game/trivia/session.js";
import { addCredits } from "../economy/wallet.js";
import { addGameXp } from "../game/profile.js";
import { recordQuestEvent } from "../game/quests.js";
import { withTimeout } from "../utils/interactionTimeout.js";

const SESSION_TTL_SECONDS = 15 * 60;
const QUESTION_TIME_LIMIT_MS = 30_000;
const LOBBY_TIMEOUT_MS = 2 * 60 * 1000;
const COUNTDOWN_SECONDS = 3;
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const DIFFICULTY_CHOICES = ["easy", "normal", "hard", "nightmare"];
const MODE_SOLO = "solo";
const MODE_PVP = "pvp";

function isSolo(session) {
  return String(session?.mode || "") === MODE_SOLO;
}

function isPvp(session) {
  return String(session?.mode || "") === MODE_PVP && Boolean(session?.opponentUserId);
}

function canUseMatchUi(session, userId) {
  const uid = String(userId || "");
  if (!uid) return false;
  if (uid === String(session?.userId || "")) return true;
  if (isPvp(session) && uid === String(session?.opponentUserId || "")) return true;
  return false;
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") return null;
  session.mode = isPvp(session) ? MODE_PVP : MODE_SOLO;
  session.opponentUserId = String(session.opponentUserId || "").trim() || null;
  session.userPick = Number.isFinite(Number(session.userPick))
    ? Math.max(0, Math.min(5, Math.trunc(Number(session.userPick))))
    : null;
  session.opponentPick = Number.isFinite(Number(session.opponentPick))
    ? Math.max(0, Math.min(5, Math.trunc(Number(session.opponentPick))))
    : null;
  session.userLockedAt = session.userLockedAt ? Number(session.userLockedAt) : null;
  session.opponentLockedAt = session.opponentLockedAt ? Number(session.opponentLockedAt) : null;
  session.acceptedAt = session.acceptedAt ? Number(session.acceptedAt) : null;
  session.forfeitedBy = String(session.forfeitedBy || "").trim() || null;

  session.opponents = isSolo(session) ? 0 : 1;
  return session;
}

function buildOpponentSummary(session) {
  if (isSolo(session)) return "None (solo)";
  return `<@${session.opponentUserId}>`;
}

function buildPicksSummary(session) {
  const lines = [];
  const yourPick = Number.isFinite(Number(session.userPick)) ? LETTERS[Number(session.userPick)] : null;
  lines.push(yourPick ? `<@${session.userId}>: **${yourPick}**` : `<@${session.userId}>: _not locked_`);

  if (isPvp(session)) {
    const oppPick = Number.isFinite(Number(session.opponentPick)) ? LETTERS[Number(session.opponentPick)] : null;
    lines.push(oppPick ? `<@${session.opponentUserId}>: **${oppPick}**` : `<@${session.opponentUserId}>: _not locked_`);
  }

  return lines.join("\n").slice(0, 1024);
}

function buildQuestionEmbed(session) {
  const lines = (session.choices || []).map((choice, idx) => `**${LETTERS[idx] || String(idx + 1)}.** ${choice}`);
  const remainingSec = Math.max(0, Math.ceil((Number(session.expiresAt || 0) - Date.now()) / 1000));

  const footerText = isPvp(session)
    ? (session.userLockedAt && session.opponentLockedAt
      ? "Locked in. Revealing results…"
      : `Pick an answer, then Lock In. Time left: ${remainingSec}s`)
    : (session.userLockedAt
      ? "Locked in. Revealing results…"
      : `Pick an answer, then Lock In. Time left: ${remainingSec}s`);

  return new EmbedBuilder()
    .setTitle(isPvp(session) ? "🧩 Trivia Versus" : "🧩 Trivia Solo")
    .setColor(Colors.INFO)
    .setDescription(pickDmIntro())
    .addFields(
      { name: "Category", value: String(session.category || "Any"), inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Mode", value: isPvp(session) ? "Versus" : "Solo", inline: true },
      { name: "Opponents", value: buildOpponentSummary(session), inline: false },
      { name: "Question", value: String(session.prompt || "…"), inline: false },
      { name: "Choices", value: lines.join("\n").slice(0, 1024), inline: false },
      { name: "Picks", value: buildPicksSummary(session), inline: false }
    )
    .setFooter({ text: footerText })
    .setTimestamp();
}

function buildAnswerComponents(sessionId, choicesLen, { disabled = false } = {}) {
  const options = LETTERS
    .slice(0, Math.max(2, Math.min(6, Math.trunc(Number(choicesLen) || 4))))
    .map((label, idx) => ({ label, value: String(idx) }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`trivia:sel:${sessionId}`)
    .setPlaceholder("Choose your answer…")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(Boolean(disabled))
    .addOptions(options);

  const row1 = new ActionRowBuilder().addComponents(menu);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trivia:btn:${sessionId}:lock`)
      .setLabel("Lock In")
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(disabled)),
    new ButtonBuilder()
      .setCustomId(`trivia:btn:${sessionId}:status`)
      .setLabel("Status")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`trivia:btn:${sessionId}:forfeit`)
      .setLabel("Forfeit")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

function buildLobbyEmbed(session) {
  if (isPvp(session)) {
    return new EmbedBuilder()
      .setTitle("🧩 Trivia: Challenge")
      .setColor(Colors.INFO)
      .setDescription(
        `${pickDmIntro()}\n\n` +
        `**Mode:** Versus\n` +
        `**Host:** <@${session.userId}>\n` +
        `**Opponent:** <@${session.opponentUserId}>\n` +
        `**Status:** ${session.acceptedAt ? "✅ Accepted" : "⏳ Waiting for opponent"}\n\n` +
        `Host can configure options below.`
      )
      .addFields(
        { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
        { name: "Category", value: String(session.category || "Any"), inline: true }
      )
      .setFooter({ text: "This lobby expires if you don't start." })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setTitle("🧩 Trivia: Solo Ready")
    .setColor(Colors.INFO)
    .setDescription(
      `${pickDmIntro()}\n\n` +
      `**Mode:** Solo\n` +
      `**Difficulty:** ${formatDifficulty(session.difficulty)}\n` +
      `**Category:** ${String(session.category || "Any")}\n\n` +
      `Select options below, then press **Start**.`
    )
    .addFields({ name: "Opponents", value: "None", inline: false })
    .setFooter({ text: "This lobby expires if you don't start." })
    .setTimestamp();
}

function buildDifficultyMenuOptions(selected) {
  const current = String(selected || "normal").toLowerCase();
  return DIFFICULTY_CHOICES.map(value => ({
    label: formatDifficulty(value),
    value,
    default: value === current
  }));
}

function buildCategoryMenuOptions(selected) {
  const selectedVal = String(selected || "Any");
  const categories = [];
  const seen = new Set();

  for (const category of listTriviaCategories().map(c => String(c || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))) {
    const key = category.toLowerCase();
    if (key === "any" || seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
    if (categories.length >= 24) break;
  }

  const options = [{ label: "Any", value: "Any", default: selectedVal === "Any" }];
  for (const category of categories) {
    options.push({ label: category.slice(0, 100), value: category, default: category === selectedVal });
  }
  if (!options.some(option => option.default)) options[0].default = true;
  return options.slice(0, 25);
}

function buildLobbyComponents(sessionId, session, { disabled = false } = {}) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`trivia:cfg:${sessionId}:difficulty`)
        .setPlaceholder("Difficulty")
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(Boolean(disabled))
        .addOptions(buildDifficultyMenuOptions(session?.difficulty))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`trivia:cfg:${sessionId}:category`)
        .setPlaceholder("Category")
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(Boolean(disabled))
        .addOptions(buildCategoryMenuOptions(session?.category))
    )
  ];

  if (isPvp(session)) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`trivia:btn:${sessionId}:accept`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success)
          .setDisabled(Boolean(disabled) || Boolean(session?.acceptedAt)),
        new ButtonBuilder()
          .setCustomId(`trivia:btn:${sessionId}:decline`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(Boolean(disabled) || Boolean(session?.acceptedAt))
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trivia:btn:${sessionId}:start`)
        .setLabel("Start")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(disabled) || (isPvp(session) && !session?.acceptedAt)),
      new ButtonBuilder()
        .setCustomId(`trivia:btn:${sessionId}:rules`)
        .setLabel("Rules")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(disabled)),
      new ButtonBuilder()
        .setCustomId(`trivia:btn:${sessionId}:status`)
        .setLabel("Status")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`trivia:btn:${sessionId}:forfeit`)
        .setLabel(isPvp(session) ? "Cancel / Forfeit" : "Cancel")
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

async function getSessionMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return { channel: null, msg: null };
  const msg = session.messageId ? await channel.messages.fetch(session.messageId).catch(() => null) : null;
  return { channel, msg };
}

function buildStatusEmbed(session) {
  const picks = [];
  const yourPick = Number.isFinite(Number(session.userPick)) ? LETTERS[Number(session.userPick)] : "not selected";
  picks.push(`<@${session.userId}>: ${yourPick}`);
  if (isPvp(session)) {
    const oppPick = Number.isFinite(Number(session.opponentPick)) ? LETTERS[Number(session.opponentPick)] : "not selected";
    picks.push(`<@${session.opponentUserId}>: ${oppPick}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("Trivia Status")
    .setColor(Colors.INFO)
    .addFields(
      { name: "Mode", value: isPvp(session) ? "Versus" : "Solo", inline: true },
      { name: "Stage", value: String(session.stage || "lobby"), inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Category", value: String(session.category || "Any"), inline: true },
      { name: "Opponents", value: isPvp(session) ? "1" : "0", inline: true },
      { name: "Session", value: String(session.sessionId || "unknown"), inline: true },
      { name: "Picks", value: picks.join("\n").slice(0, 1024), inline: false }
    )
    .setTimestamp();

  if (session.stage === "question") {
    const left = Math.max(0, Math.ceil((Number(session.expiresAt || 0) - Date.now()) / 1000));
    embed.addFields({ name: "Time Left", value: `${left}s`, inline: true });
  }
  return embed;
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("Trivia Guide")
    .setColor(Colors.INFO)
    .setDescription("Quick setup and flow for this match.")
    .addFields(
      {
        name: "Start Match",
        value: [
          "1. Choose Difficulty and Category.",
          "2. Press Start.",
          "3. Wait for the question to appear."
        ].join("\n"),
        inline: false
      },
      {
        name: "During Question",
        value: [
          "1. Pick an answer from the dropdown.",
          "2. Press Lock In before time runs out.",
          "3. Use Status anytime to check progress."
        ].join("\n"),
        inline: false
      },
      {
        name: "Modes",
        value: [
          "Solo: practice run with no opponents.",
          "Versus: challenge another player."
        ].join("\n"),
        inline: true
      },
      {
        name: "Rewards",
        value: [
          "Wins give higher rewards.",
          "Losses still grant some XP."
        ].join("\n"),
        inline: true
      }
    )
    .setFooter({ text: "Tip: Tune category + difficulty before starting." })
    .setTimestamp();
}

function prepareSessionForMatch(session) {
  const question = pickTriviaQuestion({ difficulty: session.difficulty, category: session.category });
  if (!question) return { ok: false, reason: "no-questions" };

  const { shuffled, correctIndex } = shuffleChoices(question.choices, question.answerIndex);
  session.prompt = question.prompt;
  session.explanation = question.explanation || null;
  session.category = question.category || session.category || "Any";
  session.choices = shuffled.slice(0, 4);
  session.correctIndex = correctIndex;
  session.userPick = null;
  session.userLockedAt = null;
  session.opponentPick = null;
  session.opponentLockedAt = null;
  return { ok: true };
}

async function showQuestion(client, sessionId) {
  const session = normalizeSession(await loadTriviaSession(sessionId));
  if (!session || session.endedAt) return false;

  session.stage = "question";
  session.revealedAt = Date.now();
  session.expiresAt = session.revealedAt + QUESTION_TIME_LIMIT_MS;
  await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

  const { msg } = await getSessionMessage(client, session);
  if (msg) {
    await msg.edit({
      embeds: [buildQuestionEmbed(session)],
      components: buildAnswerComponents(sessionId, session.choices?.length || 4, { disabled: false })
    }).catch(() => {});
  }

  setTimeout(() => {
    (async () => {
      const live = normalizeSession(await loadTriviaSession(sessionId));
      if (!live || live.endedAt || live.stage !== "question") return;
      if (!live.userLockedAt) live.userLockedAt = Date.now();
      if (isPvp(live) && !live.opponentLockedAt) live.opponentLockedAt = Date.now();
      await saveTriviaSession(sessionId, live, SESSION_TTL_SECONDS);
      await finalizeSession(client, sessionId, { reason: "timeout" });
    })().catch(() => {});
  }, Math.max(1_000, session.expiresAt - Date.now() + 250));

  return true;
}

async function runCountdown(client, sessionId) {
  for (let i = COUNTDOWN_SECONDS; i >= 1; i -= 1) {
    const session = normalizeSession(await loadTriviaSession(sessionId));
    if (!session || session.endedAt) return false;

    const embed = new EmbedBuilder()
      .setTitle("⏳ Starting…")
      .setColor(Colors.INFO)
      .setDescription(`Question reveals in **${i}**…`)
      .addFields(
        { name: "Mode", value: isPvp(session) ? "Versus" : "Solo", inline: true },
        { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
        { name: "Category", value: String(session.category || "Any"), inline: true }
      )
      .setFooter({ text: "Get ready." })
      .setTimestamp();

    const { msg } = await getSessionMessage(client, session);
    if (msg) {
      await msg.edit({ embeds: [embed], components: buildLobbyComponents(sessionId, session, { disabled: true }) }).catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return true;
}

function resolveSoloResult(session) {
  const correct = session.correctIndex;
  const userPick = Number.isFinite(Number(session.userPick)) ? Number(session.userPick) : null;
  return { result: userPick === correct ? "win" : "lose", userCorrect: userPick === correct };
}

function resolvePvpResult(session) {
  const correct = session.correctIndex;
  const hostPick = Number.isFinite(Number(session.userPick)) ? Number(session.userPick) : null;
  const oppPick = Number.isFinite(Number(session.opponentPick)) ? Number(session.opponentPick) : null;
  const hostCorrect = hostPick === correct;
  const oppCorrect = oppPick === correct;

  let hostResult = "tie";
  let oppResult = "tie";

  if (hostCorrect && !oppCorrect) {
    hostResult = "win";
    oppResult = "lose";
  } else if (!hostCorrect && oppCorrect) {
    hostResult = "lose";
    oppResult = "win";
  } else if (hostCorrect && oppCorrect) {
    const hostAt = Number(session.userLockedAt || 0);
    const oppAt = Number(session.opponentLockedAt || 0);
    if (hostAt && oppAt) {
      if (hostAt < oppAt) {
        hostResult = "win";
        oppResult = "lose";
      } else if (hostAt > oppAt) {
        hostResult = "lose";
        oppResult = "win";
      }
    }
  }

  return { hostResult, oppResult };
}

async function finalizeSoloSession(client, sessionId, session, { reason = "completed" } = {}) {
  const preMatch = !Array.isArray(session.choices) || !Number.isFinite(Number(session.correctIndex));
  await deleteTriviaSession(sessionId);
  await clearActiveTriviaSessionId({ guildId: session.guildId, channelId: session.channelId, userId: session.userId });

  if (preMatch) {
    const embed = new EmbedBuilder()
      .setTitle("🧩 Trivia Results")
      .setColor(Colors.INFO)
      .setDescription(reason === "lobby-timeout" ? "Lobby timed out before the run started." : "Run cancelled before start.")
      .setTimestamp();
    const { channel, msg } = await getSessionMessage(client, session);
    if (channel) {
      if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      else await channel.send({ embeds: [embed] }).catch(() => {});
    }
    return true;
  }

  const { result, userCorrect } = resolveSoloResult(session);
  const reward = reason === "forfeit" ? { credits: 0, xp: 0 } : computeReward({ difficulty: session.difficulty, result, answeredBeforeAgent: false });

  try { if (reward.credits > 0) await addCredits(session.userId, reward.credits, `Trivia (solo ${session.difficulty}): ${result}`); } catch {}
  let xpRes = null;
  try { xpRes = await addGameXp(session.userId, reward.xp, { reason: `trivia:solo:${result}` }); } catch {}
  try { await recordQuestEvent(session.userId, "trivia_runs", 1); } catch {}
  try { if (result === "win") await recordQuestEvent(session.userId, "trivia_wins", 1); } catch {}

  const embed = new EmbedBuilder()
    .setTitle("🧩 Trivia Results")
    .setColor(userCorrect ? Colors.SUCCESS : Colors.ERROR)
    .setDescription(userCorrect ? "Correct." : "Incorrect.")
    .addFields(
      { name: "Mode", value: "Solo", inline: true },
      { name: "Category", value: String(session.category || "Any"), inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Correct", value: `**${LETTERS[session.correctIndex] || "?"}**`, inline: true },
      { name: "Your Pick", value: Number.isFinite(Number(session.userPick)) ? `**${LETTERS[Number(session.userPick)] || "?"}**` : "_none_", inline: true },
      {
        name: "Rewards",
        value: reason === "forfeit"
          ? "No rewards granted (run cancelled)."
          : `+${reward.credits.toLocaleString()} Credits • +${reward.xp.toLocaleString()} XP`,
        inline: false
      }
    )
    .setTimestamp();

  if (session.explanation) embed.addFields({ name: "Why", value: String(session.explanation).slice(0, 400), inline: false });
  if (xpRes?.granted?.length) {
    const crates = xpRes.granted.slice(0, 3).map(g => `Lv ${g.level}: \`${g.crateId}\``).join("\n");
    const more = xpRes.granted.length > 3 ? `\n...and ${xpRes.granted.length - 3} more.` : "";
    embed.addFields({ name: "Level Rewards", value: crates + more, inline: false });
  }

  const { channel, msg } = await getSessionMessage(client, session);
  if (channel) {
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    else await channel.send({ embeds: [embed] }).catch(() => {});
  }
  return true;
}

async function finalizePvpSession(client, sessionId, session, { reason = "completed", actorUserId = null } = {}) {
  const preMatch = !Array.isArray(session.choices) || !Number.isFinite(Number(session.correctIndex));
  const hostId = String(session.userId || "");
  const oppId = String(session.opponentUserId || "");

  await deleteTriviaSession(sessionId);
  await clearActiveTriviaSessionId({ guildId: session.guildId, channelId: session.channelId, userId: hostId });
  if (oppId) await clearActiveTriviaSessionId({ guildId: session.guildId, channelId: session.channelId, userId: oppId }).catch(() => {});

  if (preMatch) {
    const desc =
      reason === "declined" ? `<@${oppId}> declined the challenge.`
        : reason === "lobby-timeout" ? "Lobby timed out before the match started."
        : reason === "forfeit" ? `Match cancelled by <@${actorUserId || hostId}>.`
        : "Match cancelled before start.";

    const embed = new EmbedBuilder()
      .setTitle("🧩 Trivia Results")
      .setColor(Colors.INFO)
      .setDescription(desc)
      .setTimestamp();

    const { channel, msg } = await getSessionMessage(client, session);
    if (channel) {
      if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      else await channel.send({ embeds: [embed] }).catch(() => {});
    }
    return true;
  }

  const resolved = resolvePvpResult(session);
  const hostReward = reason === "forfeit" ? { credits: 0, xp: 0 } : computeReward({ difficulty: session.difficulty, result: resolved.hostResult, answeredBeforeAgent: false });
  const oppReward = reason === "forfeit" ? { credits: 0, xp: 0 } : computeReward({ difficulty: session.difficulty, result: resolved.oppResult, answeredBeforeAgent: false });

  try { if (hostReward.credits > 0) await addCredits(hostId, hostReward.credits, `Trivia (versus ${session.difficulty}): ${resolved.hostResult}`); } catch {}
  try { if (oppReward.credits > 0) await addCredits(oppId, oppReward.credits, `Trivia (versus ${session.difficulty}): ${resolved.oppResult}`); } catch {}
  let hostXp = null;
  let oppXp = null;
  try { hostXp = await addGameXp(hostId, hostReward.xp, { reason: `trivia:pvp:${resolved.hostResult}` }); } catch {}
  try { oppXp = await addGameXp(oppId, oppReward.xp, { reason: `trivia:pvp:${resolved.oppResult}` }); } catch {}
  try { await recordQuestEvent(hostId, "trivia_runs", 1); } catch {}
  try { await recordQuestEvent(oppId, "trivia_runs", 1); } catch {}
  try { if (resolved.hostResult === "win") await recordQuestEvent(hostId, "trivia_wins", 1); } catch {}
  try { if (resolved.oppResult === "win") await recordQuestEvent(oppId, "trivia_wins", 1); } catch {}

  const winnerLine =
    reason === "forfeit" ? `Forfeited by <@${actorUserId || hostId}>.`
      : resolved.hostResult === "win" ? `<@${hostId}> won.`
      : resolved.oppResult === "win" ? `<@${oppId}> won.`
      : "It's a tie.";

  const embed = new EmbedBuilder()
    .setTitle("🧩 Trivia Results")
    .setColor(resolved.hostResult === "win" ? Colors.SUCCESS : resolved.oppResult === "win" ? Colors.ERROR : Colors.INFO)
    .setDescription(winnerLine)
    .addFields(
      { name: "Mode", value: "Versus", inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Category", value: String(session.category || "Any"), inline: true },
      { name: "Correct", value: `**${LETTERS[session.correctIndex] || "?"}**`, inline: true },
      { name: `<@${hostId}>`, value: Number.isFinite(Number(session.userPick)) ? `**${LETTERS[Number(session.userPick)] || "?"}**` : "_none_", inline: true },
      { name: `<@${oppId}>`, value: Number.isFinite(Number(session.opponentPick)) ? `**${LETTERS[Number(session.opponentPick)] || "?"}**` : "_none_", inline: true },
      {
        name: "Rewards",
        value: reason === "forfeit"
          ? "No rewards granted (match cancelled)."
          : [
            `<@${hostId}>: +${hostReward.credits.toLocaleString()} Credits • +${hostReward.xp.toLocaleString()} XP`,
            `<@${oppId}>: +${oppReward.credits.toLocaleString()} Credits • +${oppReward.xp.toLocaleString()} XP`
          ].join("\n").slice(0, 1024),
        inline: false
      }
    )
    .setTimestamp();

  if (session.explanation) embed.addFields({ name: "Why", value: String(session.explanation).slice(0, 400), inline: false });
  if (hostXp?.granted?.length) {
    const crates = hostXp.granted.slice(0, 2).map(g => `Lv ${g.level}: \`${g.crateId}\``).join("\n");
    const more = hostXp.granted.length > 2 ? `\n...and ${hostXp.granted.length - 2} more.` : "";
    embed.addFields({ name: "Level Rewards (Host)", value: crates + more, inline: false });
  }
  if (oppXp?.granted?.length) {
    const crates = oppXp.granted.slice(0, 2).map(g => `Lv ${g.level}: \`${g.crateId}\``).join("\n");
    const more = oppXp.granted.length > 2 ? `\n...and ${oppXp.granted.length - 2} more.` : "";
    embed.addFields({ name: "Level Rewards (Opponent)", value: crates + more, inline: false });
  }

  const { channel, msg } = await getSessionMessage(client, session);
  if (channel) {
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    else await channel.send({ embeds: [embed] }).catch(() => {});
  }
  return true;
}

async function finalizeSession(client, sessionId, { reason = "completed", actorUserId = null } = {}) {
  const session = normalizeSession(await loadTriviaSession(sessionId));
  if (!session || session.endedAt) return false;
  if (isPvp(session)) return finalizePvpSession(client, sessionId, session, { reason, actorUserId });
  return finalizeSoloSession(client, sessionId, session, { reason });
}

export const meta = {
  deployGlobal: false,
  category: "entertainment",
  guildOnly: true,
};

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("Play trivia solo or challenge another player")
  .addSubcommand(sub =>
    sub
      .setName("start")
      .setDescription("Start a trivia run")
      .addStringOption(o =>
        o.setName("difficulty")
          .setDescription("Question difficulty")
          .setRequired(false)
          .addChoices(
            { name: "Easy", value: "easy" },
            { name: "Normal", value: "normal" },
            { name: "Hard", value: "hard" },
            { name: "Nightmare", value: "nightmare" }
          )
      )
      .addStringOption(o =>
        o.setName("category")
          .setDescription("Question category")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(o =>
        o.setName("public")
          .setDescription("Post the run publicly in this channel (default true)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("solo")
      .setDescription("Play a solo trivia run")
      .addStringOption(o =>
        o.setName("difficulty")
          .setDescription("Question difficulty")
          .setRequired(false)
          .addChoices(
            { name: "Easy", value: "easy" },
            { name: "Normal", value: "normal" },
            { name: "Hard", value: "hard" },
            { name: "Nightmare", value: "nightmare" }
          )
      )
      .addStringOption(o =>
        o.setName("category")
          .setDescription("Question category")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(o =>
        o.setName("public")
          .setDescription("Post the run publicly in this channel (default true)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("versus")
      .setDescription("Challenge another player to trivia")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("Opponent (must accept)")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("difficulty")
          .setDescription("Question difficulty")
          .setRequired(false)
          .addChoices(
            { name: "Easy", value: "easy" },
            { name: "Normal", value: "normal" },
            { name: "Hard", value: "hard" },
            { name: "Nightmare", value: "nightmare" }
          )
      )
      .addStringOption(o =>
        o.setName("category")
          .setDescription("Question category")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(o =>
        o.setName("public")
          .setDescription("Post the match publicly in this channel (default true)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("stop")
      .setDescription("Forfeit your current trivia match in this channel")
  );

export default {
  data,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "category") return interaction.respond([]);
    const query = String(focused.value || "").toLowerCase();
    const options = listTriviaCategories()
      .filter(category => String(category).toLowerCase().includes(query))
      .slice(0, 25)
      .map(category => ({ name: category, value: category }));
    await interaction.respond(options);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    if (!guildId) {
      return replyError(interaction, "Guild Only", "Trivia matches can only be played in a server.", true);
    }

    if (sub === "stop") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await withTimeout(interaction, async () => {
        const active = await getActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id });
        if (!active) {
          return replyError(interaction, "No Active Match", "You have no active trivia match in this channel.", true);
        }
        await finalizeSession(interaction.client, String(active), { reason: "forfeit", actorUserId: interaction.user.id });
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(Colors.SUCCESS).setTitle("Forfeited").setDescription("Your trivia match has been ended.")]
        });
      }, { label: "trivia" });
      return;
    }

    const isPublic = interaction.options.getBoolean("public");
    const publicMode = isPublic === null ? true : Boolean(isPublic);
    if ((sub === "start" || sub === "versus") && !publicMode) {
      return replyError(interaction, "Not Supported Yet", "Private trivia matches are not supported for this mode.\nUse `public:true` for now.", true);
    }

    await interaction.deferReply({ flags: publicMode ? undefined : MessageFlags.Ephemeral });
    await withTimeout(interaction, async () => {
      const existing = await getActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id });
      if (existing) {
        const live = normalizeSession(await loadTriviaSession(String(existing)));
        if (live) {
          if (live.stage === "lobby" && !live.messageId) {
            await deleteTriviaSession(String(existing));
            await clearActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id });
          } else {
            return replyError(interaction, "Match Already Running", "You already have an active trivia match in this channel.\nUse `/trivia stop` to forfeit it.", true);
          }
        }
      }

      let opponentUser = null;
      if (sub === "versus") {
        opponentUser = interaction.options.getUser("user", true);
        if (!opponentUser || opponentUser.bot) {
          return replyError(interaction, "Invalid Opponent", "Pick a real user (not a bot).", true);
        }
        if (opponentUser.id === interaction.user.id) {
          return replyError(interaction, "Invalid Opponent", "You cannot challenge yourself.", true);
        }
        const oppActive = await getActiveTriviaSessionId({ guildId, channelId, userId: opponentUser.id });
        if (oppActive) {
          return replyError(interaction, "Opponent Busy", "That user already has an active trivia match in this channel.", true);
        }
      }

      const difficulty = interaction.options.getString("difficulty") || "normal";
      const category = interaction.options.getString("category") || "Any";
      const sessionId = makeTriviaSessionId();
      const session = normalizeSession({
        sessionId,
        guildId,
        channelId,
        userId: interaction.user.id,
        opponentUserId: opponentUser?.id || null,
        acceptedAt: null,
        difficulty,
        category: String(category || "Any"),
        prompt: null,
        explanation: null,
        choices: null,
        correctIndex: null,
        createdAt: Date.now(),
        stage: "lobby",
        expiresAt: null,
        revealedAt: null,
        mode: sub === "versus" ? MODE_PVP : MODE_SOLO,
        opponents: sub === "versus" ? 1 : 0,
        userPick: null,
        userLockedAt: null,
        opponentPick: null,
        opponentLockedAt: null,
        messageId: null,
        publicMode
      });

      try {
        await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
        await setActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id, sessionId, ttlSeconds: SESSION_TTL_SECONDS });

        const msg = await interaction.editReply({
          embeds: [buildLobbyEmbed(session)],
          components: buildLobbyComponents(sessionId, session, { disabled: false }),
          flags: publicMode ? undefined : MessageFlags.Ephemeral,
          fetchReply: true
        });

        session.messageId = msg?.id || null;
        await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
      } catch {
        try { await deleteTriviaSession(sessionId); } catch {}
        try { await clearActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id }); } catch {}
        return replyError(interaction, "Trivia Error", "Could not open the trivia setup panel. Please run `/trivia start` again.", true);
      }

      setTimeout(() => {
        (async () => {
          const live = normalizeSession(await loadTriviaSession(sessionId));
          if (!live || live.endedAt || live.stage !== "lobby") return;
          await finalizeSession(interaction.client, sessionId, { reason: "lobby-timeout" });
        })().catch(() => {});
      }, LOBBY_TIMEOUT_MS);
    }, { label: "trivia" });
  }
};

export async function handleSelect(interaction) {
  const id = String(interaction.customId || "");
  if (!id.startsWith("trivia:")) return false;

  const parts = id.split(":");
  const area = parts[1];
  if (area !== "sel" && area !== "cfg") return false;

  const sessionId = parts[2];
  const session = normalizeSession(await loadTriviaSession(sessionId));
  if (!session) {
    await interaction.reply({ content: "This match expired. Run `/trivia start` again.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (area === "cfg") {
    if (interaction.user.id !== session.userId) {
      await interaction.reply({ content: "Only the host can change match settings.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (session.stage !== "lobby") {
      await interaction.reply({ content: "Setup is locked after Start.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const configKey = parts[3];
    const value = String(interaction.values?.[0] || "").trim();
    if (!value) {
      await interaction.reply({ content: "No value selected.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (configKey === "difficulty") {
      const next = String(value).toLowerCase();
      if (!DIFFICULTY_CHOICES.includes(next)) {
        await interaction.reply({ content: "Unsupported difficulty.", flags: MessageFlags.Ephemeral });
        return true;
      }
      session.difficulty = next;
    } else if (configKey === "category") {
      session.category = value === "Any" ? "Any" : value;
    } else {
      await interaction.reply({ content: "Unknown setup option.", flags: MessageFlags.Ephemeral });
      return true;
    }

    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
    await interaction.update({
      embeds: [buildLobbyEmbed(session)],
      components: buildLobbyComponents(sessionId, session, { disabled: false })
    });
    return true;
  }

  if (!canUseMatchUi(session, interaction.user.id)) {
    await interaction.reply({ content: "This match belongs to another user.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (session.stage !== "question") {
    await interaction.reply({ content: "Not ready yet. Press Start first.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const isOpponent = isPvp(session) && interaction.user.id === session.opponentUserId;
  if (isOpponent ? session.opponentLockedAt : session.userLockedAt) {
    await interaction.reply({ content: "Already locked in.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const maxIndex = Math.max(0, (session.choices?.length || 4) - 1);
  const pick = Math.max(0, Math.min(maxIndex, Math.trunc(Number(interaction.values?.[0]))));
  if (isOpponent) session.opponentPick = pick;
  else session.userPick = pick;

  await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
  await interaction.update({
    embeds: [buildQuestionEmbed(session)],
    components: buildAnswerComponents(sessionId, session.choices?.length || 4, { disabled: false })
  });
  return true;
}

export async function handleButton(interaction) {
  const id = String(interaction.customId || "");
  if (!id.startsWith("trivia:btn:")) return false;

  const parts = id.split(":");
  const sessionId = parts[2];
  const action = parts[3];
  const session = normalizeSession(await loadTriviaSession(sessionId));
  if (!session) {
    await interaction.reply({ content: "This match expired. Run `/trivia start` again.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!canUseMatchUi(session, interaction.user.id)) {
    await interaction.reply({ content: "This match belongs to another user.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "rules") {
    await interaction.reply({ embeds: [buildRulesEmbed()], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "status") {
    await interaction.reply({ embeds: [buildStatusEmbed(session)], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "accept" || action === "decline") {
    if (!isPvp(session)) {
      await interaction.reply({ content: "This is not a versus match.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (session.stage !== "lobby") {
      await interaction.reply({ content: "This match already started.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.user.id !== session.opponentUserId) {
      await interaction.reply({ content: "Only the challenged opponent can do that.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (action === "accept") {
      if (session.acceptedAt) {
        await interaction.reply({ content: "Already accepted.", flags: MessageFlags.Ephemeral });
        return true;
      }

      const oppActive = await getActiveTriviaSessionId({
        guildId: session.guildId,
        channelId: session.channelId,
        userId: session.opponentUserId
      });
      if (oppActive) {
        await interaction.reply({ content: "You already have an active trivia match in this channel.", flags: MessageFlags.Ephemeral });
        return true;
      }

      session.acceptedAt = Date.now();
      await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
      await setActiveTriviaSessionId({
        guildId: session.guildId,
        channelId: session.channelId,
        userId: session.opponentUserId,
        sessionId,
        ttlSeconds: SESSION_TTL_SECONDS
      });

      await interaction.update({
        embeds: [buildLobbyEmbed(session)],
        components: buildLobbyComponents(sessionId, session, { disabled: false })
      });
      return true;
    }

    await interaction.deferUpdate();
    await finalizeSession(interaction.client, sessionId, { reason: "declined", actorUserId: interaction.user.id });
    return true;
  }

  if (action === "start") {
    if (session.stage !== "lobby") {
      await interaction.reply({ content: "Already started.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (isPvp(session)) {
      if (interaction.user.id !== session.userId) {
        await interaction.reply({ content: "Only the host can start.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!session.acceptedAt) {
        await interaction.reply({ content: "Waiting for the opponent to accept.", flags: MessageFlags.Ephemeral });
        return true;
      }
    }

    const prep = prepareSessionForMatch(session);
    if (!prep.ok) {
      const message = prep.reason === "no-questions"
        ? "No trivia questions are available for the selected category/difficulty."
        : "Unable to start this match.";
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      return true;
    }

    session.stage = "countdown";
    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
    await interaction.update({
      embeds: [buildLobbyEmbed(session)],
      components: buildLobbyComponents(sessionId, session, { disabled: true })
    });
    await runCountdown(interaction.client, sessionId);
    await showQuestion(interaction.client, sessionId);
    return true;
  }

  if (action === "forfeit") {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle("Cancelled").setDescription("Ending match…")],
      components: []
    });
    await finalizeSession(interaction.client, sessionId, { reason: "forfeit", actorUserId: interaction.user.id });
    return true;
  }

  if (action === "lock") {
    if (session.stage !== "question") {
      await interaction.reply({ content: "Press Start first.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const isOpponent = isPvp(session) && interaction.user.id === session.opponentUserId;
    const actorLockedAt = isOpponent ? session.opponentLockedAt : session.userLockedAt;
    const actorPick = isOpponent ? session.opponentPick : session.userPick;
    if (actorLockedAt) {
      await interaction.reply({ content: "Already locked in.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (actorPick === null || actorPick === undefined) {
      await interaction.reply({ content: "Pick an option first.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (isOpponent) session.opponentLockedAt = Date.now();
    else session.userLockedAt = Date.now();
    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

    await interaction.update({
      embeds: [buildQuestionEmbed(session)],
      components: buildAnswerComponents(sessionId, session.choices?.length || 4, { disabled: isSolo(session) })
    });

    if (isSolo(session)) {
      await finalizeSession(interaction.client, sessionId, { reason: "completed", actorUserId: interaction.user.id });
      return true;
    }

    const updated = normalizeSession(await loadTriviaSession(sessionId));
    if (updated?.userLockedAt && updated?.opponentLockedAt) {
      await finalizeSession(interaction.client, sessionId, { reason: "completed", actorUserId: interaction.user.id });
    }
    return true;
  }

  await interaction.reply({ content: "Unknown trivia action.", flags: MessageFlags.Ephemeral });
  return true;
}
