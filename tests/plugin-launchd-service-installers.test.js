"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const codexRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-codex-mobile-runtime-"));
const codexProfileFile = path.join(codexRuntimeRoot, "codex-profiles.json");
fs.writeFileSync(codexProfileFile, JSON.stringify({
  activeProfileId: "previous",
  profiles: [
    { id: "default", label: "Default", codexHome: "/Users/xuxin/.codex" },
    { id: "previous", label: "Previous", codexHome: "/Users/xuxin/.codex-homes/previous" },
  ],
}, null, 2));

const cases = [
  {
    modulePath: "../scripts/install-codex-mobile-launchd-service",
    label: "com.hermesmobile.plugin.codex-mobile",
    pluginRoot: "/tmp/Hermes Mobile/plugins/codex-mobile-web",
    script: "server.js",
    portKey: "CODEX_MOBILE_PORT",
    port: "8787",
    args: ["--profile-file", codexProfileFile, "--runtime-root", codexRuntimeRoot],
    extra: [
      /<key>CODEX_HOME<\/key>\s*<string>\/Users\/xuxin\/\.codex-homes\/previous<\/string>/,
      /<key>CODEX_MOBILE_PROFILE_FILE<\/key>/,
      /<key>CODEX_MOBILE_REQUIRE_SHARED_APP_SERVER<\/key>\s*<string>1<\/string>/,
      /<key>CODEX_MOBILE_PERSIST_OWNED_MUX<\/key>\s*<string>1<\/string>/,
      /<key>CODEX_MOBILE_DISABLE_OWNED_MUX<\/key>\s*<string>0<\/string>/,
      /<key>CODEX_MOBILE_MUX_ENDPOINT_FILE<\/key>/,
      /\/Users\/xuxin\/\.codex-homes\/previous\/app-server-mux\/endpoint\.json/,
      /<string>xuxin<\/string>/,
    ],
  },
  {
    modulePath: "../scripts/install-email-launchd-service",
    label: "com.hermesmobile.plugin.email",
    pluginRoot: "/tmp/Hermes Mobile/plugins/email",
    script: "npm",
    portKey: "EMAIL_SERVICE_PORT",
    port: "5175",
    extra: [
      /<string>run<\/string>\s*<string>service<\/string>/,
      /<key>EMAIL_PLUGIN_RUNTIME_DIR<\/key>/,
      /<key>EMAIL_SERVICE_STATIC_ROOT<\/key>/,
    ],
  },
  {
    modulePath: "../scripts/install-finance-launchd-service",
    label: "com.hermesmobile.plugin.finance",
    pluginRoot: "/tmp/Hermes Mobile/plugins/finance",
    script: "server.js",
    portKey: "FINANCE_MCP_PORT",
    port: "8791",
    extra: [
      /<key>FINANCE_MCP_DB_PATH<\/key>/,
      /finance\.sqlite3/,
      /<key>FINANCE_HERMES_OWNER_WORKSPACE_ID<\/key>\s*<string>owner<\/string>/,
    ],
  },
  {
    modulePath: "../scripts/install-health-launchd-service",
    label: "com.hermesmobile.plugin.health",
    pluginRoot: "/tmp/Hermes Mobile/plugins/healthy",
    script: "src/app/http-server.js",
    portKey: "HEALTHY_PORT",
    port: "4877",
    extra: [
      /<key>HEALTHY_DB_PATH<\/key>/,
      /healthy\.sqlite/,
      /<key>HEALTHY_REGISTRATION_KEY_PATH<\/key>/,
    ],
  },
  {
    modulePath: "../scripts/install-movie-launchd-service",
    label: "com.hermesmobile.plugin.movie",
    pluginRoot: "/tmp/Hermes Mobile/plugins/movie",
    script: "src/server.js",
    portKey: "PORT",
    port: "4195",
    extra: [
      /<key>MOVIE_PORT<\/key>\s*<string>4195<\/string>/,
      /<key>MOVIE_DATA_DIR<\/key>/,
      /plugins\/movie\/data/,
      /<key>MOVIE_PUBLIC_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:4195<\/string>/,
    ],
  },
  {
    modulePath: "../scripts/install-note-launchd-service",
    label: "com.hermesmobile.plugin.note",
    pluginRoot: "/tmp/Hermes Mobile/plugins/note",
    script: "scripts/note-server.js",
    portKey: "PORT",
    port: "4181",
    extra: [
      /<key>NOTE_DB_PATH<\/key>/,
      /note\.sqlite3/,
      /<key>NOTE_ATTACHMENT_ROOT<\/key>/,
    ],
  },
  {
    modulePath: "../scripts/install-wardrobe-launchd-service",
    label: "com.hermesmobile.plugin.wardrobe",
    pluginRoot: "/tmp/Hermes Mobile/plugins/wardrobe",
    script: "app.py",
    portKey: "WARDROBE_PORT",
    port: "8765",
    extra: [
      /<key>PYTHONUNBUFFERED<\/key>\s*<string>1<\/string>/,
      /<key>WARDROBE_API_TOKEN_SECRET_DIR<\/key>/,
      /<key>WARDROBE_HERMES_PLUGIN_FRAME_ANCESTORS<\/key>/,
    ],
  },
];

