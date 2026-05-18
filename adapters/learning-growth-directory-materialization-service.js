"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { defaultOwnerDriveRoot } = require("./learning-source-directory-service");

const FANFAN_WORKSPACE_ID = "weixin_stephen";
const FANFAN_LEARNING_PLAN_PARTS = [
  "Hermes-\u5f90\u6b23",
  "\u51e1\u51e1",
  "\u5b66\u4e60\u8ba1\u5212",
];
const GROWTH_ROOT_SUMMARY_START = "<!-- hermes-mobile-learning-growth-summary:start -->";
const GROWTH_ROOT_SUMMARY_END = "<!-- hermes-mobile-learning-growth-summary:end -->";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeFileName(value, fallback = "item") {
  const base = cleanString(fallback) || "item";
  const name = path.basename(cleanString(value) || base).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/g, "").trim();
  return name && name !== "." && name !== ".." ? name.slice(0, 120) : base;
}

function normalizePathForCompare(value) {
  const resolved = path.resolve(String(value || "."));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertInsideRoot(root, target) {
  const rootPath = normalizePathForCompare(root);
  const targetPath = normalizePathForCompare(target);
  if (targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`)) return;
  throw new Error("Learning growth materialization target is outside the learner learning-plan root");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return "";
  }
}

function replaceSection(text, startMarker, endMarker, section) {
  const source = cleanString(text);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start >= 0 && end >= 0) {
    const before = source.slice(0, start).trimEnd();
    const after = source.slice(end + endMarker.length).trimStart();
    return [before, section.trim(), after].filter(Boolean).join("\n\n") + "\n";
  }
  return [source, section.trim()].filter(Boolean).join("\n\n") + "\n";
}

function taskSummary(task = {}, index = 0) {
  const title = cleanString(task.title || task.taskId || task.clientId || `Task ${index + 1}`);
  const type = cleanString(task.taskCardType || task.templateId || task.taskModel?.activityType || task.activityType || "");
  const date = cleanString(task.plannedDate || task.date || "");
  const minutes = Number(task.plannedMinutes || 0) || 0;
  return `- ${index + 1}. ${title}${type ? ` (${type})` : ""}${date ? `, planned ${date}` : ""}${minutes ? `, ${minutes} min` : ""}`;
}

function draftTasks(draft = {}) {
  return asArray(draft.dailyPlans).flatMap((day) => asArray(day.tasks).map((task) => Object.assign({}, task, {
    plannedDate: task.plannedDate || day.date || draft.weekStart || "",
  })));
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = card[key];
    if (value !== undefined && value !== null && cleanString(value)) return cleanString(value);
  }
  return "";
}

function learningProgramTitle(program = {}, draft = {}, card = {}) {
  return cleanString(
    program.title
    || draft.title
    || cardField(card, "learningProgramTitle", "kanbanCaseSummary", "kanban_case_summary", "content", "title")
    || "Fanfan English Growth",
  );
}

function learningCaseId(input = {}) {
  const card = input.card || {};
  return cleanString(
    input.caseId
    || input.kanbanCaseId
    || input.program?.caseId
    || input.kanbanResult?.plan?.id
    || cardField(card, "kanbanCaseId", "kanban_case_id")
    || input.program?.programId
    || "learning-growth",
  );
}

function copyFileIfReadable(source, destination) {
  const src = cleanString(source);
  if (!src) return null;
  try {
    if (!fs.statSync(src).isFile()) return null;
    ensureDir(path.dirname(destination));
    fs.copyFileSync(src, destination);
    return destination;
  } catch (_) {
    return null;
  }
}

function createLearningGrowthDirectoryMaterializationService(options = {}) {
  const ownerDriveRoot = path.resolve(options.ownerDriveRoot || defaultOwnerDriveRoot({ dataDir: options.dataDir }));
  const learnerDirectories = Object.assign({
    [FANFAN_WORKSPACE_ID]: path.join(ownerDriveRoot, ...FANFAN_LEARNING_PLAN_PARTS),
  }, options.learnerDirectories || {});
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  function learningPlanRoot(workspaceId = FANFAN_WORKSPACE_ID) {
    const configured = cleanString(learnerDirectories[cleanString(workspaceId) || FANFAN_WORKSPACE_ID]);
    const root = path.resolve(configured || path.join(ownerDriveRoot, safeFileName(workspaceId, "learner"), "\u5b66\u4e60\u8ba1\u5212"));
    assertInsideRoot(ownerDriveRoot, root);
    ensureDir(root);
    return root;
  }

  function programDirectory(input = {}) {
    const workspaceId = cleanString(input.workspaceId || input.program?.workspaceId || input.card?.workspaceId || input.card?.workspace_id) || FANFAN_WORKSPACE_ID;
    const root = learningPlanRoot(workspaceId);
    const title = learningProgramTitle(input.program || {}, input.draft || {}, input.card || {});
    const caseId = learningCaseId(input);
    const dir = path.join(root, safeFileName(`${title}-${caseId}`, "Fanfan-English-Growth"));
    assertInsideRoot(root, dir);
    ensureDir(dir);
    return dir;
  }

  function writeRootSummary(root, sectionBody) {
    const cleanedDir = ensureDir(path.join(root, ".hermes-cleaned"));
    const summaryPath = path.join(cleanedDir, "summary.md");
    const section = [
      GROWTH_ROOT_SUMMARY_START,
      "# Fanfan Growth learning data summary",
      "",
      `Updated: ${nowIso()}`,
      "",
      sectionBody,
      GROWTH_ROOT_SUMMARY_END,
      "",
    ].join("\n");
    writeText(summaryPath, replaceSection(readText(summaryPath), GROWTH_ROOT_SUMMARY_START, GROWTH_ROOT_SUMMARY_END, section));
    return summaryPath;
  }

  function writeProgramSummaries(dir, input = {}) {
    const program = input.program || {};
    const draft = input.draft || {};
    const result = input.kanbanResult || {};
    const tasks = draftTasks(draft);
    const title = learningProgramTitle(program, draft);
    const caseId = learningCaseId(input);
    const lines = [
      `# ${title}`,
      "",
      "## Operational baseline",
      "",
      `- Workspace: ${cleanString(program.workspaceId || input.workspaceId || FANFAN_WORKSPACE_ID)}`,
      `- Learner: ${cleanString(program.learnerId || program.workspaceId || FANFAN_WORKSPACE_ID)}`,
      `- Domain: ${cleanString(program.domain || "english")}`,
      `- Program id: ${cleanString(program.programId)}`,
      `- Draft id: ${cleanString(draft.draftId)}`,
      `- Kanban case id: ${caseId}`,
      `- Week: ${cleanString(draft.weekStart)} to ${cleanString(draft.weekEnd)}`,
      "",
      "## Goal and scope",
      "",
      cleanString(program.goalSummary) || "No goal summary recorded.",
      "",
      "## Focus areas",
      "",
      ...(asArray(program.focusAreas).length ? asArray(program.focusAreas).map((item) => `- ${cleanString(item)}`) : ["- Not recorded"]),
      "",
      "## Task plan",
      "",
      ...(tasks.length ? tasks.map(taskSummary) : ["- No task cards recorded"]),
      "",
      "## Runtime links",
      "",
      `- Published cards: ${asArray(result.cards).length || Number(draft.taskCount || 0) || tasks.length}`,
      `- Updated: ${nowIso()}`,
      "",
      "## Privacy boundary",
      "",
      "This summary stores task structure, evaluation summaries, report references, and learning signals only. It must not store full child submissions, full transcripts, answer keys, raw prompts, raw secrets, or full generated question text.",
      "",
    ].join("\n");
    writeText(path.join(dir, "learning-growth-plan.md"), lines);
    const cleanedDir = ensureDir(path.join(dir, ".hermes-cleaned"));
    writeText(path.join(cleanedDir, "summary.md"), lines);
    writeRootSummary(path.dirname(dir), `Latest Growth program directory: ${path.basename(dir)}\n\n${tasks.slice(0, 8).map(taskSummary).join("\n") || "- No task cards recorded"}`);
    return {
      directory: dir,
      planPath: path.join(dir, "learning-growth-plan.md"),
      summaryPath: path.join(cleanedDir, "summary.md"),
    };
  }

  function materializeProgram(input = {}) {
    const dir = programDirectory(input);
    return writeProgramSummaries(dir, input);
  }

  function reportDirectoryForCard(workspaceId, cardId, card = {}) {
    const dir = programDirectory({ workspaceId, card, caseId: cardField(card, "kanbanCaseId", "kanban_case_id") });
    const target = path.join(dir, "deliverables", safeFileName(cardId || cardField(card, "id"), "card"));
    assertInsideRoot(dir, target);
    return ensureDir(target);
  }

  function materializeWritingEvaluation(input = {}) {
    const workspaceId = cleanString(input.workspaceId || input.card?.workspaceId || input.card?.workspace_id) || FANFAN_WORKSPACE_ID;
    const card = input.card || {};
    const evaluation = input.evaluation || {};
    const report = input.report || null;
    const cardId = cleanString(input.cardId || cardField(card, "id")) || "card";
    const reportDir = reportDirectoryForCard(workspaceId, cardId, card);
    let visibleReportPath = cleanString(report?.path);
    if (visibleReportPath && normalizePathForCompare(path.dirname(visibleReportPath)) !== normalizePathForCompare(reportDir)) {
      visibleReportPath = copyFileIfReadable(visibleReportPath, path.join(reportDir, safeFileName(report.name || path.basename(visibleReportPath), "writing-feedback.md"))) || visibleReportPath;
    }
    const summary = [
      `# ${cardField(card, "content", "title") || cardId} - learning data summary`,
      "",
      `- Card id: ${cardId}`,
      `- Stage: ${cleanString(evaluation.stage || evaluation.submissionStage)}`,
      `- Status: ${cleanString(evaluation.status)}`,
      `- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
      `- Passed: ${Boolean(evaluation.passed)}`,
      `- Evaluated at: ${cleanString(evaluation.evaluatedAt) || nowIso()}`,
      `- Report: ${visibleReportPath ? path.basename(visibleReportPath) : "not generated"}`,
      "",
      "## Summary",
      "",
      cleanString(evaluation.summary) || "No evaluation summary recorded.",
      "",
      "## Focus areas",
      "",
      ...(asArray(evaluation.feedbackSections?.focusAreas || evaluation.revisionRequirements).map((item) => `- ${cleanString(item)}`).filter(Boolean).slice(0, 8)),
      "",
      "## Next practice",
      "",
      cleanString(evaluation.feedbackSections?.nextPractice || evaluation.nextPractice || evaluation.nextStep) || "Not recorded.",
      "",
      "## Privacy boundary",
      "",
      "This cleaned record keeps evaluation summary and learning signals only. It does not store the full student answer.",
      "",
    ].join("\n");
    const cleanedDir = ensureDir(path.join(reportDir, ".hermes-cleaned"));
    const summaryPath = writeText(path.join(cleanedDir, "summary.md"), summary);
    const programDir = path.dirname(path.dirname(reportDir));
    writeRootSummary(path.dirname(programDir), `Latest Growth evaluation: ${path.basename(programDir)} / ${cardId}\n\n- Status: ${cleanString(evaluation.status)}\n- Score: ${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}\n- Report: ${visibleReportPath ? path.basename(visibleReportPath) : "not generated"}`);
    return {
      directory: reportDir,
      summaryPath,
      reportPath: visibleReportPath,
    };
  }

  return {
    learningPlanRoot,
    programDirectory,
    materializeProgram,
    reportDirectoryForCard,
    materializeWritingEvaluation,
  };
}

module.exports = {
  FANFAN_WORKSPACE_ID,
  createLearningGrowthDirectoryMaterializationService,
};
