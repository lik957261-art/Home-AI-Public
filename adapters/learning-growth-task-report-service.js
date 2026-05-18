"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildWritingFeedbackMarkdown,
  createLearningGrowthWritingReportService,
} = require("./learning-growth-writing-report-service");
const {
  activityLabel,
} = require("./learning-growth-task-evaluation-service");
const {
  inferLearningTaskModelFromCard,
} = require("./learning-task-model-service");

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
    .slice(0, 72) || "learning-growth-task";
}

function cardId(card = {}, fallback = "") {
  return cleanString(card.id || card.todoId || card.todo_id || fallback);
}

function cardTitle(card = {}, fallback = "") {
  return cleanString(card.content || card.title || card.name || fallback || cardId(card, "Growth learning task"));
}

function cardCaseId(card = {}) {
  return cleanString(card.kanbanCaseId || card.kanban_case_id || "learning-growth");
}

function markdownList(items, fallback) {
  const list = asArray(items).map(cleanString).filter(Boolean);
  if (!list.length) return [`- ${fallback}`];
  return list.map((item) => `- ${item}`);
}

function compactActivityLabel(activityType) {
  const label = activityLabel(activityType);
  if (label === "Learning task") return "Growth learning task";
  return label;
}

function reportStageLabel(evaluation = {}) {
  const stage = cleanString(evaluation.stage || evaluation.submissionStage || "");
  if (stage === "final") return "\u6700\u7ec8\u63d0\u4ea4";
  return "\u9996\u6b21\u4f5c\u7b54\u53cd\u9988";
}

function reportConclusionTitle(evaluation = {}) {
  const stage = cleanString(evaluation.stage);
  if (stage === "final" && evaluation.passed) return "\u6700\u7ec8\u7ed3\u8bba";
  if (stage === "final") return "\u7ee7\u7eed\u4fee\u590d";
  return "\u9996\u6b21\u53cd\u9988\u7ed3\u8bba";
}

function rewardLine(evaluation = {}, settlement = null) {
  const eligible = Boolean(evaluation.reward?.eligible);
  const coins = Number(evaluation.reward?.coinAmount || 0) || 0;
  const maxCoins = Number(evaluation.reward?.maxCoinAmount || evaluation.reward?.maxCoins || 100) || 100;
  const status = cleanString(settlement?.status || evaluation.reward?.status || "");
  if (!eligible) return `\u672c\u9636\u6bb5\u4e0d\u7ed3\u7b97\u91d1\u5e01\uff1b\u672c\u5361\u4e0a\u9650 ${maxCoins} \u91d1\u5e01\uff0c\u9700\u5b8c\u6210\u4fee\u6539\u7248\u5e76\u901a\u8fc7\u8bc4\u4f30\u3002`;
  if (status === "settled") return `\u670d\u52a1\u5c42\u5df2\u7ed3\u7b97 ${coins} \u91d1\u5e01\uff0c\u672c\u5361\u4e0a\u9650 ${maxCoins} \u91d1\u5e01\u3002`;
  return `\u672c\u5361\u8fbe\u5230\u91d1\u5e01\u6761\u4ef6\uff0c\u9884\u8ba1 ${coins} \u91d1\u5e01\uff1b\u672c\u5361\u4e0a\u9650 ${maxCoins} \u91d1\u5e01\uff0c\u6700\u7ec8\u4ee5\u670d\u52a1\u5c42\u6d41\u6c34\u4e3a\u51c6\u3002`;
}

