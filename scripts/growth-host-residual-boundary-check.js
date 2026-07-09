"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = path.resolve(__dirname, "..");

const TRACKED_DIRS = Object.freeze([
  "adapters",
  "server-routes",
  "public",
  "tests",
  "scripts",
]);

const LEGACY_FILE_RE = /(?:^|[-_])(learning|growth|study|assessment)(?:[-_.]|$)/i;
const NON_GROWTH_LEARNING_FILE_RE = /(?:^|[-_])voice-learning(?:[-_.]|$)/i;

const SELF_GUARD_FILES = Object.freeze(new Set([
  "scripts/growth-host-residual-boundary-check.js",
  "tests/growth-host-residual-boundary-check.test.js",
]));

const CURRENT_HOST_RESIDUAL_MAX = Object.freeze({
  adapters: 76,
  "server-routes": 9,
  public: 15,
  tests: 97,
  scripts: 4,
});

const REQUIRED_DOC_MARKERS = Object.freeze([
  {
    file: "docs/IMPLEMENTATION_NOTES/growth-pluginization-plan.md",
    markers: [
      "Home AI remains the owner of:",
      "Growth plugin becomes the owner of:",
      "The mature Growth implementation still lives in the Home AI host",
    ],
  },
  {
    file: "docs/MODULES/growth-learning.md",
    markers: [
      "production default is",
      "growth_plugin_owned",
      "Growth plugin SQLite migration is now the production Growth read source",
    ],
  },
  {
    file: "docs/ARCHITECTURE_BOUNDARY.md",
    markers: [
      "Growth Plugin Ownership Boundary",
      "Growth plugin owns learner programs",
      "node scripts/growth-host-residual-boundary-check.js --json",
    ],
  },
]);

function parseArgs(argv = []) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = path.resolve(argv[++index] || options.root);
    else if (arg === "--json") options.json = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function listDirFiles(root, dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${dir}/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
}

function growthResidualFiles(root) {
  const files = {};
  for (const dir of TRACKED_DIRS) {
    files[dir] = listDirFiles(root, dir)
      .filter((file) => !SELF_GUARD_FILES.has(file))
      .filter((file) => !NON_GROWTH_LEARNING_FILE_RE.test(path.basename(file)))
      .filter((file) => LEGACY_FILE_RE.test(path.basename(file)));
  }
  return files;
}

function checkResidualCounts(files, limits = CURRENT_HOST_RESIDUAL_MAX) {
  const issues = [];
  const counts = {};
  for (const dir of TRACKED_DIRS) {
    counts[dir] = files[dir]?.length || 0;
    const max = Number(limits[dir] || 0);
    if (counts[dir] > max) {
      issues.push({
        code: "growth_host_residual_count_exceeded",
        dir,
        count: counts[dir],
        max,
        message: `${dir} has ${counts[dir]} Growth/Learning residual files, above allowed maximum ${max}`,
      });
    }
  }
  return { counts, issues };
}

function readText(root, relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch (_) {
    return "";
  }
}

function checkDocs(root, requiredDocs = REQUIRED_DOC_MARKERS) {
  const issues = [];
  const docs = [];
  for (const doc of requiredDocs) {
    const text = readText(root, doc.file);
    const missingMarkers = doc.markers.filter((marker) => !text.includes(marker));
    docs.push({
      file: doc.file,
      present: Boolean(text),
      missingMarkers,
    });
    if (!text) {
      issues.push({
        code: "growth_host_boundary_doc_missing",
        file: doc.file,
        message: `${doc.file} is missing`,
      });
    } else if (missingMarkers.length) {
      issues.push({
        code: "growth_host_boundary_doc_marker_missing",
        file: doc.file,
        missingMarkers,
        message: `${doc.file} is missing required Growth host-boundary markers`,
      });
    }
  }
  return { docs, issues };
}

function evaluateGrowthHostResidualBoundary(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const files = growthResidualFiles(root);
  const countResult = checkResidualCounts(files, options.limits || CURRENT_HOST_RESIDUAL_MAX);
  const docResult = checkDocs(root, options.requiredDocs || REQUIRED_DOC_MARKERS);
  const issues = countResult.issues.concat(docResult.issues);
  const result = {
    ok: issues.length === 0,
    root,
    boundary: {
      owner: "growth-plugin",
      hostAllowedResponsibilities: [
        "plugin provisioning",
        "plugin launch/proxy/iframe shell",
        "workspace and access-key boundaries",
        "Gateway toolset activation",
        "Action Inbox and Web Push routing",
        "platform Tongbao exchange",
        "migration facade and legacy URL compatibility",
      ],
      hostDisallowedResponsibilities: [
        "new learner program business logic",
        "new card authoring workflow",
        "new submission/evaluation/reflection business logic",
        "new Growth UI implementation outside the embedded plugin shell",
      ],
    },
    counts: countResult.counts,
    limits: Object.assign({}, options.limits || CURRENT_HOST_RESIDUAL_MAX),
    docs: docResult.docs,
    issues,
  };
  if (options.list) result.files = files;
  return result;
}

function printHelp() {
  console.log([
    "Usage: node scripts/growth-host-residual-boundary-check.js [options]",
    "",
    "Options:",
    "  --root <path>  Repository root. Default: current Home AI repo.",
    "  --json         Print JSON output.",
    "  --list         Include matching file lists in JSON/text output.",
    "  --help         Show this help.",
  ].join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = evaluateGrowthHostResidualBoundary(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Growth host residual boundary: ${result.ok ? "ok" : "failed"}`);
    for (const dir of TRACKED_DIRS) {
      console.log(`- ${dir}: ${result.counts[dir]} / ${result.limits[dir]}`);
    }
    if (options.list) {
      const files = result.files || {};
      for (const dir of TRACKED_DIRS) {
        for (const file of files[dir] || []) console.log(`  ${file}`);
      }
    }
    for (const issue of result.issues) {
      console.error(`${issue.code}: ${issue.message}`);
    }
  }
  if (!result.ok) process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  CURRENT_HOST_RESIDUAL_MAX,
  NON_GROWTH_LEARNING_FILE_RE,
  REQUIRED_DOC_MARKERS,
  SELF_GUARD_FILES,
  TRACKED_DIRS,
  evaluateGrowthHostResidualBoundary,
  growthResidualFiles,
  parseArgs,
};
