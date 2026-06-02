"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walk(relativeDir, extensions) {
  const root = path.join(repoRoot, relativeDir);
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") continue;
      files.push(...walk(relativePath, extensions));
      continue;
    }
    if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }
  return files;
}

const powerShellFiles = [
  "start-hermes-web.ps1",
  ...walk("scripts", [".ps1"]),
].filter((file) => fs.existsSync(path.join(repoRoot, file)));

const inlineBashFromPowerShell = /\bbash\s+-l?c(?![A-Za-z])/i;

for (const file of powerShellFiles) {
  const text = read(file);
  assert.doesNotMatch(
    text,
    inlineBashFromPowerShell,
    `${file} must not pass inline Bash through PowerShell; write a UTF-8 script file and execute bash <script-path>.`,
  );
}

const startGatewayPool = read("scripts/start-gateway-pool.ps1");
assert.match(startGatewayPool, /function Invoke-GatewayPoolWslBashFile/);
assert.match(startGatewayPool, /\$portable = \$resolved\.Replace\(\[string\]\[char\]92, "\/"\)/);
assert.match(startGatewayPool, /wslpath -a \$portable/);
assert.match(startGatewayPool, /-- bash \$wslScriptPath/);
assert.match(startGatewayPool, /stop-legacy-official-low-gateways\.sh/);
assert.match(startGatewayPool, /start-owner-maintenance-gateways\.sh/);
assert.match(startGatewayPool, /Start-LowGateways -Profiles \$StartProfiles -NoStopExisting:\$NoStopExisting -ForceConfigure:\$ForceConfigure/);
assert.match(startGatewayPool, /-SkipConfigureIfReady/);
assert.match(startGatewayPool, /-ForceConfigure/);
assert.match(startGatewayPool, /Invoke-GatewayPoolElasticRequests/);
assert.match(startGatewayPool, /elastic-requests/);
assert.match(startGatewayPool, /Move-Item -LiteralPath \$file\.FullName -Destination \$processingPath -Force/);
assert.match(startGatewayPool, /Write-GatewayPoolElasticResult -Request \$request -Ok \$true/);
assert.match(startGatewayPool, /Start-LowGateways -Profiles \$ownerWarmProfiles -ForceConfigure:\$ForceConfigure/);
assert.match(startGatewayPool, /Stop-LowGatewayProfiles -Profiles \$StopProfiles/);

const startWeixinFrontGateway = read("scripts/start-weixin-front-gateway.ps1");
assert.match(startWeixinFrontGateway, /WriteAllText\(\$tmpScript, \$Script, \$encoding\)/);
assert.match(startWeixinFrontGateway, /\$portableTmpScript = \$tmpScript\.Replace\(\[string\]\[char\]92, "\/"\)/);
assert.match(startWeixinFrontGateway, /\$wslPathOutput = .*wslpath -a \$portableTmpScript/);
assert.match(startWeixinFrontGateway, /\$wslScript = \$wslPathOutput \| Where-Object \{ \$_ -match "\^\/" \}/);
assert.match(startWeixinFrontGateway, /wslpath -a \$portableTmpScript/);
assert.doesNotMatch(startWeixinFrontGateway, /wslpath -a \$portableTmpScript 2>&1 \| Select-Object -First 1/);
assert.match(startWeixinFrontGateway, /-- bash \$wslScript/);

const startWeixinMobileIngressBridge = read("scripts/start-weixin-mobile-ingress-bridge.ps1");
assert.match(startWeixinMobileIngressBridge, /WriteAllText\(\$tmpScript, \$Script, \$encoding\)/);
assert.match(startWeixinMobileIngressBridge, /\$portableTmpScript = \$tmpScript\.Replace\(\[string\]\[char\]92, "\/"\)/);
assert.match(startWeixinMobileIngressBridge, /\$wslPathOutput = .*wslpath -a \$portableTmpScript/);
assert.match(startWeixinMobileIngressBridge, /\$wslScript = \$wslPathOutput \| Where-Object \{ \$_ -match "\^\/" \}/);
assert.match(startWeixinMobileIngressBridge, /wslpath -a \$portableTmpScript/);
assert.doesNotMatch(startWeixinMobileIngressBridge, /wslpath -a \$portableTmpScript 2>&1 \| Select-Object -First 1/);
assert.match(startWeixinMobileIngressBridge, /-- bash \$wslScript/);

for (const file of [
  "scripts/deploy-nas-tracked-source.ps1",
  "scripts/deploy-nas-static-assets.ps1",
]) {
  const text = read(file);
  assert.match(
    text,
    /B64='\$b64' python3 -c/,
    `${file} must execute remote Python through a base64 environment variable instead of nested heredocs.`,
  );
  assert.match(
    text,
    /cmd\.exe \/d \/c \$uploadCommand/,
    `${file} must upload NAS archives through a fixed cmd.exe text pipeline, not ad-hoc PowerShell binary piping.`,
  );
  assert.doesNotMatch(
    text,
    /\bscp\b|\bsftp\b/,
    `${file} must not depend on scp/sftp because the maintained NAS SSH server rejects that subsystem.`,
  );
  assert.doesNotMatch(
    text,
    /tar(?:\.exe)?[^\r\n|]*\|\s*ssh/i,
    `${file} must not pipe binary tar output through PowerShell into ssh.`,
  );
}
