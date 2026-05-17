"use strict";

const fs = require("node:fs");
const path = require("node:path");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeFileStem(value) {
  return cleanString(value)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "learning-growth-writing";
}

function cardId(card = {}, fallback = "") {
  return cleanString(card.id || card.todoId || card.todo_id || fallback);
}

function cardTitle(card = {}, fallback = "") {
  return cleanString(card.content || card.title || card.name || fallback || cardId(card, "Growth writing card"));
}

function cardCaseId(card = {}) {
  return cleanString(card.kanbanCaseId || card.kanban_case_id || "learning-growth");
}

function markdownList(items, fallback) {
  const list = asArray(items).map(cleanString).filter(Boolean);
  if (!list.length) return [`- ${fallback}`];
  return list.map((item) => `- ${item}`);
}

function reportStageLabel(evaluation = {}) {
  const stage = cleanString(evaluation.stage || evaluation.submissionStage || "");
  if (stage === "final") return "\u6700\u7ec8\u63d0\u4ea4";
  return "\u8349\u7a3f\u6279\u6539";
}

function nextStepText(evaluation = {}) {
  const next = cleanString(evaluation.nextStep);
  if (next === "completed") return "\u672c\u5361\u7247\u5df2\u5b8c\u6210\uff0c\u91d1\u5e01\u7ed3\u7b97\u4ee5\u670d\u52a1\u5c42\u8bb0\u5f55\u4e3a\u51c6\u3002";
  if (next === "revise_and_resubmit") return "\u6309\u4fee\u6539\u6e05\u5355\u518d\u6539\u5199\u4e00\u7248\uff0c\u5e76\u8865\u4e00\u53e5\u590d\u76d8\u540e\u518d\u63d0\u4ea4\u3002";
  if (next === "rewrite_and_reflect") return "\u5148\u6839\u636e\u6279\u6539\u8981\u6c42\u6539\u5199\uff0c\u518d\u5199\u4e00\u53e5\u201c\u6211\u6539\u4e86\u4ec0\u4e48\uff0c\u4e3a\u4ec0\u4e48\u201d\u540e\u63d0\u4ea4\u3002";
  return "\u7b49\u5f85\u4e0b\u4e00\u6b65\u5b66\u4e60\u6307\u5f15\u3002";
}

