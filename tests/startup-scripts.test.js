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
const repairWorkspaceAcl = read(path.join("scripts", "repair-workspace-acl.ps1"));
const runKanbanGatewayWorker = read(path.join("scripts", "run-kanban-gateway-worker.ps1"));
const runKanbanGatewayWorkerChild = read(path.join("scripts", "run-kanban-gateway-worker-child.ps1"));
const runKanbanGatewayWorkerShell = read(path.join("scripts", "run-kanban-gateway-worker.sh"));

assert.match(startHermesWeb, /function Test-HermesWebHttpHealth/);
assert.match(startHermesWeb, /did not open a responsive Hermes Mobile HTTP endpoint/);
assert.match(startHermesWeb, /HTTP health failed/);

assert.match(startWorkerHost, /function Test-HermesMobileHttpHealth/);
assert.match(startWorkerHost, /Worker listener already running and HTTP healthy/);
assert.match(startWorkerHost, /did not open a responsive HTTP endpoint/);

assert.match(startGatewayPool, /function Start-LowGateways/);
assert.match(startGatewayPool, /function Provision-OwnerExternalConnectors/);
assert.match(startGatewayPool, /function Start-OwnerMaintenanceGateways/);
assert.match(startGatewayPool, /function Resolve-ConnectorPath/);
assert.match(startGatewayPool, /function Ensure-LowGatewayProfileEnv/);
assert.match(startGatewayPool, /provision-worker-external-connectors\.ps1/);
assert.match(startGatewayPool, /HERMES_WEB_GOOGLE_TOKEN_PATH/);
assert.match(startGatewayPool, /HERMES_GOOGLE_PROFILE_HOME/);
assert.match(startGatewayPool, /google_token\.json/);
assert.match(startGatewayPool, /google_client_secret\.json/);
assert.match(startGatewayPool, /microsoft-graph-outlook-mail\\token\.json/);
assert.match(startGatewayPool, /Provision-OwnerExternalConnectors\s*\r?\nStart-LowGateways/);
assert.match(startGatewayPool, /\$env:API_SERVER_KEY = \$apiKey/);
assert.match(startGatewayPool, /\$env:WSLENV = "API_SERVER_KEY\/u"/);
assert.match(startGatewayPool, /PYTHONPATH=\$officialCleanRoot/);
assert.match(startGatewayPool, /\$officialPython -m hermes_cli\.main/);
assert.doesNotMatch(startGatewayPool, /\/home\/\$OfficialUser\/\.local\/bin\/hermes/);
assert.match(startGatewayPool, /Gateway pool startup OK; healthy ports/);
assert.doesNotMatch(startGatewayPool, /Write-GatewayPoolLog .*apiKey/i);

assert.match(provisionWorkerExternalConnectors, /external-connectors\/owner/);
assert.match(provisionWorkerExternalConnectors, /google_token\.json/);
assert.match(provisionWorkerExternalConnectors, /microsoft-graph-outlook-mail\/token\.json/);
assert.match(provisionWorkerExternalConnectors, /patch_google_workspace_skill\(\)/);
assert.match(provisionWorkerExternalConnectors, /HERMES_GOOGLE_RUNTIME_REEXEC/);
assert.match(provisionWorkerExternalConnectors, /profiles.*<profile>.*skills/s);
assert.match(provisionWorkerExternalConnectors, /HERMES_GOOGLE_PROFILE_HOME="\`\$profile_dir" python3 "\`\$google_setup" --check/);
assert.match(provisionWorkerExternalConnectors, /google_workspace_setup_check=ok/);
assert.match(provisionWorkerExternalConnectors, /\[owner-secret-root\]/);
assert.doesNotMatch(provisionWorkerExternalConnectors, /Get-Content\s+-Raw\s+\$GoogleTokenPath/i);
assert.doesNotMatch(provisionWorkerExternalConnectors, /Write-Host .*token/i);

assert.match(repairWorkspaceAcl, /\[string\]\$WorkspaceRoot/);
assert.match(repairWorkspaceAcl, /HermesMobileWorker/);
assert.match(repairWorkspaceAcl, /\[switch\]\$CheckOnly/);
assert.match(repairWorkspaceAcl, /icacls \$root \/grant \$grant/);
assert.match(repairWorkspaceAcl, /missingWorkerRead/);

assert.match(runKanbanGatewayWorker, /ValueFromRemainingArguments/);
assert.match(runKanbanGatewayWorker, /PositionalBinding\s*=\s*\$false/);
assert.match(runKanbanGatewayWorker, /HermesGatewayWorker/);
assert.match(runKanbanGatewayWorker, /run-as-worker\.ps1/);
assert.match(runKanbanGatewayWorker, /PayloadBase64/);
assert.match(runKanbanGatewayWorker, /kanbanArgs = \$KanbanArgs/);
assert.match(runKanbanGatewayWorker, /kanban-runner/);
assert.match(runKanbanGatewayWorker, /Copy-Item -LiteralPath \$sourceShellScript/);
assert.match(runKanbanGatewayWorker, /run-kanban-gateway-worker-child-\$stamp\.ps1/);
assert.match(runKanbanGatewayWorker, /run-kanban-gateway-worker-\$stamp\.sh/);
assert.match(runKanbanGatewayWorker, /run-kanban-command-\$stamp\.ps1/);
assert.match(runKanbanGatewayWorker, /Remove-Item -LiteralPath \$childScript/);
assert.match(runKanbanGatewayWorker, /Remove-Item -LiteralPath \$shellScript/);
assert.doesNotMatch(runKanbanGatewayWorker, /-ChildArgs/);

assert.match(runKanbanGatewayWorkerChild, /Convert-ToWslPath/);
assert.match(runKanbanGatewayWorkerChild, /wsl\.exe -d \$distroName -u root/);
assert.match(runKanbanGatewayWorkerChild, /PayloadBase64/);

assert.match(runKanbanGatewayWorkerShell, /runuser/);
assert.match(runKanbanGatewayWorkerShell, /-u",\s*"hermes"/);
assert.match(runKanbanGatewayWorkerShell, /PYTHONPATH=\/opt\/hermes-gateway-runtime\/official-clean/);
assert.match(runKanbanGatewayWorkerShell, /hermes_cli\.main/);
assert.match(runKanbanGatewayWorkerShell, /kanban_args/);
assert.match(runKanbanGatewayWorkerShell, /capture_output=True/);
assert.match(runKanbanGatewayWorkerShell, /ensure_ascii=True/);

console.log("startup scripts tests passed");