function sentenceFeedbackLines(items = []) {
  const list = asArray(items)
    .filter((item) => item && typeof item === "object")
    .slice(0, 6);
  if (!list.length) return ["- \u672c\u6b21\u6ca1\u6709\u53e5\u5b50\u7ea7\u4fee\u6539\uff1b\u8bf7\u5148\u6839\u636e\u91cd\u70b9\u6e05\u5355\u8865\u5145\u4e00\u8f6e\u4fee\u6539\u3002"];
  return list.flatMap((item, index) => {
    const heading = cleanString(item.evidence)
      ? `${index + 1}. Evidence: ${item.evidence}`
      : `${index + 1}. Feedback`;
    return [
      `- ${heading}`,
      cleanString(item.issue) ? `  - Issue: ${item.issue}` : "",
      cleanString(item.whyItMatters) ? `  - Why it matters: ${item.whyItMatters}` : "",
      cleanString(item.fix) ? `  - Fix: ${item.fix}` : "",
      cleanString(item.example) ? `  - Example: ${item.example}` : "",
    ].filter(Boolean);
  });
}

function criterionFeedbackLines(items = []) {
  const list = asArray(items)
    .filter((item) => item && typeof item === "object")
    .slice(0, 6);
  if (!list.length) return ["- \u6682\u65e0\u7ef4\u5ea6\u7ea7\u8bc4\u8bed\uff1b\u8bf7\u4ee5\u4fee\u6539\u6e05\u5355\u4e3a\u51c6\u3002"];
  return list.flatMap((item, index) => {
    const dimension = cleanString(item.dimension) || `Criterion ${index + 1}`;
    return [
      `- ${dimension}`,
      cleanString(item.observation) ? `  - Observation: ${item.observation}` : "",
      cleanString(item.action) ? `  - Action: ${item.action}` : "",
    ].filter(Boolean);
  });
}

