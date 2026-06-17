"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/macos-wardrobe-binding-production-smoke.js");
const wardrobeDoc = read("docs/MODULES/wardrobe.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const runbook = read("docs/RUNBOOKS/macos-production-closure-validation.md");

assert.match(script, /X-Hermes-Web-Key/);
assert.match(script, /HERMES_MOBILE_WARDROBE_EXPECTED_ORIGIN/);
assert.match(script, /http:\/\/127\.0\.0\.1:8765/);
assert.match(script, /http:\/\/192\.168\.10\.99:8765/);
assert.match(script, /\/api\/hermes-plugins\/wardrobe\/manifest/);
assert.match(script, /\/api\/hermes-plugins\/wardrobe\/proxy\/api\/bootstrap-status/);
assert.match(script, /launch_token_issued/);
assert.match(script, /item_count/);
assert.match(script, /wd_live_/);
assert.match(script, /bindingRows\.length > 0/);
assert.doesNotMatch(script, /console\.log\(.*accessKeyFile/);
assert.doesNotMatch(script, /console\.error\(.*accessKeyFile/);
assert.doesNotMatch(script, /console\.log\(.*key/);

assert.match(wardrobeDoc, /macos-wardrobe-binding-production-smoke\.js/);
assert.match(deploymentDoc, /macos-wardrobe-binding-production-smoke\.js/);
assert.match(runbook, /macos-wardrobe-binding-production-smoke\.js/);

const {
  AUTH_HEADER,
  absoluteUrl,
  compactPath,
  compactUrl,
  mergeCookieHeader,
  parseArgs,
  readWardrobeBindingRows,
  setCookieHeader,
} = require("../scripts/macos-wardrobe-binding-production-smoke");

const parsed = parseArgs([]);
assert.equal(parsed.root, "/Users/example/path");
assert.equal(parsed.base, "http://127.0.0.1:8797");
assert.equal(parsed.expectedOrigin, "http://127.0.0.1:8765");
assert.equal(parsed.legacyOrigin, "http://192.168.10.99:8765");
assert.deepEqual(parsed.workspaces, ["weixin_wuping"]);
assert.equal(AUTH_HEADER, "X-Hermes-Web-Key");
assert.equal(
  absoluteUrl("/api/hermes-plugins/wardrobe/proxy/?launch=once", parsed.base),
  "http://127.0.0.1:8797/api/hermes-plugins/wardrobe/proxy/?launch=once",
);

assert.equal(
  compactPath("/Users/example/path", parsed.root),
  "<HERMES_MOBILE_ROOT>/data/drive/users/weixin_wuping/.hermes-wardrobe/config.json",
);
assert.deepEqual(
  compactUrl("http://127.0.0.1:8797/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=once&workspaceId=weixin_wuping"),
  {
    origin: "http://127.0.0.1:8797",
    path: "/api/hermes-plugins/wardrobe/proxy/",
    searchKeys: ["embed", "launch", "workspaceId"],
    hasLaunchParam: true,
  },
);

const cookieHeaders = {
  getSetCookie: () => ["wardrobe_session=a; Path=/; HttpOnly", "theme=b; Path=/"],
};
assert.equal(setCookieHeader(cookieHeaders), "wardrobe_session=a; theme=b");
assert.equal(mergeCookieHeader("wardrobe_session=old", ["wardrobe_session=new", "theme=b"]), "wardrobe_session=new; theme=b");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wardrobe-binding-smoke-"));
const configDir = path.join(tmpRoot, "data", "drive", "users", "weixin_wuping", ".hermes-wardrobe");
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, "config.json"), `${JSON.stringify({
  api_base_url: "http://127.0.0.1:8765",
  workspace_id: "weixin_wuping",
  hermes_workspace_id: "weixin_wuping",
}, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(configDir, "access-key.txt"), "wd_live_test_key\n", "utf8");
const rows = readWardrobeBindingRows(Object.assign({}, parsed, { root: tmpRoot }));
assert.equal(rows.length, 1);
assert.equal(rows[0].ok, true);
assert.equal(rows[0].apiBaseOrigin, "http://127.0.0.1:8765");
assert.equal(rows[0].keyShape.prefixOk, true);

console.log("macOS Wardrobe binding production smoke harness tests passed");
