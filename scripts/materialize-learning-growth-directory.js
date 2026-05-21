"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  createLearningGrowthDirectoryMaterializationService,
} = require("../adapters/learning-growth-directory-materialization-service");
const {
  createLearningProgramRepository,
} = require("../adapters/learning-program-repository");

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dataDir: process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || "",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    dryRun: false,
    limit: 50,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--data-dir") out.dataDir = next();
    else if (arg === "--workspace-id") out.workspaceId = next();
    else if (arg === "--learner-id") out.learnerId = next();
    else if (arg === "--limit") out.limit = Number(next()) || out.limit;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/materialize-learning-growth-directory.js --data-dir <HermesMobileDataDir> [options]",
    "",
    "Options:",
    "  --workspace-id <id>   Learner workspace/account id. Default: weixin_stephen",
    "  --learner-id <id>     Learner id. Default: same as workspace id",
    "  --limit <n>           Program scan limit. Default: 50",
    "  --dry-run             Count records without writing files",
    "",
    "The script materializes summary-only Growth learning records to the learner learning-plan directory.",
    "It does not read or print full child submissions, transcripts, prompts, questions, or answer keys.",
  ].join("\n"));
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (_) {
    return null;
  }
}

function walkMarkdownReports(root) {
  const reports = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = (() => {
      try {
        return fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        return [];
      }
    })();
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /(?:writing-|task-|vocabulary-|grammar-|reading-|listening-|speaking-|pronunciation-|presentation-)?feedback\.md$/i.test(entry.name)) {
        reports.push(fullPath);
      }
    }
  }
  return reports;
}

function reportParts(artifactRoot, reportPath) {
  const relative = path.relative(artifactRoot, reportPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length < 3) return null;
  return {
    caseId: parts[0],
    cardId: parts[1],
    fileName: parts[parts.length - 1],
  };
}

function latestByCreatedAt(items = []) {
  return items.slice().sort((a, b) => cleanString(b.createdAt).localeCompare(cleanString(a.createdAt)))[0] || null;
}

function kanbanPlanId(result = {}) {
  return cleanString(
    result.plan?.id
    || result.kanbanResult?.plan?.id
    || result.caseId
    || result.kanbanCaseId,
  );
}

function bestPublication(items = []) {
  const withPlan = items.filter((item) => kanbanPlanId(item.kanbanResult));
  return latestByCreatedAt(withPlan) || latestByCreatedAt(items);
}

function buildIndexes(repository, filters) {
  const programs = repository.listPrograms(filters);
  const programById = new Map(programs.map((program) => [program.programId, program]));
  const draftsByProgram = new Map();
  const taskByKanbanCardId = new Map();
  const evaluationByTaskCardId = new Map();
  const publicationsByDraft = new Map();
  for (const program of programs) {
    const drafts = repository.listPlanDrafts({ programId: program.programId, learnerId: filters.learnerId, limit: 100 });
    draftsByProgram.set(program.programId, drafts);
    for (const draft of drafts) {
      const publications = repository.listPublications({ draftId: draft.draftId, learnerId: filters.learnerId, limit: 20 });
      publicationsByDraft.set(draft.draftId, publications);
    }
    const tasks = repository.listTaskCards({ programId: program.programId, learnerId: filters.learnerId, limit: 300 });
    for (const task of tasks) {
      if (task.kanbanCardId) taskByKanbanCardId.set(task.kanbanCardId, task);
      const evaluation = latestByCreatedAt(repository.listEvaluations({ taskCardId: task.taskCardId, learnerId: filters.learnerId, limit: 20 }));
      if (evaluation) evaluationByTaskCardId.set(task.taskCardId, evaluation);
    }
  }
  return {
    programs,
    programById,
    draftsByProgram,
    taskByKanbanCardId,
    evaluationByTaskCardId,
    publicationsByDraft,
  };
}

