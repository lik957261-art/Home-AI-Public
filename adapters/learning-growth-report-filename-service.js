"use strict";

const fs = require("node:fs");

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeFileStem(value, fallback = "learning-growth") {
  const stem = cleanString(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return stem || fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localTimestamp(nowMs) {
  const date = new Date(Number(nowMs) || Date.now());
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    "-",
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join("");
}

function reportFileCount(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .length;
  } catch (_) {
    return 0;
  }
}

function activityLabel(activityType) {
  const value = cleanString(activityType).toLowerCase();
  if (value === "writing") return "\u82f1\u8bed\u5199\u4f5c";
  if (value === "rewriting") return "\u6539\u5199";
  if (value === "reading") return "\u9605\u8bfb";
  if (value === "listening") return "\u542c\u529b";
  if (value === "speaking") return "\u53e3\u8bed";
  if (value === "pronunciation") return "\u53d1\u97f3";
  if (value === "vocabulary") return "\u8bcd\u6c47";
  if (value === "grammar") return "\u8bed\u6cd5";
  if (value === "presentation") return "\u6f14\u8bb2";
  if (value === "weekly_challenge") return "\u5468\u6311\u6218";
  return safeFileStem(value || "\u5b66\u4e60\u4efb\u52a1");
}

function attemptLabel(attemptIndex, evaluation = {}) {
  const index = Math.max(1, Number(attemptIndex || 1) || 1);
  const passed = Boolean(evaluation.passed) || cleanString(evaluation.nextStep) === "completed";
  if (passed) return index === 1 ? "\u521d\u6b21\u63d0\u4ea4\u6700\u7ec8\u8bc4\u4ef7" : `\u7b2c${index}\u6b21\u63d0\u4ea4\u6700\u7ec8\u8bc4\u4ef7`;
  if (index === 1) return "\u521d\u6b21\u63d0\u4ea4\u6279\u6539";
  if (index === 2) return "\u518d\u6b21\u63d0\u4ea4\u6279\u6539";
  return `\u7b2c${index}\u6b21\u63d0\u4ea4\u6279\u6539`;
}

function buildLearningGrowthReportFilename(options = {}) {
  const attemptIndex = Number(options.attemptIndex || 0) || reportFileCount(options.directory) + 1;
  const prefix = pad2(attemptIndex);
  const title = safeFileStem(options.cardTitle || "", "");
  const titlePart = title ? `-${title}` : "";
  const filename = [
    prefix,
    safeFileStem(attemptLabel(attemptIndex, options.evaluation)),
    safeFileStem(activityLabel(options.activityType)),
  ].join("-");
  return `${filename}${titlePart}-${localTimestamp(options.nowMs)}.md`;
}

module.exports = {
  activityLabel,
  attemptLabel,
  buildLearningGrowthReportFilename,
  safeFileStem,
};