for (const item of cases) {
  const installer = require(item.modulePath);
  const options = installer.parseArgs([
    "--mac-root",
    "/tmp/Hermes Mobile",
    "--launch-daemons-dir",
    "/tmp/LaunchDaemons",
    "--host",
    "127.0.0.1",
    "--port",
    item.port,
    "--json",
    ...(item.args || []),
  ]);
  const currentPlan = installer.plan(options);
  assert.equal(currentPlan.label, item.label);
  assert.equal(currentPlan.plistPath, path.join("/tmp/LaunchDaemons", `${item.label}.plist`));
  assert.equal(currentPlan.pluginRoot, item.pluginRoot);
  assert.equal(currentPlan.port, item.port);

  const plist = installer.plistFor(options);
  assert.match(plist, new RegExp(`<string>${item.label.replaceAll(".", "\\.")}<\\/string>`));
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(plist, new RegExp(`<key>${item.portKey}<\\/key>\\s*<string>${item.port}<\\/string>`));
  assert.match(plist, new RegExp(item.script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(plist, new RegExp(`plugin-${currentPlan.pluginId}\\.out\\.log`));
  assert.match(plist, new RegExp(`plugin-${currentPlan.pluginId}\\.err\\.log`));
  assert.doesNotMatch(plist, /ACCESS_KEY<\/key>\s*<string>[^/<][^<]*<\/string>/);
  assert.doesNotMatch(plist, /PASSWORD<\/key>\s*<string>[^/<][^<]*<\/string>/);
  assert.doesNotMatch(plist, /TOKEN<\/key>\s*<string>[^/<][^<]*<\/string>/);
  for (const pattern of item.extra) assert.match(plist, pattern);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-finance-launchd-"));
  const financeDir = path.join(root, "data", "drive", "users", "owner", ".hermes-finance");
  fs.mkdirSync(financeDir, { recursive: true });
  fs.writeFileSync(path.join(financeDir, "config.json"), JSON.stringify({
    schema_version: 1,
    workspace_id: "owner",
    hermes_workspace_id: "owner",
    access_key_file: "access-key.txt",
  }, null, 2));
  fs.writeFileSync(path.join(financeDir, "access-key.txt"), "finance-secret\n", { mode: 0o600 });
  const installer = require("../scripts/install-finance-launchd-service");
  const options = installer.parseArgs(["--mac-root", root, "--launch-daemons-dir", path.join(root, "launchd"), "--json"]);
  const plist = installer.plistFor(options);
  const expectedHash = `sha256:${crypto.createHash("sha256").update("owner:finance-secret").digest("hex")}`;
  assert.match(plist, /<key>FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON<\/key>/);
  assert.match(plist, new RegExp(expectedHash));
  assert.match(plist, /<key>FINANCE_HERMES_ALLOWED_WORKSPACES<\/key>\s*<string>owner<\/string>/);
  assert.doesNotMatch(plist, /finance-secret/);
  assert.deepEqual(installer.financeWorkspaceKeyHashInfo(root).workspaceIds, ["owner"]);
}

console.log("plugin launchd service installer tests passed");
