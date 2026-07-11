"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveCodexMobileProfileRuntime,
} = require("../scripts/codex-mobile-profile-runtime");

function withPatchedFs(patches, callback) {
  const originals = {};
  for (const [name, replacement] of Object.entries(patches)) {
    originals[name] = fs[name];
    fs[name] = replacement;
  }
  try {
    return callback();
  } finally {
    for (const [name, original] of Object.entries(originals)) {
      fs[name] = original;
    }
  }
}

{
  const profileFile = "/Users/example/path";
  const result = withPatchedFs({
    existsSync(candidate) {
      if (candidate === profileFile) return true;
      return false;
    },
    readFileSync(candidate, encoding) {
      if (candidate === profileFile && encoding === "utf8") {
        const error = new Error("permission denied");
        error.code = "EACCES";
        throw error;
      }
      return "";
    },
  }, () => resolveCodexMobileProfileRuntime({
    serviceUser: "example",
    runtimeRoot: "/Users/example/.codex-mobile-web",
    profileFile,
  }));

  assert.equal(result.source, "default-fallback");
  assert.equal(result.codexHome, "/Users/example/.codex");
  assert.equal(result.profileFile, profileFile);
  assert.equal(result.activeProfileId, "");
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-codex-profile-runtime-"));
  const runtimeRoot = path.join(root, ".codex-mobile-web");
  const codexHome = "/Users/example/.codex-homes/previous";
  const profileFile = path.join(runtimeRoot, "codex-profiles.json");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(profileFile, JSON.stringify({
    activeProfileId: "previous",
    profiles: [{ id: "previous", label: "Previous", codexHome }],
  }, null, 2));

  const result = resolveCodexMobileProfileRuntime({
    serviceUser: "example",
    runtimeRoot,
    profileFile,
  });

  assert.equal(result.source, "profile-store");
  assert.equal(result.codexHome, codexHome);
  assert.equal(result.activeProfileId, "previous");
  assert.equal(result.activeProfileLabel, "Previous");
}

console.log("codex mobile profile runtime tests passed");