function buildLearningGrowthTaskFeedbackMarkdown(input = {}) {
  const card = input.card || {};
  const evaluation = input.evaluation || {};
  const model = inferLearningTaskModelFromCard(card, input);
  const activityType = cleanString(evaluation.activityType || model.activityType || "practice");
  if (activityType === "writing") return buildWritingFeedbackMarkdown(input);
  const settlement = input.settlement || null;
  const feedback = evaluation.feedbackSections || {};
  const title = cardTitle(card, input.cardId || "Growth learning task");
  const label = compactActivityLabel(activityType);
  const lines = [
    `# ${title} - ${label} \u53cd\u9988\u62a5\u544a`,
    "",
    `- Card: ${cleanString(input.cardId) || cardId(card)}`,
    `- Activity: ${label}`,
    `- Stage: ${reportStageLabel(evaluation)}`,
    `- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    `- Status: ${cleanString(evaluation.status || "pending")}`,
    `- Evaluated at: ${cleanString(evaluation.evaluatedAt)}`,
    "",
    `## ${reportConclusionTitle(evaluation)}`,
    "",
    cleanString(evaluation.summary) || "\u5df2\u751f\u6210\u5b66\u4e60\u4efb\u52a1\u53cd\u9988\u3002",
    "",
    "## \u672c\u5361\u76ee\u6807",
    "",
    cleanString(model.learnerInstruction || card.kanbanCaseCardGoal || card.description) || "\u672c\u5361\u6309\u6210\u957f\u4efb\u52a1\u6a21\u578b\u6267\u884c\u3002",
    "",
    "## \u505a\u5f97\u597d\u7684\u5730\u65b9",
    "",
    ...markdownList(feedback.strengths, "\u5df2\u8bb0\u5f55\u4e00\u6b21\u6709\u6548\u5c1d\u8bd5\uff0c\u53ef\u5728\u4e0b\u4e00\u7248\u7ee7\u7eed\u5b8c\u5584\u3002"),
    "",
    "## \u9700\u8981\u4fee\u590d\u7684\u5730\u65b9",
    "",
    ...markdownList(feedback.focusAreas || evaluation.revisionRequirements, "\u6682\u65e0\u5fc5\u987b\u4fee\u590d\u9879\uff0c\u4e0b\u4e00\u5f20\u5361\u7ee7\u7eed\u7d2f\u79ef\u3002"),
    "",
    "## \u6279\u6539\u7ef4\u5ea6",
    "",
    ...criterionFeedbackLines(feedback.criterionFeedback),
    "",
    "## AI \u5177\u4f53\u6307\u5bfc",
    "",
    ...sentenceFeedbackLines(feedback.sentenceFeedback),
    "",
    "## \u4fee\u6539\u6e05\u5355",
    "",
    ...markdownList(feedback.rewriteChecklist || evaluation.revisionRequirements, "\u8865\u5145\u4e00\u4e2a\u5177\u4f53\u4f8b\u5b50\u3001\u4e00\u4e2a\u4fee\u590d\u53e5\u548c\u4e00\u53e5\u590d\u76d8\u3002"),
    "",
    "## \u590d\u76d8\u95ee\u9898",
    "",
    ...markdownList(feedback.reflectionPrompts, "\u6211\u8fd9\u6b21\u54ea\u91cc\u4fee\u6539\u4e86\uff1f\u4e3a\u4ec0\u4e48\u8fd9\u6837\u6539\uff1f"),
    "",
    "## \u4e0b\u4e00\u6b65",
    "",
    cleanString(feedback.nextPractice) || (evaluation.nextStep === "completed"
      ? "\u672c\u5361\u5df2\u5b8c\u6210\uff0c\u628a\u6700\u6709\u6548\u7684\u4fee\u590d\u65b9\u6cd5\u5e26\u5230\u4e0b\u4e00\u5f20\u5361\u3002"
      : "\u6309\u4fee\u6539\u6e05\u5355\u518d\u63d0\u4ea4\u4e00\u7248\uff0c\u5e76\u8865\u4e00\u53e5\u590d\u76d8\u3002"),
    "",
    "## \u91d1\u5e01\u7ed3\u7b97",
    "",
    rewardLine(evaluation, settlement),
    "",
    "## \u8bc4\u4f30\u4f9d\u636e",
    "",
    `- Words: ${Number(evaluation.wordCount || 0)}`,
    `- Lines: ${Number(evaluation.lineCount || 0)}`,
    `- Verification: ${cleanString(evaluation.verificationMethod || "deterministic_growth_task_template")}`,
    "",
    "## \u9690\u79c1\u4e0e\u8bb0\u5f55",
    "",
    "\u672c\u62a5\u544a\u53ea\u4fdd\u7559\u4efb\u52a1\u7ed3\u8bba\u3001\u4fee\u590d\u8981\u6c42\u3001\u6307\u6807\u548c\u4ea4\u4ed8\u5f15\u7528\uff0c\u4e0d\u590d\u5236\u5b66\u751f\u5b8c\u6574\u539f\u6587\u3002",
    "",
  ];
  return lines.join("\n");
}

function createLearningGrowthTaskReportService(options = {}) {
  const artifactService = options.artifactService || {};
  const writingReportService = options.writingReportService || createLearningGrowthWritingReportService(options);
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
    const card = input.card || {};
    const evaluation = input.evaluation || {};
    const model = inferLearningTaskModelFromCard(card, input);
    const activityType = cleanString(evaluation.activityType || model.activityType || "practice");
    if (activityType === "writing" && writingReportService && typeof writingReportService.writeReport === "function") {
      return writingReportService.writeReport(input);
    }
    const workspaceId = cleanString(input.workspaceId || "owner") || "owner";
    const cardIdValue = cleanString(input.cardId) || cardId(card, "card");
    const markdown = buildLearningGrowthTaskFeedbackMarkdown(Object.assign({}, input, { cardId: cardIdValue }));
    const filename = `${nowMs()}-${safeFileStem(cardTitle(card, cardIdValue))}-${safeFileStem(activityType)}-feedback.md`;
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
    buildLearningGrowthTaskFeedbackMarkdown,
    writeReport,
  };
}

module.exports = {
  buildLearningGrowthTaskFeedbackMarkdown,
  createLearningGrowthTaskReportService,
};
