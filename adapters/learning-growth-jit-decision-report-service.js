"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { safeFileStem } = require("./learning-growth-report-filename-service");

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max).trim() : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function digestText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function stableArtifactId(taskCardId, generatedAt) {
  return `lart_${digestText(`${cleanString(taskCardId)}:${cleanString(generatedAt)}:jit-decision-report`).slice(0, 18)}`;
}

function markdownList(items = [], fallback = "Not recorded.") {
  const list = asArray(items).map((item) => cleanString(item, 240)).filter(Boolean);
  return (list.length ? list : [fallback]).map((item) => `- ${item}`);
}

function reportDirectory(input = {}) {
  if (typeof input.reportDirectory === "function") {
    return input.reportDirectory(input.workspaceId, input.taskCardId, input.task || {});
  }
  const root = path.resolve(input.outputRoot || process.cwd());
  const dir = path.join(root, "learning-growth-jit-decisions", safeFileStem(input.workspaceId || "workspace"), safeFileStem(input.taskCardId || "task"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTextFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

function taskPreview(task = {}) {
  return cleanString(
    task.learnerInstruction
      || task.instruction
      || task.taskModel?.learnerInstruction
      || task.summary
      || task.title,
    700,
  );
}

function buildLearningGrowthJitDecisionMarkdown(input = {}) {
  const task = input.task || {};
  const program = input.program || {};
  const generation = task.learningGrowthJitGeneration || task.taskModel?.jitGeneration || input.jitGeneration || {};
  const title = cleanString(task.title || "Growth JIT task");
  const taskCardId = cleanString(task.taskCardId || input.taskCardId);
  const previousTaskCardId = cleanString(task.learningGrowthGeneratedAfterTaskCardId || task.generatedAfterTaskCardId || input.previousTaskCardId);
  const lines = [
    `# ${title} - AI 开卡决策说明`,
    "",
    "## 生成结果",
    "",
    `- Task card: ${taskCardId || "Not recorded"}`,
    `- Previous task: ${previousTaskCardId || "Not recorded"}`,
    `- Sequence group: ${cleanString(task.sequenceGroupId || input.sequenceGroupId) || "Not recorded"}`,
    `- Sequence index: ${Number(task.sequenceIndex || generation.sequenceIndex || 0) || 0}`,
    `- Generated at: ${cleanString(task.generatedAt || generation.generatedAt || input.generatedAt) || "Not recorded"}`,
    `- Model status: ${cleanString(generation.modelStatus || input.modelStatus) || "Not recorded"}`,
    `- Model: ${cleanString(generation.model || input.model) || "Not recorded"}`,
    `- Mode: ${cleanString(generation.mode) || "summary_only_jit"}`,
    `- Difficulty band: ${cleanString(generation.difficultyBand) || "steady"}`,
    "",
    "## 模型输出摘要",
    "",
    cleanString(generation.teacherRationale, 600) || "No teacher rationale was returned; the card used validated summary-only fallback fields.",
    "",
    "## 使用的数据依据",
    "",
    ...markdownList(generation.sourceRefs, "No source refs were selected."),
    "",
    "## 近期学习信号",
    "",
    ...markdownList(generation.focusSignals, "No focus signals were selected."),
    "",
    "## 本卡训练目标",
    "",
    ...markdownList(generation.skillTargets || task.skillIds, "Use the task template's declared skill target."),
    "",
    "## 交付要求",
    "",
    ...markdownList(task.deliverables || task.taskModel?.deliverables, "Complete the learner-facing task deliverable."),
    "",
    "## 通过标准",
    "",
    ...markdownList(task.acceptance || task.taskModel?.acceptance, "Meet the task acceptance criteria."),
    "",
    "## 任务正文预览",
    "",
    taskPreview(task) || "Task instruction is stored on the task card.",
    "",
    "## 目的说明",
    "",
    cleanString(program.goalSummary, 700) || "Continue the active Growth learning sequence using recent summary-only learning state.",
    "",
    "## 隐私边界",
    "",
    "- This report stores structured decision fields only.",
    "- It does not store raw prompts, raw model responses, full learner submissions, full transcripts, answer keys, endpoints, local paths, or secrets.",
    "",
  ];
  return lines.join("\n");
}

function createLearningGrowthJitDecisionReportService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const outputRoot = options.outputRoot || options.dataDir || process.cwd();
  const reportDirectoryForCard = typeof options.reportDirectoryForCard === "function" ? options.reportDirectoryForCard : null;
  const writeText = typeof options.writeTextFile === "function" ? options.writeTextFile : writeTextFile;

  function writeReport(input = {}) {
    const task = input.task || {};
    const workspaceId = cleanString(input.workspaceId || task.workspaceId || "owner");
    const taskCardId = cleanString(input.taskCardId || task.taskCardId);
    if (!taskCardId) return null;
    const generatedAt = cleanString(task.generatedAt || task.learningGrowthJitGeneration?.generatedAt || input.generatedAt) || nowIso();
    const markdown = buildLearningGrowthJitDecisionMarkdown(Object.assign({}, input, {
      generatedAt,
      taskCardId,
      workspaceId,
    }));
    const dir = reportDirectory({
      outputRoot,
      reportDirectory: reportDirectoryForCard,
      task,
      taskCardId,
      workspaceId,
    });
    const filename = `${safeFileStem(`${generatedAt.slice(0, 10)}-${taskCardId}-ai-decision`, "ai-decision")}.md`;
    const filePath = path.join(dir, filename);
    writeText(filePath, markdown);
    let size = Buffer.byteLength(markdown, "utf8");
    try {
      size = fs.statSync(filePath).size;
    } catch (_) {}
    return {
      artifactId: stableArtifactId(taskCardId, generatedAt),
      path: filePath,
      name: filename,
      title: "AI 开卡决策说明",
      mime: "text/markdown; charset=utf-8",
      size,
      summary: `AI JIT decision report for ${taskCardId}.`,
      createdAt: generatedAt,
    };
  }

  return {
    buildLearningGrowthJitDecisionMarkdown,
    writeReport,
  };
}

module.exports = {
  buildLearningGrowthJitDecisionMarkdown,
  createLearningGrowthJitDecisionReportService,
};
