"use strict";

const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningGrowthMasteryProfileService } = require("../adapters/learning-growth-mastery-profile-service");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function latestByTask(records = [], taskCardId = "", timeKey = "createdAt") {
  return asArray(records)
    .filter((record) => cleanString(record.taskCardId) === taskCardId)
    .sort((a, b) => cleanString(b[timeKey] || b.createdAt || b.updatedAt).localeCompare(cleanString(a[timeKey] || a.createdAt || a.updatedAt)))[0] || null;
}

function main() {
  const dataDir = argValue("data-dir", process.env.HERMES_MOBILE_DATA_DIR || process.env.HERMES_WEB_DATA_DIR || "C:\\ProgramData\\HermesMobile\\data");
  const dbPath = argValue("db-path", process.env.HERMES_MOBILE_LEARNING_DB_PATH || process.env.HERMES_WEB_LEARNING_DB_PATH || "");
  const workspaceId = argValue("workspace-id", "weixin_stephen");
  const learnerId = argValue("learner-id", workspaceId);
  const limit = Math.max(1, Math.min(1000, Number(argValue("limit", "300")) || 300));
  const dryRun = hasFlag("dry-run");
  const repository = createLearningProgramRepository({
    dataDir: path.resolve(dataDir),
    dbPath: dbPath ? path.resolve(dbPath) : undefined,
  });
  try {
    const service = createLearningGrowthMasteryProfileService({ repository });
    const evaluations = repository.listEvaluations({ workspaceId, learnerId, limit })
      .filter((evaluation) => cleanString(evaluation.taskCardId));
    const reflections = typeof repository.listTaskReflections === "function"
      ? repository.listTaskReflections({ workspaceId, learnerId, limit })
      : [];
    const seen = new Set();
    const summary = {
      ok: true,
      dryRun,
      workspaceId,
      learnerId,
      evaluationsSeen: evaluations.length,
      evidenceRecorded: 0,
      evidenceSkipped: 0,
      missingTasks: 0,
      errors: [],
    };
    for (const evaluation of evaluations) {
      const evaluationId = cleanString(evaluation.evaluationId);
      if (!evaluationId || seen.has(evaluationId)) continue;
      seen.add(evaluationId);
      const task = repository.getTaskCard(evaluation.taskCardId);
      if (!task?.taskCardId) {
        summary.missingTasks += 1;
        continue;
      }
      if (dryRun) {
        summary.evidenceRecorded += asArray(task.skillIds || task.taskModel?.skillTargets).length || 1;
        continue;
      }
      try {
        const result = service.recordTaskEvidence({
          taskCard: task,
          evaluation,
          reflection: latestByTask(reflections, task.taskCardId, "submittedAt"),
          learnerId,
          workspaceId,
          author: "learning-growth-mastery-backfill",
        });
        for (const change of asArray(result.masteryChanges)) {
          if (change.skipped) summary.evidenceSkipped += 1;
          else summary.evidenceRecorded += 1;
        }
      } catch (err) {
        summary.errors.push({
          evaluationId,
          taskCardId: cleanString(evaluation.taskCardId),
          error: cleanString(err.message || err).slice(0, 160),
        });
      }
    }
    const counts = repository.counts({ learnerId });
    summary.growthMasteryStates = counts.growthMasteryStates;
    summary.growthCardTrajectories = counts.growthCardTrajectories;
    console.log(JSON.stringify(summary));
    if (summary.errors.length) process.exitCode = 1;
  } finally {
    repository.close();
  }
}

main();
