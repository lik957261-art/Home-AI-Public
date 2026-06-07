"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildAudit } = require("./macos-production-profile-audit");

const VERSION = "20260607-docx-root-smoke";
const DEFAULT_ALLOWED_ROOTS = ["data/drive", "data/uploads", "data/artifacts"];

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/hermes-host/HermesMobile",
    profiles: [],
    python: "",
    keep: false,
    json: false,
    strict: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--profiles") out.profiles = splitCsv(argv[++index] || "");
    else if (arg === "--python") out.python = argv[++index] || "";
    else if (arg === "--keep") out.keep = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--no-strict") out.strict = false;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-file-plugin-docx-root-smoke.js --root <HermesMobile root> [options]",
        "  --profiles <ids>  Comma-separated Gateway profile ids. Defaults to all enabled openai-codex user profiles.",
        "  --python <path>    Python executable. Defaults to Hermes official runtime venv, then python3.",
        "  --keep             Keep the generated smoke DOCX.",
        "  --json             Print bounded JSON metadata.",
        "  --no-strict        Report issues without a failing exit code.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function compactPath(value, root) {
  return String(value || "").replaceAll(root, "<root>");
}

function resolveRootPath(root, rel) {
  return path.join(root, ...String(rel || "").split("/"));
}

function defaultPython(root) {
  const official = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
  if (fs.existsSync(official)) return official;
  return "python3";
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name, content) {
  const nameBuffer = Buffer.from(name, "utf8");
  const raw = Buffer.from(content, "utf8");
  return {
    nameBuffer,
    raw,
    compressed: raw,
    method: 0,
    crc: crc32(raw),
  };
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = Buffer.alloc(30 + entry.nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.compressed.length, 18);
    local.writeUInt32LE(entry.raw.length, 22);
    local.writeUInt16LE(entry.nameBuffer.length, 26);
    entry.nameBuffer.copy(local, 30);
    locals.push(local, entry.compressed);

    const central = Buffer.alloc(46 + entry.nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.raw.length, 24);
    central.writeUInt16LE(entry.nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    entry.nameBuffer.copy(central, 46);
    centrals.push(central);
    offset += local.length + entry.compressed.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function minimalDocxXml() {
  return [
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "  <w:body>",
    "    <w:p><w:r><w:t>Hermes DOCX smoke</w:t></w:r></w:p>",
    "  </w:body>",
    "</w:document>",
  ].join("\n");
}

function makeMinimalDocxBuffer() {
  return makeZip([
    zipEntry("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    zipEntry("word/document.xml", minimalDocxXml()),
  ]);
}

function writeSmokeDocx(root) {
  const dir = path.join(root, "data", "uploads", "docx-root-smoke");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `docx-root-smoke-${process.pid}-${Date.now()}.docx`);
  fs.writeFileSync(file, makeMinimalDocxBuffer());
  return file;
}

function targetProfiles(audit, requestedProfiles = []) {
  const requested = new Set(requestedProfiles);
  return (audit.profileChecks || []).filter((check) => {
    if (requested.size) return requested.has(check.profile);
    return check.provider === "openai-codex" && check.securityLevel === "user";
  });
}

function pluginPathForProfile(profileCheck) {
  return path.join(profileCheck.profileDir, "plugins", "hermes-mobile-docx", "__init__.py");
}

function invokeDocxPlugin({ python, pluginPath, docxFile, allowedRoots }) {
  const code = [
    "import importlib.util, json, sys",
    "plugin_path = sys.argv[1]",
    "docx_file = sys.argv[2]",
    "spec = importlib.util.spec_from_file_location('hermes_mobile_docx_smoke', plugin_path)",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "raw = module._docx_extract_text_handler({'file_path': docx_file, 'max_chars': 1000})",
    "print(raw)",
  ].join("\n");
  const result = spawnSync(python, ["-c", code, pluginPath, docxFile], {
    encoding: "utf8",
    env: {
      ...process.env,
      HERMES_MOBILE_DOCX_ALLOWED_ROOTS: allowedRoots.join(","),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result;
}

function runSmoke(options) {
  const root = path.resolve(options.root);
  const python = options.python || defaultPython(root);
  const audit = buildAudit({
    root,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredWorkspaceSkillPlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    strict: false,
  });
  const profiles = targetProfiles(audit, options.profiles);
  const issues = [];
  const results = [];
  if (!profiles.length) issues.push(options.profiles.length ? "requested_profiles_not_found" : "no_openai_user_profiles_found");
  const allowedRoots = DEFAULT_ALLOWED_ROOTS.map((rel) => resolveRootPath(root, rel));
  const rootIssues = (audit.issues || []).filter((item) => /^file_plugin_/.test(item));
  for (const issue of rootIssues) issues.push(issue);
  const docxFile = writeSmokeDocx(root);
  try {
    for (const profileCheck of profiles) {
      const pluginPath = pluginPathForProfile(profileCheck);
      const result = {
        profile: profileCheck.profile,
        workspaceId: profileCheck.workspaceId,
        osUser: profileCheck.osUser,
        pluginPath: compactPath(pluginPath, root),
        ok: false,
        error: "",
        totalChars: 0,
      };
      if (!fs.existsSync(pluginPath)) {
        result.error = "docx_plugin_missing";
        issues.push(`docx_plugin_missing:${profileCheck.profile}`);
        results.push(result);
        continue;
      }
      const child = invokeDocxPlugin({ python, pluginPath, docxFile, allowedRoots });
      if (child.status !== 0) {
        result.error = `python_exit_${child.status}:${String(child.stderr || "").trim().slice(0, 160)}`;
        issues.push(`docx_plugin_python_failed:${profileCheck.profile}`);
        results.push(result);
        continue;
      }
      let payload = null;
      try {
        payload = JSON.parse(String(child.stdout || "").trim());
      } catch (err) {
        result.error = `json_parse_failed:${err.message}`;
        issues.push(`docx_plugin_json_parse_failed:${profileCheck.profile}`);
        results.push(result);
        continue;
      }
      result.ok = Boolean(payload.ok);
      result.error = String(payload.error || "");
      result.totalChars = Number(payload.totalChars || 0);
      if (!payload.ok) {
        if (result.error === "file_path_outside_allowed_roots") {
          issues.push(`docx_plugin_file_path_outside_allowed_roots:${profileCheck.profile}`);
        } else {
          issues.push(`docx_plugin_extract_failed:${profileCheck.profile}:${result.error || "unknown"}`);
        }
      } else if (!result.totalChars) {
        issues.push(`docx_plugin_extract_empty:${profileCheck.profile}`);
      }
      results.push(result);
    }
  } finally {
    if (!options.keep) {
      try {
        fs.rmSync(path.dirname(docxFile), { recursive: true, force: true });
      } catch (_) {}
    }
  }
  return {
    ok: issues.length === 0,
    version: VERSION,
    root: compactPath(root, root),
    python,
    docxFile: options.keep ? compactPath(docxFile, root) : "",
    checkedProfiles: results.length,
    allowedRoots: allowedRoots.map((item) => compactPath(item, root)),
    results,
    issues,
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const report = runSmoke(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`macos_file_plugin_docx_root_smoke ok=${report.ok} profiles=${report.checkedProfiles} issues=${report.issues.length}`);
    for (const item of report.results) {
      console.log(`profile ${item.profile} ok=${item.ok} chars=${item.totalChars} error=${item.error || ""}`);
    }
    for (const item of report.issues) console.log(`issue ${item}`);
  }
  if (options.strict && !report.ok) process.exit(1);
}

module.exports = {
  VERSION,
  crc32,
  makeMinimalDocxBuffer,
  parseArgs,
  runSmoke,
  targetProfiles,
};