function buildWritingFeedbackMarkdown(input = {}) {
  const card = input.card || {};
  const evaluation = input.evaluation || {};
  const feedback = evaluation.feedbackSections || {};
  const title = cardTitle(card, input.cardId || "Growth writing card");
  const lines = [
    `# ${title} - \u82f1\u8bed\u5199\u4f5c\u6279\u6539\u62a5\u544a`,
    "",
    `- Card: ${cleanString(input.cardId) || cardId(card)}`,
    `- Stage: ${reportStageLabel(evaluation)}`,
    `- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    `- Status: ${cleanString(evaluation.status || "pending")}`,
    `- Evaluated at: ${cleanString(evaluation.evaluatedAt)}`,
    "",
    "## \u6279\u6539\u7ed3\u8bba",
    "",
    cleanString(evaluation.summary) || "\u5df2\u751f\u6210\u5199\u4f5c\u6279\u6539\u7ed3\u679c\u3002",
    "",
    "## \u4f18\u70b9",
    "",
    ...markdownList(feedback.strengths, "\u672c\u6b21\u4f5c\u7b54\u5df2\u4fdd\u5b58\uff0c\u540e\u7eed\u7248\u672c\u5c06\u7ee7\u7eed\u7d2f\u79ef\u4f18\u70b9\u8bc1\u636e\u3002"),
    "",
    "## \u9700\u8981\u4fee\u6539\u7684\u5730\u65b9",
    "",
    ...markdownList(feedback.focusAreas || evaluation.revisionRequirements, "\u6682\u65e0\u5fc5\u987b\u4fee\u6539\u9879\uff0c\u4f46\u4ecd\u5efa\u8bae\u518d\u505a\u4e00\u8f6e\u8868\u8fbe\u4f18\u5316\u3002"),
    "",
    "## \u6539\u5199\u6e05\u5355",
    "",
    ...markdownList(feedback.rewriteChecklist || evaluation.revisionRequirements, "\u68c0\u67e5\u4efb\u52a1\u8d34\u5408\u5ea6\u3001\u53e5\u5b50\u5b8c\u6574\u5ea6\u548c\u7ed3\u5c3e\u6807\u70b9\u3002"),
    "",
    "## \u590d\u76d8\u95ee\u9898",
    "",
    ...markdownList(feedback.reflectionPrompts, "\u6211\u8fd9\u6b21\u6539\u4e86\u54ea\u4e00\u53e5\uff1f\u4e3a\u4ec0\u4e48\u8fd9\u6837\u6539\uff1f"),
    "",
    "## \u4e0b\u4e00\u6b65",
    "",
    nextStepText(evaluation),
    "",
    "## \u8bc4\u5206\u4f9d\u636e",
    "",
    `- Words: ${Number(evaluation.wordCount || 0)}`,
    `- Sentences: ${Number(evaluation.sentenceCount || 0)}`,
    `- Target words: ${Number(evaluation.targetMinWords || 0)}-${Number(evaluation.targetMaxWords || 0)}`,
    `- Verification: ${cleanString(evaluation.verificationMethod || "deterministic_template")}`,
    "",
    "## \u9690\u79c1\u4e0e\u8bb0\u5f55",
    "",
    "\u672c\u62a5\u544a\u53ea\u8bb0\u5f55\u6279\u6539\u7ed3\u8bba\u3001\u4fee\u6539\u8981\u6c42\u548c\u5fc5\u8981\u6307\u6807\uff0c\u4e0d\u5728\u62a5\u544a\u4e2d\u590d\u5236\u5b66\u751f\u5b8c\u6574\u539f\u6587\u3002",
    "",
  ];
  return lines.join("\n");
}

function createLearningGrowthWritingReportService(options = {}) {
  const artifactService = options.artifactService || {};
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const writeTextFile = typeof options.writeTextFile === "function"
    ? options.writeTextFile
    : (filePath, text) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, text, "utf8");
      return filePath;
    };

  function reportDirectory(workspaceId, cardIdValue, card = {}) {
    if (typeof options.reportDirectory === "function") return options.reportDirectory(workspaceId, cardIdValue, card);
    if (typeof artifactService.caseDeliverableDirectory === "function") {
      return artifactService.caseDeliverableDirectory(workspaceId || "owner", cardCaseId(card), cardIdValue);
    }
    const dir = path.join(process.cwd(), "kanban-study-artifacts", safeFileStem(workspaceId || "owner"), safeFileStem(cardCaseId(card)), safeFileStem(cardIdValue || "card"));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function writeReport(input = {}) {
    const workspaceId = cleanString(input.workspaceId || "owner") || "owner";
    const card = input.card || {};
    const cardIdValue = cleanString(input.cardId) || cardId(card, "card");
    const markdown = buildWritingFeedbackMarkdown(Object.assign({}, input, { cardId: cardIdValue }));
    const filename = `${nowMs()}-${safeFileStem(cardTitle(card, cardIdValue))}-writing-feedback.md`;
    const filePath = path.join(reportDirectory(workspaceId, cardIdValue, card), filename);
    writeTextFile(filePath, markdown);
    let size = Buffer.byteLength(markdown, "utf8");
    try {
      size = fs.statSync(filePath).size;
    } catch (_) {}
    return {
      path: filePath,
      name: filename,
      mime: "text/markdown; charset=utf-8",
      size,
    };
  }

  return {
    buildWritingFeedbackMarkdown,
    writeReport,
  };
}

module.exports = {
  buildWritingFeedbackMarkdown,
  createLearningGrowthWritingReportService,
};
