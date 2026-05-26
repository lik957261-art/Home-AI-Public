"use strict";

const CHINESE_DIGITS = Object.freeze({
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e24": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9,
});

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function sequenceIndexForTask(task = {}, fallbackIndex = 0) {
  const values = [
    task.sequenceIndex,
    task.learningGrowthJitGeneration?.sequenceIndex,
    task.taskModel?.jitGeneration?.sequenceIndex,
    task.nativeState?.sequenceIndex,
    task.kanbanCaseCardIndex,
    task.caseCardIndex,
  ];
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return Math.max(1, Number(fallbackIndex || 0) + 1);
}

function sequenceModeForTask(task = {}) {
  return cleanString(
    task.sequenceMode
      || task.learningGrowthSequenceMode
      || task.learningGrowthJitGeneration?.sequenceMode
      || task.taskModel?.sequenceMode
      || task.taskModel?.jitGeneration?.sequenceMode,
  ).toLowerCase();
}

function isEvergreenSequenceTask(task = {}) {
  return sequenceModeForTask(task).includes("evergreen")
    || cleanString(task.sequenceGroupId || task.sequence_group_id).toLowerCase().startsWith("evergreen:");
}

function parseChineseInteger(value = "") {
  const text = cleanString(value, 12);
  if (!text) return 0;
  if (Object.prototype.hasOwnProperty.call(CHINESE_DIGITS, text)) return CHINESE_DIGITS[text];
  if (text === "\u5341") return 10;
  const match = text.match(/^([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])?\u5341([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])?$/u);
  if (!match) return 0;
  const tens = match[1] ? CHINESE_DIGITS[match[1]] : 1;
  const ones = match[2] ? CHINESE_DIGITS[match[2]] : 0;
  return tens * 10 + ones;
}

function ordinalTokenValue(value = "") {
  const text = cleanString(value, 20);
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  return parseChineseInteger(text);
}

function stripDecoratedCardOrdinalSuffix(title = "") {
  let text = cleanString(title, 180);
  const ordinal = "(\\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,4})";
  const patterns = [
    new RegExp(`\\s*[\\uff08(]\\s*\\u7b2c\\s*${ordinal}\\s*\\u5f20(?:\\u5361|\\u4efb\\u52a1)?\\s*[\\uff09)]\\s*$`, "u"),
    new RegExp(`\\s*[\\u00b7\\-_:|/]\\s*\\u7b2c\\s*${ordinal}\\s*\\u5f20(?:\\u5361|\\u4efb\\u52a1)?\\s*$`, "u"),
    new RegExp(`\\s+\\u7b2c\\s*${ordinal}\\s*\\u5f20(?:\\u5361|\\u4efb\\u52a1)?\\s*$`, "u"),
  ];
  for (const pattern of patterns) {
    const next = text.replace(pattern, "").trim();
    if (next !== text) text = next;
  }
  return text;
}

function stripPlainOrdinalSuffix(title = "", sequenceIndex = 1) {
  const text = cleanString(title, 180);
  const numeric = text.match(/^(.*?)(?:[\s_#-]+)(0*\d{1,3})$/);
  if (numeric) {
    const value = Number(numeric[2]);
    if (value === sequenceIndex || value === 1 || /^0+\d+$/.test(numeric[2])) {
      return cleanString(numeric[1], 180) || text;
    }
  }
  const chinese = text.match(/^(.*?)(?:[\s_#-]+)([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,4})$/u);
  if (chinese) {
    const value = ordinalTokenValue(chinese[2]);
    if (value === sequenceIndex || value === 1) return cleanString(chinese[1], 180) || text;
  }
  return text;
}

function evergreenBaseTitle(title = "", sequenceIndex = 1) {
  const decorated = stripDecoratedCardOrdinalSuffix(title);
  const plain = stripPlainOrdinalSuffix(decorated, sequenceIndex);
  return cleanString(plain, 180) || cleanString(title, 180);
}

function displayTitleForLearningGrowthTask(task = {}, fallbackIndex = 0) {
  const title = cleanString(task.title, 180) || cleanString(task.taskCardId || task.id, 180);
  if (!isEvergreenSequenceTask(task)) return title;
  const sequenceIndex = sequenceIndexForTask(task, fallbackIndex);
  const baseTitle = evergreenBaseTitle(title, sequenceIndex);
  return `${baseTitle} \u00b7 \u7b2c${sequenceIndex}\u5f20\u5361`;
}

function storageTitleForEvergreenClone(task = {}, sequenceIndex = 1) {
  const title = cleanString(task.title, 180) || cleanString(task.taskCardId || task.id, 180);
  return isEvergreenSequenceTask(task) ? evergreenBaseTitle(title, sequenceIndex) : title;
}

module.exports = {
  displayTitleForLearningGrowthTask,
  evergreenBaseTitle,
  isEvergreenSequenceTask,
  sequenceIndexForTask,
  sequenceModeForTask,
  storageTitleForEvergreenClone,
};
