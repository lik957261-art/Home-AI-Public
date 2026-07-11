"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sitecustomize = path.join(repoRoot, "gateway-runtime-overrides", "sitecustomize.py");
const python = process.env.PYTHON || "python3";
const harness = String.raw`
import importlib.util
import os
import pathlib
import sys
import tempfile

sitecustomize_path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("homeai_sitecustomize_test", sitecustomize_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LegacyUtils:
    @staticmethod
    def atomic_replace(tmp_path, target):
        os.replace(str(tmp_path), str(target))

assert module._patch_utils_atomic_replace_module(LegacyUtils)

with tempfile.TemporaryDirectory(prefix="homeai-auth-link-") as temp_root:
    root = pathlib.Path(temp_root)
    shared_root = root / "shared-auth"
    profile_root = root / "profile"
    shared_root.mkdir()
    profile_root.mkdir()

    shared_auth = shared_root / "auth.json"
    shared_auth.write_text("old\n", encoding="utf-8")
    profile_auth = profile_root / "auth.json"
    profile_auth.symlink_to(shared_auth)
    replacement = profile_root / "auth.json.tmp"
    replacement.write_text("new\n", encoding="utf-8")

    result = LegacyUtils.atomic_replace(replacement, profile_auth)

    assert profile_auth.is_symlink(), "profile auth symlink was replaced"
    assert profile_auth.resolve() == shared_auth.resolve()
    assert shared_auth.read_text(encoding="utf-8") == "new\n"
    assert pathlib.Path(result).resolve() == shared_auth.resolve()
`;

execFileSync(python, ["-c", harness, sitecustomize], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HERMES_MOBILE_MCP_INVENTORY_LOG: "",
    HERMES_MOBILE_RUNTIME_PATCH_MAX_ATTEMPTS: "1",
  },
  stdio: "inherit",
});

assert.ok(true);
console.log("gateway runtime atomic replace tests passed");
