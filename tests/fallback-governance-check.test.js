"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "fallback-governance-check.js");
const { parseAddedLines, runCheck } = require(scriptPath);

function run(args) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fallback-governance-"));
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "sample.js"), "\"use strict\";\n", "utf8");
  execFileSync("git", ["add", "sample.js"], { cwd: root });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "ignore" });
  return root;
}

{
  const result = run(["--json"]);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.issues, []);
}

{
  const diff = [
    "diff --git a/sample.js b/sample.js",
    "index 0000000..1111111 100644",
    "--- a/sample.js",
    "+++ b/sample.js",
    "@@ -1,0 +1,2 @@",
    "+const workspaceId = input.workspaceId || \"owner\";",
    "+const mode = \"fallback\";",
  ].join("\n");
  const rows = parseAddedLines(diff);
  assert.deepEqual(rows, [
    { file: "sample.js", line: 1, text: "const workspaceId = input.workspaceId || \"owner\";" },
    { file: "sample.js", line: 2, text: "const mode = \"fallback\";" },
  ]);
}

{
  const root = tempRepo();
  fs.writeFileSync(path.join(root, "sample.js"), [
    "\"use strict\";",
    "const workspaceId = input.workspaceId || \"owner\";",
    "",
  ].join("\n"), "utf8");
  const result = runCheck({
    repoRoot: root,
    changedFiles: ["sample.js"],
    skipRequiredDocs: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "owner_default"));
}

{
  const root = tempRepo();
  fs.writeFileSync(path.join(root, "sample.js"), [
    "\"use strict\";",
    "const mode = \"fallback\"; // fallback-governance:registered-test",
    "",
  ].join("\n"), "utf8");
  const result = runCheck({
    repoRoot: root,
    changedFiles: ["sample.js"],
    skipRequiredDocs: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
}

{
  const root = tempRepo();
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "productization-check.js"), "\"use strict\";\n", "utf8");
  execFileSync("git", ["add", "scripts/productization-check.js"], { cwd: root });
  execFileSync("git", ["commit", "-m", "add governance wiring"], { cwd: root, stdio: "ignore" });
  fs.writeFileSync(path.join(root, "scripts", "productization-check.js"), [
    "\"use strict\";",
    "const command = \"node scripts/fallback-governance-check.js --json\";",
    "",
  ].join("\n"), "utf8");
  const result = runCheck({
    repoRoot: root,
    changedFiles: ["scripts/productization-check.js"],
    skipRequiredDocs: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.scannedFiles, []);
}

const scriptText = fs.readFileSync(scriptPath, "utf8");
assert.match(scriptText, /fallback-governance:<fallback_id>/);
assert.match(scriptText, /No silent fallback|silent fallback patterns/);

console.log("fallback governance check tests passed");
