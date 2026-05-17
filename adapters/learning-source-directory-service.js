"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { compactLearningSummary } = require("./learning-record-privacy-service");

const DEFAULT_WORKSPACE_ID = "weixin_stephen";
const DEFAULT_LEARNER_ID = "weixin_stephen";
const FANFAN_DISPLAY_NAME = "\u51e1\u51e1";
const LEARNING_MATERIALS_LABEL = "\u5b66\u4e60\u8d44\u6599";
const OWNER_ROOT_LABEL = "owner-learning-materials";
const FANFAN_OWNER_RELATIVE_PARTS = ["Hermes-\u5f90\u6b23", "\u51e1\u51e1"];
const LEARNING_PLAN_DIR = "\u5b66\u4e60\u8ba1\u5212";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableId(prefix, parts) {
  const digest = crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function normalizePathForCompare(value) {
  const resolved = path.resolve(value || ".");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertInsideRoot(root, target) {
  const rootResolved = normalizePathForCompare(root);
  const targetResolved = normalizePathForCompare(target);
  if (targetResolved === rootResolved || targetResolved.startsWith(`${rootResolved}${path.sep}`)) return;
  const err = new Error("Learning source directory is outside the owner learning-materials root");
  err.status = 400;
  throw err;
}

function defaultOwnerDriveRoot(options = {}) {
  if (options.ownerDriveRoot) return path.resolve(String(options.ownerDriveRoot));
  if (options.dataDir) return path.join(path.resolve(String(options.dataDir)), "drive", "users", "owner");
  const dataDir = cleanString(process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR);
  if (dataDir) return path.join(path.resolve(dataDir), "drive", "users", "owner");
  if (process.platform === "win32") return path.join("C:\\ProgramData\\HermesMobile\\data", "drive", "users", "owner");
  return path.join("/mnt/c/ProgramData/HermesMobile/data", "drive", "users", "owner");
}

function relativePartsToPath(parts) {
  return asArray(parts).map(cleanString).filter(Boolean).join("/");
}

function defaultLearningSourceDirectoryBindings() {
  const ownerRelativePath = relativePartsToPath(FANFAN_OWNER_RELATIVE_PARTS);
  return [{
    bindingId: `learning-materials:${DEFAULT_LEARNER_ID}`,
    workspaceId: DEFAULT_WORKSPACE_ID,
    learnerId: DEFAULT_LEARNER_ID,
    displayName: FANFAN_DISPLAY_NAME,
    directoryLabel: LEARNING_MATERIALS_LABEL,
    ownerRelativePath,
    summaryCandidates: [
      {
        role: "learning_materials_cleaned_summary",
        relativePath: `${ownerRelativePath}/${LEARNING_MATERIALS_LABEL}/.hermes-cleaned/summary.md`,
        sourceType: "cleaned_history",
        title: `${FANFAN_DISPLAY_NAME} ${LEARNING_MATERIALS_LABEL} \u6e05\u6d17\u6458\u8981`,
        tags: ["learning_materials", "cleaned_summary", "owner_directory"],
        optional: true,
      },
      {
        role: "parent_cumulative_cleaned_summary",
        relativePath: `${ownerRelativePath}/.hermes-cleaned/summary.md`,
        sourceType: "cleaned_history",
        title: `${FANFAN_DISPLAY_NAME} ${LEARNING_MATERIALS_LABEL} \u7d2f\u8ba1\u6e05\u6d17\u6458\u8981`,
        tags: ["learning_materials", "cumulative_cleaned", "owner_parent_directory"],
      },
      {
        role: "learning_plan_cleaned_summary",
        relativePath: `${ownerRelativePath}/${LEARNING_PLAN_DIR}/.hermes-cleaned/summary.md`,
        sourceType: "cleaned_history",
        title: `${FANFAN_DISPLAY_NAME} ${LEARNING_MATERIALS_LABEL} \u5b66\u4e60\u8ba1\u5212\u6458\u8981`,
        tags: ["learning_materials", "learning_plan", "cleaned_summary"],
      },
    ],
  }];
}

function publicRefForCandidate(binding, candidate) {
  return `${OWNER_ROOT_LABEL}:${binding.learnerId}:${candidate.role}:${String(candidate.relativePath || "").replace(/\\/g, "/")}`;
}

function compactDirectorySummary(value) {
  const compact = compactLearningSummary(value, 1200);
  return compact.length > 3600 ? `${compact.slice(0, 3599)}...` : compact;
}

function publicCandidate(binding, candidate, ownerDriveRoot) {
  const absolutePath = path.resolve(ownerDriveRoot, String(candidate.relativePath || ""));
  assertInsideRoot(ownerDriveRoot, absolutePath);
  let stat = null;
  try {
    stat = fs.statSync(absolutePath);
  } catch (_) {
    stat = null;
  }
  return {
    role: candidate.role,
    sourceType: candidate.sourceType || "cleaned_history",
    title: candidate.title,
    ref: publicRefForCandidate(binding, candidate),
    exists: Boolean(stat && stat.isFile()),
    sizeBytes: stat && stat.isFile() ? stat.size : 0,
    updatedAt: stat && stat.isFile() ? stat.mtime.toISOString() : "",
  };
}

function publicBinding(binding, ownerDriveRoot) {
  const summaryFiles = asArray(binding.summaryCandidates).map((candidate) => publicCandidate(binding, candidate, ownerDriveRoot));
  return {
    bindingId: binding.bindingId,
    workspaceId: binding.workspaceId,
    learnerId: binding.learnerId,
    displayName: binding.displayName,
    directoryLabel: binding.directoryLabel,
    ownerRelativePath: binding.ownerRelativePath,
    policy: "summary_only_cleaned_data",
    summaryFiles,
    availableSummaryCount: summaryFiles.filter((item) => item.exists).length,
  };
}

function readCandidateSummary(binding, candidate, ownerDriveRoot) {
  const absolutePath = path.resolve(ownerDriveRoot, String(candidate.relativePath || ""));
  assertInsideRoot(ownerDriveRoot, absolutePath);
  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch (_) {
    return null;
  }
  if (!stat.isFile()) return null;
  const text = fs.readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
  const sourceDate = stat.mtime.toISOString().slice(0, 10);
  return {
    sourceId: stableId("lsource_dir", [binding.bindingId, candidate.relativePath, sourceDate]),
    workspaceId: binding.workspaceId,
    learnerId: binding.learnerId,
    sourceType: candidate.sourceType || "cleaned_history",
    title: candidate.title,
    summary: compactDirectorySummary(text),
    confidence: 0.82,
    sourceDate,
    tags: ["summary_only"].concat(asArray(candidate.tags)),
    refs: [publicRefForCandidate(binding, candidate)],
  };
}

function createLearningSourceDirectoryService(options = {}) {
  const sourceService = options.sourceService;
  if (!sourceService || typeof sourceService.save !== "function" || typeof sourceService.normalize !== "function") {
    throw new Error("learning source directory service requires sourceService");
  }
  const ownerDriveRoot = defaultOwnerDriveRoot(options);
  const configuredBindings = asArray(options.bindings);
  const bindings = configuredBindings.length ? configuredBindings : defaultLearningSourceDirectoryBindings();

  function listBindings(filters = {}) {
    const workspaceId = cleanString(filters.workspaceId);
    const learnerId = cleanString(filters.learnerId || filters.studentId);
    return bindings
      .filter((binding) => !workspaceId || binding.workspaceId === workspaceId)
      .filter((binding) => !learnerId || binding.learnerId === learnerId)
      .map((binding) => publicBinding(binding, ownerDriveRoot));
  }

  function resolveBinding(input = {}) {
    const bindingId = cleanString(input.bindingId || input.sourceDirectoryId || input.directoryBindingId);
    const workspaceId = cleanString(input.workspaceId) || DEFAULT_WORKSPACE_ID;
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const binding = bindings.find((item) => (
      (bindingId && item.bindingId === bindingId)
      || (!bindingId && item.workspaceId === workspaceId && item.learnerId === learnerId)
    ));
    if (!binding) {
      const err = new Error("Learning source directory binding not found");
      err.status = 404;
      throw err;
    }
    return binding;
  }

  function collectSummaries(input = {}) {
    const binding = resolveBinding(input);
    const sources = asArray(binding.summaryCandidates)
      .map((candidate) => readCandidateSummary(binding, candidate, ownerDriveRoot))
      .filter(Boolean)
      .map((source) => sourceService.normalize(source));
    return {
      binding: publicBinding(binding, ownerDriveRoot),
      sources,
    };
  }

  function importSummaries(input = {}) {
    const dryRun = Boolean(input.dryRun);
    const collected = collectSummaries(input);
    const imported = dryRun ? [] : collected.sources.map((source) => sourceService.save(source));
    return {
      ok: true,
      dryRun,
      binding: collected.binding,
      counts: {
        sources: collected.sources.length,
        importedSources: imported.length,
      },
      sources: dryRun ? collected.sources : imported,
    };
  }

  return {
    collectSummaries,
    importSummaries,
    listBindings,
    resolveBinding,
  };
}

module.exports = {
  DEFAULT_LEARNER_ID,
  DEFAULT_WORKSPACE_ID,
  LEARNING_MATERIALS_LABEL,
  createLearningSourceDirectoryService,
  defaultLearningSourceDirectoryBindings,
  defaultOwnerDriveRoot,
};
