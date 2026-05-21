"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENTRY_PREFIX = "hermes-mobile-growth-progress-entry";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeEntryId(value) {
  return cleanString(value)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || `growth-${Date.now()}`;
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function reportName(input = {}) {
  const explicit = cleanString(input.reportName || input.report?.name);
  if (explicit) return explicit;
  const filePath = cleanString(input.reportPath || input.report?.path);
  return filePath ? path.basename(filePath) : "";
}

function feedbackList(evaluation = {}) {
  return asArray(evaluation.feedbackSections?.focusAreas || evaluation.revisionRequirements)
    .map(cleanString)
    .filter(Boolean)
    .slice(0, 6);
}

function nextPractice(evaluation = {}) {
  return cleanString(
    evaluation.feedbackSections?.nextPractice
    || evaluation.nextPractice
    || evaluation.nextStep
    || "",
  );
}

function rewardSummary(evaluation = {}) {
  const reward = evaluation.reward || {};
  const coinAmount = Number(reward.coinAmount || 0) || 0;
  const maxCoins = Number(reward.maxCoinAmount || reward.maxCoins || 0) || 0;
  if (!reward.eligible) return maxCoins ? `not_eligible / max ${maxCoins}` : "not_eligible";
  return maxCoins ? `${coinAmount}/${maxCoins}` : String(coinAmount);
}

function progressEntry(input = {}) {
  const card = input.card || {};
  const evaluation = input.evaluation || {};
  const cardId = cleanString(input.cardId || cardField(card, "id", "todoId", "todo_id")) || "card";
  const evaluatedAt = cleanString(evaluation.evaluatedAt || input.evaluatedAt || input.nowIso) || new Date().toISOString();
  const activity = cleanString(evaluation.activityType || input.activityType || card.learningTaskModel?.activityType || card.learningGrowthTaskModel?.activityType || "task");
  const title = cardField(card, "content", "title", "name") || cardId;
  const id = safeEntryId(evaluation.evaluationId || `${cardId}:${evaluation.stage || "stage"}:${evaluation.status || "status"}:${evaluatedAt}`);
  const focus = feedbackList(evaluation);
  const report = reportName(input);
  const lines = [
    `<!-- ${ENTRY_PREFIX}:${id} -->`,
    `## ${evaluatedAt} · ${title}`,
    "",
    `- Card id: ${cardId}`,
    `- Activity: ${activity}`,
    `- Skill: ${cleanString(evaluation.skillId || card.learningTaskModel?.skillId || card.learningGrowthTaskModel?.skillId || "") || "not_recorded"}`,
    `- Stage: ${cleanString(evaluation.stage || "not_recorded")}`,
    `- Status: ${cleanString(evaluation.status || "not_recorded")}`,
    `- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    `- Passed: ${Boolean(evaluation.passed)}`,
    `- Reward: ${rewardSummary(evaluation)}`,
    `- Report: ${report || "not_generated"}`,
    "",
    "### Summary",
    "",
    cleanString(evaluation.summary) || "No evaluation summary recorded.",
    "",
    "### Focus signals",
    "",
    ...(focus.length ? focus.map((item) => `- ${item}`) : ["- Not recorded"]),
    "",
    "### Next practice signal",
    "",
    nextPractice(evaluation) || "Not recorded.",
    "",
    `<!-- /${ENTRY_PREFIX}:${id} -->`,
  ];
  return { id, evaluatedAt, markdown: lines.join("\n") };
}

function extractEntries(text = "") {
  const source = String(text || "");
  const pattern = new RegExp(`<!-- ${ENTRY_PREFIX}:([^>]+) -->[\\s\\S]*?<!-- /${ENTRY_PREFIX}:\\1 -->`, "g");
  const entries = [];
  let match = null;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ id: cleanString(match[1]), markdown: match[0] });
  }
  return entries;
}

function upsertProgressMarkdown(existingText = "", entry = {}, input = {}) {
  const title = cleanString(input.title) || "Fanfan Growth progress signals";
  const updatedAt = cleanString(input.updatedAt || entry.evaluatedAt) || new Date().toISOString();
  const maxEntries = Math.max(1, Number(input.maxEntries || 80) || 80);
  const existing = extractEntries(existingText).filter((item) => item.id !== entry.id);
  const entries = [entry].concat(existing).slice(0, maxEntries);
  return [
    `# ${title}`,
    "",
    `Updated: ${updatedAt}`,
    "",
    "This cleaned progress file stores task metadata, scores, feedback summaries, focus signals, next-practice signals, reward summaries, and report references. It must not store full child answers, full transcripts, full question text, answer keys, raw prompts, secrets, or push endpoints.",
    "",
    ...entries.flatMap((item) => [item.markdown, ""]),
  ].join("\n").trimEnd() + "\n";
}

function createLearningGrowthProgressRecordService(options = {}) {
  const maxEntries = Math.max(1, Number(options.maxEntries || 80) || 80);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const readText = typeof options.readText === "function"
    ? options.readText
    : (filePath) => {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch (_) {
        return "";
      }
    };
  const writeText = typeof options.writeText === "function"
    ? options.writeText
    : (filePath, text) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, text, "utf8");
      return filePath;
    };

  function writeProgressFile(filePath, title, entry) {
    const markdown = upsertProgressMarkdown(readText(filePath), entry, {
      title,
      updatedAt: nowIso(),
      maxEntries,
    });
    writeText(filePath, markdown);
    return filePath;
  }

  function recordEvaluation(input = {}) {
    const learnerRoot = cleanString(input.learnerRoot);
    const programDir = cleanString(input.programDir);
    if (!learnerRoot || !programDir) return null;
    const entry = progressEntry(Object.assign({}, input, { nowIso: nowIso() }));
    const rootPath = path.join(learnerRoot, ".hermes-cleaned", "learning-growth-progress.md");
    const programPath = path.join(programDir, ".hermes-cleaned", "progress.md");
    return {
      entryId: entry.id,
      rootProgressPath: writeProgressFile(rootPath, "Fanfan Growth cumulative progress signals", entry),
      programProgressPath: writeProgressFile(programPath, "Growth program progress signals", entry),
    };
  }

  return {
    progressEntry,
    recordEvaluation,
    upsertProgressMarkdown,
  };
}

module.exports = {
  createLearningGrowthProgressRecordService,
  progressEntry,
  upsertProgressMarkdown,
};
