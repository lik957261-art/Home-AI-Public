"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") {
      args.dryRun = true;
    } else if (item === "--overwrite") {
      args.overwrite = true;
    } else if (item.startsWith("--") && index + 1 < argv.length) {
      args[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function defaultPaths(args = {}, env = process.env) {
  const dataDir = path.resolve(args["data-dir"] || env.HERMES_WEB_DATA_DIR || path.join(REPO_ROOT, "workspace", "hermes-web"));
  return {
    dataDir,
    artifactRoot: path.resolve(
      args["artifact-root"]
      || env.HERMES_MOBILE_READING_ARTIFACT_ROOT
      || env.HERMES_WEB_READING_ARTIFACT_ROOT
      || path.join(dataDir, "artifacts", "kanban-reading"),
    ),
    sharePath: path.resolve(
      args["share-path"]
      || env.HERMES_MOBILE_KANBAN_CASE_SHARE_PATH
      || env.HERMES_WEB_KANBAN_CASE_SHARE_PATH
      || path.join(dataDir, "kanban-case-shares.json"),
    ),
    deliverableFolderName: cleanString(args["deliverable-folder"]) || "deliverables",
  };
}

function readJsonFile(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(file, value, dryRun = false) {
  if (dryRun) return;
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return [];
  const out = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, item.name);
    if (item.isDirectory()) out.push(...listFiles(fullPath));
    if (item.isFile()) out.push(fullPath);
  }
  return out;
}

function userFacingDeliverableFile(file) {
  const name = path.basename(file).toLowerCase();
  if (!name || name.endsWith(".json") || name.endsWith(".lock") || name.endsWith(".tmp")) return false;
  return true;
}

function ensureUniqueDestination(file) {
  if (!fs.existsSync(file)) return file;
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(dir, `${stem}-${index}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not allocate destination for ${path.basename(file)}`);
}

function copyDeliverable(source, destination, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const overwrite = Boolean(options.overwrite);
  let finalDestination = destination;
  if (!overwrite && fs.existsSync(destination)) {
    const sourceSize = fs.statSync(source).size;
    const destinationSize = fs.statSync(destination).size;
    finalDestination = sourceSize === destinationSize ? destination : ensureUniqueDestination(destination);
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(finalDestination), { recursive: true });
    if (overwrite || !fs.existsSync(finalDestination)) fs.copyFileSync(source, finalDestination);
  }
  return finalDestination;
}

function replacePathStrings(value, pathMap) {
  if (typeof value === "string") {
    return pathMap.get(path.resolve(value)) || value;
  }
  if (Array.isArray(value)) return value.map((item) => replacePathStrings(item, pathMap));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = replacePathStrings(child, pathMap);
  return out;
}

function migrateKanbanCaseDeliverables(options = {}) {
  const paths = Object.assign(defaultPaths(options, options.env || process.env), options.paths || {});
  const shareStore = readJsonFile(paths.sharePath, { cases: {} });
  const shares = Object.values(shareStore?.cases || {}).filter((share) => (
    share
    && typeof share === "object"
    && !(share.deletedAt || share.deleted_at)
    && cleanString(share.caseDirectoryPath || share.case_directory_path)
  ));
  const summary = {
    shares: shares.length,
    casesScanned: 0,
    filesCopied: 0,
    stateFilesUpdated: 0,
    skippedMissingArtifactCases: 0,
  };
  for (const share of shares) {
    const owner = cleanString(share.ownerWorkspaceId || share.owner_workspace_id || "owner") || "owner";
    const caseId = cleanString(share.caseId || share.case_id || share.kanbanCaseId || share.kanban_case_id);
    const caseDirectoryPath = cleanString(share.caseDirectoryPath || share.case_directory_path);
    if (!caseId || !caseDirectoryPath) continue;
    const sourceCaseRoot = path.join(paths.artifactRoot, owner, caseId);
    if (!fs.existsSync(sourceCaseRoot)) {
      summary.skippedMissingArtifactCases += 1;
      continue;
    }
    summary.casesScanned += 1;
    const pathMap = new Map();
    for (const cardDirName of fs.readdirSync(sourceCaseRoot)) {
      const sourceCardRoot = path.join(sourceCaseRoot, cardDirName);
      if (!fs.existsSync(sourceCardRoot) || !fs.statSync(sourceCardRoot).isDirectory()) continue;
      for (const sourceFile of listFiles(sourceCardRoot).filter(userFacingDeliverableFile)) {
        const relative = path.relative(sourceCardRoot, sourceFile);
        const destination = path.join(caseDirectoryPath, paths.deliverableFolderName, cardDirName, relative);
        const copied = copyDeliverable(sourceFile, destination, options);
        pathMap.set(path.resolve(sourceFile), copied);
        summary.filesCopied += 1;
      }
    }
    for (const stateFile of listFiles(sourceCaseRoot).filter((file) => /\.json$/i.test(file))) {
      const before = readJsonFile(stateFile, null);
      if (!before || typeof before !== "object") continue;
      const after = replacePathStrings(before, pathMap);
      if (JSON.stringify(after) === JSON.stringify(before)) continue;
      writeJsonFile(stateFile, after, options.dryRun);
      summary.stateFilesUpdated += 1;
    }
  }
  return summary;
}

function main() {
  const args = parseArgs();
  const summary = migrateKanbanCaseDeliverables(args);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) main();

module.exports = {
  defaultPaths,
  migrateKanbanCaseDeliverables,
  parseArgs,
  replacePathStrings,
  userFacingDeliverableFile,
};
