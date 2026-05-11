"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const startHermesWeb = read("start-hermes-web.ps1");
const server = read("server.js");
const startWorkerHost = read(path.join("scripts", "start-worker-host.ps1"));
const startGatewayPool = read(path.join("scripts", "start-gateway-pool.ps1"));
const provisionWorkerExternalConnectors = read(path.join("scripts", "provision-worker-external-connectors.ps1"));
const repairWorkspaceAcl = read(path.join("scripts", "repair-workspace-acl.ps1"));
const runKanbanGatewayWorker = read(path.join("scripts", "run-kanban-gateway-worker.ps1"));
const runKanbanGatewayWorkerChild = read(path.join("scripts", "run-kanban-gateway-worker-child.ps1"));
const runKanbanGatewayWorkerShell = read(path.join("scripts", "run-kanban-gateway-worker.sh"));
const startCronTickSidecar = read(path.join("scripts", "start-cron-tick-sidecar.ps1"));
const runCronTickSidecar = read(path.join("scripts", "run-cron-tick-sidecar.ps1"));

assert.match(startHermesWeb, /function Test-HermesWebHttpHealth/);
assert.match(startHermesWeb, /did not open a responsive Hermes Mobile HTTP endpoint/);
assert.match(startHermesWeb, /HTTP health failed/);
assert.match(startHermesWeb, /function Start-CronTickSidecarIfNeeded/);
assert.match(startHermesWeb, /HERMES_WEB_AUTOMATION_BACKEND/);
assert.match(startHermesWeb, /hermes_cron/);
assert.match(startHermesWeb, /start-cron-tick-sidecar\.ps1/);
assert.match(startHermesWeb, /HERMES_MOBILE_CRON_TICK_SIDECAR/);
assert.match(startHermesWeb, /Start-CronTickSidecarIfNeeded\s*\r?\n\s*\$existing = Get-HermesWebListener/s);

assert.match(startWorkerHost, /function Test-HermesMobileHttpHealth/);
assert.match(startWorkerHost, /function Test-HermesMobileAuthenticatedHealth/);
assert.match(startWorkerHost, /function Test-GatewayPoolPortHealth/);
assert.match(startWorkerHost, /X-Hermes-Web-Key/);
assert.match(startWorkerHost, /api\/client-version\?clientVersion=startup-health/);
assert.match(startWorkerHost, /Worker listener already running and authenticated API plus Gateway Pool ports are healthy/);
assert.match(startWorkerHost, /Restarting unhealthy worker listener/);
assert.match(startWorkerHost, /healthy authenticated API endpoint with ready Gateway Pool ports/);
assert.match(startWorkerHost, /MinGatewayPoolWorkers/);
assert.match(startWorkerHost, /GatewayPoolPorts/);

assert.match(server, /HERMES_MOBILE_WEB_PUSH_START_DELAY_MS/);
assert.match(server, /HERMES_WEB_TODO_PUSH_START_DELAY_MS/);
assert.match(server, /HERMES_WEB_AUTOMATION_PUSH_START_DELAY_MS/);
assert.match(server, /120000/);
assert.match(server, /function scheduleBackgroundWebPushDispatcher/);
assert.doesNotMatch(server, /setTimeout\(tick, 8000\)/);
assert.doesNotMatch(server, /setTimeout\(tick, 12000\)/);

assert.match(startGatewayPool, /function Start-LowGateways/);
assert.match(startGatewayPool, /function Provision-OwnerExternalConnectors/);
assert.match(startGatewayPool, /function Start-OwnerMaintenanceGateways/);
assert.match(startGatewayPool, /function Resolve-ConnectorPath/);
assert.match(startGatewayPool, /function Ensure-LowGatewayProfileEnv/);
assert.match(startGatewayPool, /provision-worker-external-connectors\.ps1/);
assert.match(startGatewayPool, /HERMES_WEB_GOOGLE_TOKEN_PATH/);
assert.match(startGatewayPool, /HERMES_GOOGLE_PROFILE_HOME/);
assert.match(startGatewayPool, /runtime_bin="\$\{HERMES_GATEWAY_RUNTIME_BIN:-\$runtime_root\/bin\}"/);
assert.match(startGatewayPool, /cat > "\$runtime_bin\/hermes"/);
assert.match(startGatewayPool, /PATH="\$low_gateway_path"/);
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
assert.match(runKanbanGatewayWorker, /\[string\]\$WorkerUserName = "HermesMobileWorker"/);
assert.match(runKanbanGatewayWorker, /function Current-UserName/);
assert.match(runKanbanGatewayWorker, /Current-UserName\) -ieq \$WorkerUserName/);
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
assert.match(runKanbanGatewayWorkerShell, /runtime_bin="\$\{HERMES_GATEWAY_RUNTIME_BIN:-\$runtime_root\/bin\}"/);
assert.match(runKanbanGatewayWorkerShell, /hermes_shim="\$runtime_bin\/hermes"/);
assert.match(runKanbanGatewayWorkerShell, /exec "\$runtime_python" -m hermes_cli\.main "\\\$@"/);
assert.match(runKanbanGatewayWorkerShell, /PYTHONPATH=\{runtime_source\}/);
assert.match(runKanbanGatewayWorkerShell, /PATH=\{runtime_bin\}:\{runtime_root\}\/venv\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin/);
assert.match(runKanbanGatewayWorkerShell, /hermes_cli\.main/);
assert.match(runKanbanGatewayWorkerShell, /kanban_args/);
assert.match(runKanbanGatewayWorkerShell, /capture_output=True/);
assert.match(runKanbanGatewayWorkerShell, /ensure_ascii=True/);

assert.match(startCronTickSidecar, /function Get-CronTickSidecarProcess/);
assert.match(startCronTickSidecar, /function Invoke-CronStatusCheck/);
assert.match(startCronTickSidecar, /cron", "status"/);
assert.match(startCronTickSidecar, /Start-Process/);
assert.match(startCronTickSidecar, /run-cron-tick-sidecar\.ps1/);
assert.match(startCronTickSidecar, /HERMES_WEB_HERMES_HOME/);
assert.match(startCronTickSidecar, /HERMES_MOBILE_CRON_TICK_LOG_PATH/);

assert.match(runCronTickSidecar, /cron", "tick"/);
assert.match(runCronTickSidecar, /--accept-hooks/);
assert.match(runCronTickSidecar, /HERMES_ACCEPT_HOOKS=1/);
assert.match(runCronTickSidecar, /HERMES_HOME=\$HermesHome/);
assert.match(runCronTickSidecar, /PYTHONPATH=\$pythonPath/);
assert.match(runCronTickSidecar, /Select-Object -Last \$maxLines/);
assert.doesNotMatch(runCronTickSidecar, /gateway", "run"/);

console.log("startup scripts tests passed");
