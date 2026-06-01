"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-nas-static-assets.ps1");
const script = fs.readFileSync(scriptPath, "utf8");

assert.match(script, /param\([\s\S]*\$NasHost = "192\.168\.10\.99"/);
assert.match(script, /\$NasUser = "xuxinxp"/);
assert.match(script, /\$NasPort = 2222/);
assert.match(script, /synology_ed25519/);

assert.match(script, /public\/index\.html/);
assert.match(script, /public\/service-worker\.js/);
assert.match(script, /public\/directory-viewer\.html/);
assert.match(script, /tests\/task-list-ui\.test\.js/);

assert.match(script, /owner-web-key\.secret/);
assert.match(script, /api\/status\?detail=1/);
assert.match(script, /activeGlobal/);
assert.match(script, /NAS has active runs; aborting static deploy/);

assert.match(script, /\$RemoteRoot\/backups\/\$Version-\$stamp/);
assert.match(script, /\$RemoteRoot\/app/);
assert.match(script, /\$RemoteRoot\/source/);

assert.match(script, /\$tarArgs = @\("-cf", \$tarPath\) \+ \$RelFiles/);
assert.match(script, /tar\.exe @tarArgs/);
assert.match(script, /\$null = Invoke-NasSsh "set -e/);
assert.match(script, /Convert\]::ToBase64String/);
assert.match(script, /cmd\.exe \/d \/c \$uploadCommand/);
assert.match(script, /cat > ' \+ \$remoteB64/);
assert.match(script, /base64\.b64decode/);
assert.doesNotMatch(script, /\bscp\b/);
assert.doesNotMatch(script, /\bsftp\b/);

assert.match(script, /sha256sum \$fileList/);
assert.match(script, /hash mismatch for \$file/);

assert.match(script, /runtime\/node-v22\.22\.3-linux-x64\/bin\/node/);
assert.match(script, /--check public\/service-worker\.js/);
assert.match(script, /tests\/task-list-ui\.test\.js/);
assert.match(script, /tests\/static-cache-version-harness\.test\.js/);

assert.match(script, /api\/client-version\?clientVersion=\$Version/);
assert.match(script, /wardrobe-xuxin\.synology\.me:8555/);
assert.match(script, /public origin HTML does not contain \$Version/);

assert.doesNotMatch(script, /echo\s+\$key/i);
assert.doesNotMatch(script, /Write-Host\s+.*key/i);
assert.doesNotMatch(script, /ConvertTo-Json[\s\S]{0,120}owner-web-key\.secret/);

console.log("NAS static deploy harness passed");
