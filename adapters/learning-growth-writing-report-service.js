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

function sentenceFeedbackLines(items = []) {
  const list = asArray(items)
    .filter((item) => item && typeof item === "object")
    .slice(0, 5);
  if (!list.length) return ["- No sentence-level model feedback was generated."];
  return list.flatMap((item, index) => {
    const heading = cleanString(item.evidence)
      ? `${index + 1}. Evidence: ${item.evidence}`
      : `${index + 1}. Sentence guidance`;
    return [
      `- ${heading}`,
      cleanString(item.issue) ? `  - Issue: ${item.issue}` : "",
      cleanString(item.whyItMatters) ? `  - Why it matters: ${item.whyItMatters}` : "",
      cleanString(item.fix) ? `  - Fix: ${item.fix}` : "",
      cleanString(item.example) ? `  - Example: ${item.example}` : "",
    ].filter(Boolean);
  });
}

function reportStageLabel(evaluation = {}) {
  const stage = cleanString(evaluation.stage || evaluation.submissionStage || "");
  if (stage === "final") return "\u6700\u7ec8\u63d0\u4ea4";
  return "\u8349\u7a3f\u6279\u6539";
}

function reportConclusionTitle(evaluation = {}) {
  const stage = cleanString(evaluation.stage);
  if (stage === "final" && evaluation.passed) return "\u6700\u7ec8\u7ed3\u8bba";
  if (stage === "final") return "\u518d\u6539\u7ed3\u8bba";
  return "\u9996\u7a3f\u6279\u6539\u7ed3\u8bba";
}

function rewardLine(evaluation = {}, settlement = null) {
  const eligible = Boolean(evaluation.reward?.eligible);
  const coins = Number(evaluation.reward?.coinAmount || 0) || 0;
  const status = cleanString(settlement?.status || evaluation.reward?.status || "");
  if (!eligible) return "\u672c\u9636\u6bb5\u4e0d\u7ed3\u7b97\u91d1\u5e01\uff1b\u9700\u5b8c\u6210\u6700\u7ec8\u6539\u5199\u5e76\u8fbe\u5230\u901a\u8fc7\u7ebf\u3002";
  if (status === "settled") return `\u670d\u52a1\u5c42\u5df2\u7ed3\u7b97 ${coins} \u91d1\u5e01\u3002`;
  return `\u672c\u5361\u8fbe\u5230\u91d1\u5e01\u6761\u4ef6\uff0c\u9884\u8ba1 ${coins} \u91d1\u5e01\uff1b\u6700\u7ec8\u72b6\u6001\u4ee5\u670d\u52a1\u5c42\u6d41\u6c34\u4e3a\u51c6\u3002`;
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
  const settlement = input.settlement || null;
  const feedback = evaluation.feedbackSections || {};
  const title = cardTitle(card, input.cardId || "Growth writing card");
  const finalStage = cleanString(evaluation.stage) === "final";
  const passed = Boolean(evaluation.passed);
  const lines = [
    `# ${title} - \u82f1\u8bed\u5199\u4f5c\u6279\u6539\u62a5\u544a`,
    "",
    `- Card: ${cleanString(input.cardId) || cardId(card)}`,
    `- Stage: ${reportStageLabel(evaluation)}`,
    `- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    `- Status: ${cleanString(evaluation.status || "pending")}`,
    `- Evaluated at: ${cleanString(evaluation.evaluatedAt)}`,
    "",
    `## ${reportConclusionTitle(evaluation)}`,
    "",
    cleanString(evaluation.summary) || "\u5df2\u751f\u6210\u5199\u4f5c\u6279\u6539\u7ed3\u679c\u3002",
    "",
    finalStage ? "## \u6700\u7ec8\u5224\u5b9a" : "## \u6539\u5199\u4efb\u52a1",
    "",
    finalStage
      ? (passed
        ? "\u672c\u5361\u5df2\u8fbe\u5230\u901a\u8fc7\u7ebf\u3002\u8bf7\u628a\u672c\u6b21\u6700\u6709\u6548\u7684\u6539\u5199\u65b9\u6cd5\u7559\u5230\u4e0b\u4e00\u5f20\u5199\u4f5c\u5361\u7ee7\u7eed\u4f7f\u7528\u3002"
        : "\u672c\u5361\u8fd8\u672a\u8fbe\u5230\u901a\u8fc7\u7ebf\u3002\u8bf7\u6309\u4e0b\u65b9\u4fee\u6539\u8981\u6c42\u518d\u63d0\u4ea4\u4e00\u7248\u3002")
      : "\u8bf7\u628a\u8fd9\u4efd\u62a5\u544a\u5f53\u4f5c\u6539\u5199\u6e05\u5355\uff0c\u4e0d\u8981\u76f4\u63a5\u70b9\u5b8c\u6210\u3002\u6539\u5199\u7248\u9700\u8981\u8ba9\u4fee\u6539\u75d5\u8ff9\u53ef\u89c1\uff0c\u5e76\u8865\u4e00\u53e5\u590d\u76d8\u3002",
    "",
    "## \u4f18\u70b9",
    "",
    ...markdownList(feedback.strengths, "\u672c\u6b21\u4f5c\u7b54\u5df2\u4fdd\u5b58\uff0c\u540e\u7eed\u7248\u672c\u5c06\u7ee7\u7eed\u7d2f\u79ef\u4f18\u70b9\u8bc1\u636e\u3002"),
    "",
    "## \u9700\u8981\u4fee\u6539\u7684\u5730\u65b9",
    "",
    ...markdownList(feedback.focusAreas || evaluation.revisionRequirements, "\u6682\u65e0\u5fc5\u987b\u4fee\u6539\u9879\uff0c\u4f46\u4ecd\u5efa\u8bae\u518d\u505a\u4e00\u8f6e\u8868\u8fbe\u4f18\u5316\u3002"),
    "",
    "## AI \u53e5\u5b50\u7ea7\u6307\u5bfc",
    "",
    ...sentenceFeedbackLines(feedback.sentenceFeedback),
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
    cleanString(feedback.nextPractice) || nextStepText(evaluation),
    cleanString(feedback.parentNote) ? `\nParent note: ${cleanString(feedback.parentNote)}` : "",
    "",
    "## \u91d1\u5e01\u7ed3\u7b97",
    "",
    rewardLine(evaluation, settlement),
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
