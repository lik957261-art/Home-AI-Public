"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ASSIGNMENTS = Object.freeze([
  '  HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" \\',
  '  HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" \\',
  '  HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" \\',
  '  HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" \\',
]);
const REQUIRED_FILE_ROOT_EXPORTS = Object.freeze([
  'export HERMES_MOBILE_DOCX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_PPTX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_PPTX_OUTPUT_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_PDF_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_PDF_OUTPUT_ROOTS="$ROOT/data/artifacts"',
  'export HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_IMAGE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_VIDEO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_HTTP_FILE_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
  'export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="$ROOT/data/drive/users"',
  'export HERMES_MOBILE_HTTP_SAVE_ROOT="$ROOT/data/artifacts/http-request"',
  'export HERMES_MOBILE_VIDEO_OUTPUT_ROOT="$ROOT/data/artifacts/grok-videos"',
]);

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    launchDaemonsDir: process.env.HERMES_MOBILE_LAUNCH_DAEMONS_DIR || "/Library/LaunchDaemons",
    execute: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--launch-daemons-dir") out.launchDaemonsDir = argv[++index] || out.launchDaemonsDir;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-gateway-start-script-bridge-env-repair.js [--execute] [--json]",
        "  --root <path>                Mac production root",
        "  --launch-daemons-dir <dir>   LaunchDaemon plist directory",
        "  --execute                    Write repaired start scripts",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmlDecode(value) {
  return String(value || "")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function readPlistStringValues(plistFile, key) {
  let text = "";
  try {
    text = fs.readFileSync(plistFile, "utf8");
  } catch (_) {
    return [];
  }
  const match = text.match(new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*</key>\\s*<array>([\\s\\S]*?)</array>`, "i"));
  if (!match) return [];
  const values = [];
  const pattern = /<string>([\s\S]*?)<\/string>/gi;
  let item;
  while ((item = pattern.exec(match[1]))) values.push(xmlDecode(item[1]));
  return values;
}

function hasEnvAssignment(text, name) {
  return new RegExp(`(^|[\\s\\\\])${escapeRegExp(name)}=`, "m").test(String(text || ""));
}

function insertBeforeExecEnv(text, insertion) {
  if (/^exec env\b/m.test(text)) return text.replace(/^exec env\b/m, `${insertion}\nexec env`);
  return `${text.replace(/\s*$/, "")}\n${insertion}\n`;
}

function ensureBridgeDefinitions(text, root) {
  let next = String(text || "");
  const definitions = [
    'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
    `MOBILE_BRIDGE_HOST_KEY_PATH="\${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-\${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-${root}/data/secrets/bridge-host.secret}}"`,
  ];
  const missing = definitions.filter((line) => !next.includes(line.split("=")[0]));
  if (missing.length) next = insertBeforeExecEnv(next, missing.join("\n"));
  return next;
}

function envNameFromExport(line) {
  return String(line || "").trim().replace(/^export\s+/, "").split("=")[0];
}

function replaceOrAppendExport(text, line) {
  const name = envNameFromExport(line);
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(name)}=.*$`, "m");
  if (pattern.test(text)) {
    const next = text.replace(pattern, line);
    return { text: next, changed: next !== text };
  }
  const next = insertBeforeExecEnv(text, line);
  return { text: next, changed: true };
}

function ensureFileRootDefinitions(text, root) {
  let next = String(text || "");
  let changed = false;
  if (!/^\s*ROOT=/m.test(next)) {
    next = insertBeforeExecEnv(next, `ROOT="${root}"`);
    changed = true;
  }
  if (!/^\s*FILE_PLUGIN_ALLOWED_ROOTS=/m.test(next)) {
    next = insertBeforeExecEnv(next, 'FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"');
    changed = true;
  }
  for (const line of REQUIRED_FILE_ROOT_EXPORTS) {
    const patched = replaceOrAppendExport(next, line);
    next = patched.text;
    changed = changed || patched.changed;
  }
  return { text: next, changed };
}

function ensureBridgeAssignments(text, root) {
  const fileRoots = ensureFileRootDefinitions(text, root);
  let next = ensureBridgeDefinitions(fileRoots.text, root);
  let changed = fileRoots.changed || next !== fileRoots.text;
  const missing = REQUIRED_ASSIGNMENTS.filter((line) => {
    const name = line.trim().split("=")[0];
    return !hasEnvAssignment(next, name);
  });
  if (!missing.length) return { text: next, changed: changed || next !== text };
  const block = missing.join("\n");
  if (/^\s*PYTHONPATH=/m.test(next)) {
    next = next.replace(/^(\s*PYTHONPATH=)/m, `${block}\n$1`);
  } else if (/^\s*API_SERVER_KEY=/m.test(next)) {
    next = next.replace(/^(\s*API_SERVER_KEY=)/m, `${block}\n$1`);
  } else if (/^exec env\b/m.test(next)) {
    next = next.replace(/^exec env\b/m, `exec env \\\n${block}`);
  } else {
    next = `${next.replace(/\s*$/, "")}\n${block}\n`;
  }
  return { text: next, changed: true };
}

function installedGatewayStartScripts(launchDaemonsDir) {
  let names = [];
  try {
    names = fs.readdirSync(launchDaemonsDir);
  } catch (_) {
    return [];
  }
  return names
    .filter((name) => /^com\.hermesmobile\.gateway\..+\.plist$/i.test(name))
    .sort()
    .map((name) => {
      const plistPath = path.join(launchDaemonsDir, name);
      const args = readPlistStringValues(plistPath, "ProgramArguments");
      return {
        label: name.replace(/\.plist$/i, ""),
        plistPath,
        startScriptPath: args.find((arg) => String(arg || "").endsWith(".sh")) || "",
      };
    });
}

function gatewayWorkspaceStartScripts(usersRoot) {
  let users = [];
  try {
    users = fs.readdirSync(usersRoot, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const rows = [];
  for (const user of users) {
    if (!user.isDirectory() || user.name.startsWith(".")) continue;
    const gatewayDir = path.join(usersRoot, user.name, "HermesWorkspace", ".hermes-gateway");
    let entries = [];
    try {
      entries = fs.readdirSync(gatewayDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/^start-.+\.sh$/i.test(entry.name)) continue;
      rows.push({
        label: `workspace-start-script:${user.name}:${entry.name}`,
        plistPath: "",
        startScriptPath: path.join(gatewayDir, entry.name),
      });
    }
  }
  return rows.sort((a, b) => a.startScriptPath.localeCompare(b.startScriptPath));
}

function repairGatewayStartScripts(options = {}) {
  const root = path.resolve(options.root || "/Users/example/path");
  const launchDaemonsDir = options.launchDaemonsDir || "/Library/LaunchDaemons";
  const usersRoot = options.usersRoot || path.dirname(path.dirname(root));
  const execute = options.execute === true;
  const rows = [];
  const seen = new Set();
  const candidates = installedGatewayStartScripts(launchDaemonsDir).concat(gatewayWorkspaceStartScripts(usersRoot))
    .filter((item) => {
      const key = String(item.startScriptPath || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  for (const item of candidates) {
    const row = Object.assign({ exists: false, changed: false, written: false, error: "" }, item);
    if (!item.startScriptPath) {
      row.error = "start_script_path_missing";
      rows.push(row);
      continue;
    }
    let text = "";
    try {
      text = fs.readFileSync(item.startScriptPath, "utf8");
      row.exists = true;
    } catch (err) {
      row.error = `start_script_unreadable:${err?.code || err?.name || "error"}`;
      rows.push(row);
      continue;
    }
    const patched = ensureBridgeAssignments(text, root);
    row.changed = patched.changed;
    if (execute && patched.changed) {
      fs.writeFileSync(item.startScriptPath, patched.text, "utf8");
      try { fs.chmodSync(item.startScriptPath, 0o755); } catch (_) {}
      row.written = true;
    }
    rows.push(row);
  }
  return {
    ok: rows.every((row) => !row.error),
    execute,
    scanned: rows.length,
    changed: rows.filter((row) => row.changed).length,
    written: rows.filter((row) => row.written).length,
    errors: rows.filter((row) => row.error).map((row) => `${row.label}:${row.error}`),
    rows,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = repairGatewayStartScripts(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`macos_gateway_start_script_bridge_env_repair ok=${result.ok} scanned=${result.scanned} changed=${result.changed} written=${result.written}`);
    if (!result.ok) process.exit(1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  ensureBridgeAssignments,
  ensureFileRootDefinitions,
  gatewayWorkspaceStartScripts,
  repairGatewayStartScripts,
};
