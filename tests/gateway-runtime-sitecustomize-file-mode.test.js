"use strict";

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const runtimeOverrides = path.join(repoRoot, "gateway-runtime-overrides");

const python = String.raw`
import errno
import os
import stat
import tempfile
import types

import sitecustomize as sc

def file_mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)

tmp = tempfile.mkdtemp(prefix="homeai-md-mode-")
plugin_dir = os.path.join(tmp, "drive", "users", "owner", "Workspace", "插件", "男装衣橱")
os.makedirs(plugin_dir, exist_ok=True)

direct_doc = os.path.join(plugin_dir, "outfit.md")
with open(direct_doc, "w", encoding="utf-8") as handle:
    handle.write("metadata-only receipt")
os.chmod(direct_doc, 0o600)
assert sc._is_homeai_user_facing_markdown_delivery(direct_doc) is True
assert sc._apply_homeai_user_facing_markdown_mode(direct_doc) is True
assert file_mode(direct_doc) == 0o644

private_doc = os.path.join(plugin_dir, "secrets", "token.md")
os.makedirs(os.path.dirname(private_doc), exist_ok=True)
with open(private_doc, "w", encoding="utf-8") as handle:
    handle.write("redacted")
os.chmod(private_doc, 0o600)
assert sc._is_homeai_user_facing_markdown_delivery(private_doc) is False
assert sc._apply_homeai_user_facing_markdown_mode(private_doc) is False
assert file_mode(private_doc) == 0o600

configured_root = os.path.join(tmp, "custom-delivery-root")
os.makedirs(configured_root, exist_ok=True)
os.environ["HERMES_MOBILE_USER_FACING_MARKDOWN_ROOTS"] = configured_root
configured_doc = os.path.join(configured_root, "wardrobe-receipt.markdown")
with open(configured_doc, "w", encoding="utf-8") as handle:
    handle.write("metadata-only receipt")
os.chmod(configured_doc, 0o600)
assert sc._is_homeai_user_facing_markdown_delivery(configured_doc) is True
assert sc._apply_homeai_user_facing_markdown_mode(configured_doc) is True
assert file_mode(configured_doc) == 0o644

def original_replace(tmp_path, target):
    os.replace(tmp_path, target)
    return target

utils = types.SimpleNamespace(atomic_replace=original_replace)
assert sc._patch_utils_atomic_replace_module(utils) is True
success_tmp = os.path.join(tmp, "success.tmp")
success_target = os.path.join(plugin_dir, "success.md")
with open(success_tmp, "w", encoding="utf-8") as handle:
    handle.write("ok")
os.chmod(success_tmp, 0o600)
utils.atomic_replace(success_tmp, success_target)
assert file_mode(success_target) == 0o644

def exdev_replace(_tmp_path, _target):
    raise OSError(errno.EXDEV, "cross-device link")

fallback_utils = types.SimpleNamespace(atomic_replace=exdev_replace)
assert sc._patch_utils_atomic_replace_module(fallback_utils) is True
fallback_tmp = os.path.join(tmp, "fallback.tmp")
fallback_target = os.path.join(plugin_dir, "fallback.md")
with open(fallback_tmp, "w", encoding="utf-8") as handle:
    handle.write("ok")
os.chmod(fallback_tmp, 0o600)
fallback_utils.atomic_replace(fallback_tmp, fallback_target)
assert file_mode(fallback_target) == 0o644

private_tmp = os.path.join(tmp, "private.tmp")
private_target = os.path.join(plugin_dir, "cache", "private.md")
os.makedirs(os.path.dirname(private_target), exist_ok=True)
with open(private_tmp, "w", encoding="utf-8") as handle:
    handle.write("private")
os.chmod(private_tmp, 0o600)
utils_private = types.SimpleNamespace(atomic_replace=original_replace)
assert sc._patch_utils_atomic_replace_module(utils_private) is True
utils_private.atomic_replace(private_tmp, private_target)
assert file_mode(private_target) == 0o600
`;

const result = spawnSync("python3", ["-c", python], {
  cwd: repoRoot,
  env: Object.assign({}, process.env, {
    PYTHONPATH: runtimeOverrides,
    HERMES_MOBILE_MCP_INVENTORY_LOG: "",
  }),
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr || result.stdout);
