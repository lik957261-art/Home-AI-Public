"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-archive", "__init__.py");

function runPython(script, env = {}) {
  return execFileSync("python", ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-archive-plugin-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testListsAndExtractsSafeZip() {
  withTempRoot((root) => {
    const archivePath = path.join(root, "contract.zip");
    const destination = path.join(root, "contract_extracted");
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_archive", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
archive_path = Path(${JSON.stringify(archivePath)})
destination = Path(${JSON.stringify(destination)})
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("docs/contract.txt", "hello contract")
    archive.writestr("nested/", "")
listed = json.loads(module._archive_list_handler({"file_path": str(archive_path), "max_entries": 10}))
extracted = json.loads(module._archive_extract_safe_handler({"file_path": str(archive_path), "destination_dir": str(destination)}))
print(json.dumps({
    "listed": listed,
    "extracted": extracted,
    "content": (destination / "docs" / "contract.txt").read_text(encoding="utf-8"),
}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, { HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS: root }));
    assert.equal(result.listed.ok, true);
    assert.equal(result.listed.tool, "archive_list");
    assert.equal(result.listed.entryCount, 2);
    assert.equal(result.listed.entries.some((entry) => entry.path === "docs/contract.txt"), true);
    assert.equal(result.extracted.ok, true);
    assert.equal(result.extracted.tool, "archive_extract_safe");
    assert.equal(result.extracted.extractedCount, 1);
    assert.equal(result.extracted.destinationDir, fs.realpathSync(destination));
    assert.equal(result.content, "hello contract");
  });
}

function testRejectsTraversalEntry() {
  withTempRoot((root) => {
    const archivePath = path.join(root, "bad.zip");
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_archive", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
archive_path = Path(${JSON.stringify(archivePath)})
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("../evil.txt", "no")
print(module._archive_list_handler({"file_path": str(archive_path)}))
`;
    const result = JSON.parse(runPython(script, { HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS: root }));
    assert.equal(result.ok, false);
    assert.equal(result.error, "archive_entry_path_traversal");
  });
}

function testExtractDoesNotOverwriteExistingFile() {
  withTempRoot((root) => {
    const archivePath = path.join(root, "overwrite.zip");
    const destination = path.join(root, "out");
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, "same.txt"), "existing", "utf8");
    const script = `
import importlib.util, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_archive", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
archive_path = Path(${JSON.stringify(archivePath)})
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("same.txt", "new")
print(module._archive_extract_safe_handler({"file_path": str(archive_path), "destination_dir": ${JSON.stringify(destination)}}))
`;
    const result = JSON.parse(runPython(script, { HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS: root }));
    assert.equal(result.ok, false);
    assert.equal(result.error, "archive_target_exists:same.txt");
    assert.equal(fs.readFileSync(path.join(destination, "same.txt"), "utf8"), "existing");
  });
}

testListsAndExtractsSafeZip();
testRejectsTraversalEntry();
testExtractDoesNotOverwriteExistingFile();
