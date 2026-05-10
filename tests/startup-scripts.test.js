"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const startHermesWeb = read("start-hermes-web.ps1");
const startWorkerHost = read(path.join("scripts", "start-worker-host.ps1"));
const startGatewayPool = read(path.join("scripts", "start-gateway-pool.ps1"));
const provisionWorkerExternalConnectors = read(path.join("scripts", "provision-worker-external-connectors.ps1"));

assert.match(startHermesWeb, /function Test-HermesWebHttpHealth/);
assert.match(startHermesWeb, /did not open a responsive Hermes Mobile HTTP endpoint/);
assert.match(startHermesWeb, /HTTP health failed/);

assert.match(startWorkerHost, /function Test-HermesMobileHttpHealth/);
assert.match(startWorkerHost, /Worker listener already running and HTTP healthy/);
assert.match(startWorkerHost, /did not open a responsive HTTP endpoint/);

assert.match(startGatewayPool, /function Start-LowGateways/);
assert.match(startGatewayPool, /function Provision-OwnerExternalConnectors/);
assert.match(startGatewayPool, /function Start-OwnerMaintenanceGateways/);
assert.match(startGatewayPool, /provision-worker-external-connectors\.ps1/);
assert.match(startGatewayPool, /HERMES_WEB_GOOGLE_TOKEN_PATH/);
assert.match(startGatewayPool, /Provision-OwnerExternalConnectors\s*\r?\nStart-LowGateways/);
assert.match(startGatewayPool, /\$env:API_SERVER_KEY = \$apiKey/);
assert.match(startGatewayPool, /\$env:WSLENV = "API_SERVER_KEY\/u"/);
assert.match(startGatewayPool, /Gateway pool startup OK; healthy ports/);
assert.doesNotMatch(startGatewayPool, /Write-GatewayPoolLog .*apiKey/i);

assert.match(provisionWorkerExternalConnectors, /external-connectors\/owner/);
assert.match(provisionWorkerExternalConnectors, /google_token\.json/);
assert.match(provisionWorkerExternalConnectors, /microsoft-graph-outlook-mail\/token\.json/);
assert.match(provisionWorkerExternalConnectors, /\[owner-secret-root\]/);
assert.doesNotMatch(provisionWorkerExternalConnectors, /Get-Content\s+-Raw\s+\$GoogleTokenPath/i);
assert.doesNotMatch(provisionWorkerExternalConnectors, /Write-Host .*token/i);

console.log("startup scripts tests passed");