function publicEvaluationForMaterialization(evaluation = null) {
  if (!evaluation) {
    return {
      status: "recorded",
      score: 0,
      maxScore: 100,
      passed: false,
      summary: "Report file was materialized for learning-history continuity; no structured evaluation row was found.",
      feedbackSections: {},
    };
  }
  return {
    stage: cleanString(evaluation.stage),
    status: cleanString(evaluation.status) || "recorded",
    score: Number(evaluation.score || 0),
    maxScore: Number(evaluation.maxScore || 100) || 100,
    passed: Boolean(evaluation.passed),
    summary: cleanString(evaluation.summary),
    feedbackSections: evaluation.feedbackSections && typeof evaluation.feedbackSections === "object" ? evaluation.feedbackSections : {},
    nextStep: cleanString(evaluation.nextStep),
    evaluatedAt: cleanString(evaluation.createdAt),
  };
}

function materialize(options = {}) {
  const dataDir = path.resolve(cleanString(options.dataDir) || path.join(process.cwd(), "workspace", "hermes-web"));
  const workspaceId = cleanString(options.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(options.learnerId) || workspaceId;
  const repository = options.repository || createLearningProgramRepository({ dataDir });
  const materializer = options.materializer || createLearningGrowthDirectoryMaterializationService({ dataDir });
  const counts = {
    dryRun: Boolean(options.dryRun),
    programsScanned: 0,
    programsMaterialized: 0,
    reportFilesScanned: 0,
    reportsMaterialized: 0,
    missingTaskCards: 0,
  };
  const indexes = buildIndexes(repository, { workspaceId, learnerId, limit: Number(options.limit || 50) || 50 });
  counts.programsScanned = indexes.programs.length;
  for (const program of indexes.programs) {
    const drafts = indexes.draftsByProgram.get(program.programId) || [];
    const draft = latestByCreatedAt(drafts.filter((item) => item.status === "published")) || latestByCreatedAt(drafts);
    if (!draft) continue;
    const publication = bestPublication(indexes.publicationsByDraft.get(draft.draftId) || []);
    if (!options.dryRun) {
      materializer.materializeProgram({
        workspaceId,
        learnerId,
        program,
        draft,
        kanbanResult: publication?.kanbanResult || null,
        caseId: kanbanPlanId(publication?.kanbanResult),
      });
    }
    counts.programsMaterialized += 1;
  }
  const artifactRoot = path.join(dataDir, "artifacts", "kanban-reading", workspaceId);
  if (safeStat(artifactRoot)?.isDirectory()) {
    const reports = walkMarkdownReports(artifactRoot);
    counts.reportFilesScanned = reports.length;
    for (const reportPath of reports) {
      const parts = reportParts(artifactRoot, reportPath);
      if (!parts?.cardId) continue;
      const task = indexes.taskByKanbanCardId.get(parts.cardId) || null;
      const program = task ? indexes.programById.get(task.programId) : null;
      if (!task) counts.missingTaskCards += 1;
      if (!options.dryRun) {
        materializer.materializeWritingEvaluation({
          workspaceId,
          cardId: parts.cardId,
          card: {
            id: parts.cardId,
            workspaceId,
            kanbanCaseId: parts.caseId,
            kanbanCaseSummary: cleanString(program?.title) || "Fanfan English Growth",
            content: cleanString(task?.title) || parts.cardId,
            learningProgramId: cleanString(task?.programId),
            learningDraftId: cleanString(task?.draftId),
          },
          evaluation: publicEvaluationForMaterialization(task ? indexes.evaluationByTaskCardId.get(task.taskCardId) : null),
          report: {
            path: reportPath,
            name: parts.fileName,
          },
        });
      }
      counts.reportsMaterialized += 1;
    }
  }
  return counts;
}

if (require.main === module) {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const result = materialize(args);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  bestPublication,
  kanbanPlanId,
  materialize,
  parseArgs,
  reportParts,
  walkMarkdownReports,
};
