"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const scanAdjacentPlugins = process.env.HOMEAI_SCAN_ADJACENT_PLUGIN_DIALOGS === "1";
const candidateRoots = [
  { name: "home-ai-public", root: path.join(repoRoot, "public"), required: true },
  ...(scanAdjacentPlugins ? [
    { name: "home-ai-plugin-mirrors", root: "/Users/example/path", required: false },
    { name: "movie-plugin", root: "/Users/example/path", required: false },
    { name: "music-plugin", root: "/Users/example/path", required: false },
  ] : []),
];

const skippedDirectoryNames = new Set([
  ".git",
  ".agent-context",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  "runtime",
  "data",
  "logs",
  "tmp",
]);
const skippedInactiveDirectoryNameFragments = [
  "-deploy-clean",
  "-archive",
  "-archived",
  "-backup",
  "-bak",
];
const scannedExtensions = new Set([".js", ".mjs", ".cjs", ".html"]);
const forbiddenDialogRe = /(?:\bwindow\s*\.\s*(alert|confirm|prompt)\s*\(|(?<![\w$.])(alert|confirm|prompt)\s*\()/g;
const beforeUnloadRe = /\b(?:window\s*\.\s*)?(?:onbeforeunload|addEventListener\s*\(\s*["']beforeunload["'])/g;

function stripJsCommentsAndStrings(source) {
  let output = "";
  let index = 0;
  let state = "code";
  let quote = "";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "lineComment";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "blockComment";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        state = "string";
        quote = char;
        output += " ";
        index += 1;
        continue;
      }
      output += char;
      index += 1;
      continue;
    }
    if (state === "lineComment") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }
    if (state === "blockComment") {
      output += char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") {
        output += " ";
        index += 2;
        state = "code";
        continue;
      }
      index += 1;
      continue;
    }
    if (state === "string") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\\") {
        if (next === "\n") output += "\n";
        else output += " ";
        index += 2;
        continue;
      }
      if (char === quote) state = "code";
      index += 1;
      continue;
    }
  }
  return output;
}

function shouldSkipDirectory(dirPath) {
  const base = path.basename(dirPath);
  return skippedDirectoryNames.has(base)
    || skippedInactiveDirectoryNameFragments.some((fragment) => base.includes(fragment));
}

function collectFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try {
      stat = fs.statSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (shouldSkipDirectory(current)) continue;
      const children = fs.readdirSync(current).map((child) => path.join(current, child));
      stack.push(...children);
      continue;
    }
    if (!stat.isFile()) continue;
    if (!scannedExtensions.has(path.extname(current))) continue;
    files.push(current);
  }
  return files.sort();
}

function lineForIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function findViolations(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const stripped = stripJsCommentsAndStrings(source);
  const violations = [];
  for (const regex of [forbiddenDialogRe, beforeUnloadRe]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(stripped))) {
      const snippet = source.slice(match.index, match.index + 80).split(/\r?\n/)[0].trim();
      violations.push(`${filePath}:${lineForIndex(source, match.index)} ${snippet}`);
    }
  }
  return violations;
}

const allViolations = [];
const scannedRoots = [];

for (const candidate of candidateRoots) {
  if (!fs.existsSync(candidate.root)) {
    if (candidate.required) assert.fail(`Required scan root missing: ${candidate.root}`);
    continue;
  }
  scannedRoots.push(candidate.name);
  for (const file of collectFiles(candidate.root)) {
    allViolations.push(...findViolations(file));
  }
}

assert.deepEqual(
  allViolations,
  [],
  `Browser-native page dialogs are forbidden; use in-app dialogs/sheets/toasts instead.\nScanned roots: ${scannedRoots.join(", ")}\n${allViolations.join("\n")}`,
);

const mobileContract = fs.readFileSync(path.join(repoRoot, "docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md"), "utf8");
const workspaceContract = fs.readFileSync(path.join(repoRoot, "docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md"), "utf8");

assert.match(mobileContract, /In-App Dialog Rule/);
assert.match(mobileContract, /window\.alert/);
assert.match(mobileContract, /openAppConfirmDialog/);
assert.match(workspaceContract, /In-App Dialog Requirement/);
assert.match(workspaceContract, /tests\/no-browser-native-dialogs\.test\.js/);
assert.match(workspaceContract, /HOMEAI_SCAN_ADJACENT_PLUGIN_DIALOGS=1/);
assert.equal(shouldSkipDirectory("/Users/example/path"), true);
assert.equal(shouldSkipDirectory("/Users/example/path"), false);

console.log(`no browser-native dialogs harness passed; scanned roots: ${scannedRoots.join(", ")}`);
