"use strict";

const { execFile } = require("node:child_process");

const DEFAULT_PUBLIC_REPO_URL = "https://github.com/pentiumxp/Home-AI-Public.git";
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_NODE_VERSION = "v24.14.1";

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function boundedOutput(value, max = 2000) {
  return clean(value, max)
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/(key|token|secret|password)[=:][^\s]+/gi, "$1=[redacted]");
}

function shellQuote(value) {
  return `'${String(value == null ? "" : value).replace(/'/g, `'\\''`)}'`;
}

function safeRemoteTempRoot(value, stamp) {
  const raw = clean(value, 300);
  if (!raw) return `/tmp/homeai-public-remote-deploy-smoke-${stamp}`;
  if (/^\/(?:tmp|var\/tmp)\/homeai-public-remote-deploy-smoke-[A-Za-z0-9._-]+$/.test(raw)) return raw;
  return "";
}

function defaultRunProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      env: options.env || process.env,
      maxBuffer: options.maxBuffer || 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        status: typeof error?.code === "number" ? error.code : (error ? 1 : 0),
        stdout: String(stdout || ""),
        stderr: String(stderr || error?.message || ""),
      });
    });
  });
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (_) {
    return null;
  }
}

function keyValueSummary(stdout) {
  const out = {};
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function summarizeStep(type, result = {}) {
  const json = parseJsonOutput(result.stdout);
  if (type === "remote-system-probe") {
    const fields = keyValueSummary(result.stdout);
    const required = ["git", "curl", "tar", "bash"];
    const missingTools = required.filter((tool) => !fields[tool]);
    return {
      ok: result.ok === true && missingTools.length === 0,
      uname: fields.uname || "",
      arch: fields.arch || "",
      missingTools,
      nodeAvailable: Boolean(fields.node),
      npmAvailable: Boolean(fields.npm),
    };
  }
  if (type === "bootstrap-node-runtime") {
    const fields = keyValueSummary(result.stdout);
    return {
      ok: result.ok === true && Boolean(fields.node) && Boolean(fields.npm),
      node: clean(fields.node, 120),
      npm: clean(fields.npm, 120),
      nodeVersion: clean(fields.nodeVersion, 40),
    };
  }
  if (type === "macos-install-cycle-delete") {
    const fields = keyValueSummary(result.stdout);
    return {
      ok: result.ok === true && fields.removed === "true",
      removed: fields.removed === "true",
    };
  }
  if (type === "macos-guided-install-sandbox"
    || type === "macos-install-cycle-first"
    || type === "macos-install-cycle-second") {
    const fields = keyValueSummary(result.stdout);
    if (fields.installOk) {
      return {
        ok: result.ok === true && fields.installOk === "true" && Number(fields.installStatus || 0) === 0,
        installStatus: Number(fields.installStatus || 0),
        guidedExecutedCount: Number(fields.guidedExecutedCount || 0),
        operatorPhaseCount: Number(fields.operatorPhaseCount || 0),
        phaseCount: Number(fields.phaseCount || 0),
        issueCount: Number(fields.issueCount || 0),
      };
    }
  }
  if (!json) return { ok: result.ok === true, jsonParsed: false };
  if (type === "public-source-preflight") {
    return {
      ok: json.ok === true,
      issueCount: Array.isArray(json.issues) ? json.issues.length : Number(json.issueCount || 0),
      requiredPluginCount: Number(json.requiredPluginCount || 0),
    };
  }
  if (type === "macos-fresh-install-rehearsal") {
    const missingArtifacts = Array.isArray(json.artifacts)
      ? json.artifacts.filter((artifact) => artifact && artifact.exists !== true).length
      : 0;
    return {
      ok: json.ok === true,
      phaseCount: Number(json.phaseCount || 0),
      missingArtifactCount: missingArtifacts,
      issueCount: Array.isArray(json.issues) ? json.issues.length : 0,
    };
  }
  if (type === "macos-guided-install-sandbox"
    || type === "macos-install-cycle-first"
    || type === "macos-install-cycle-second") {
    return {
      ok: json.ok === true,
      guidedExecutedCount: Number(json.guidedExecutedCount || json.execution?.guidedExecutedCount || 0),
      issueCount: Array.isArray(json.issues) ? json.issues.length : Number(json.issueCount || 0),
    };
  }
  if (type === "public-upgrade-rehearsal") {
    const cloneGate = Array.isArray(json.steps)
      ? json.steps.find((step) => step && step.type === "validate-operator-clone-gate-plan")
      : null;
    return {
      ok: json.ok === true,
      stepCount: Number(json.stepCount || 0),
      tempRemoved: json.tempRemoved === true,
      pluginCount: Number(cloneGate?.detail?.pluginCount || 0),
      cloneActionCount: Number(cloneGate?.detail?.cloneActionCount || 0),
      deployActionCount: Number(cloneGate?.detail?.deployActionCount || 0),
      movieOperatorAuthenticated: cloneGate?.detail?.movieOperatorAuthenticated === true,
    };
  }
  if (type === "public-production-upgrade") {
    return {
      ok: json.ok === true,
      mode: clean(json.mode, 40),
      error: clean(json.error, 120),
      stepCount: Number(json.stepCount || 0),
      actionCount: Number(json.actionCount || 0),
      issueCount: Number(json.issueCount || 0),
      blockerCount: Number(json.blockerCount || 0),
      updatedPluginCount: Array.isArray(json.updatedPlugins) ? json.updatedPlugins.length : 0,
      appUpdated: json.appUpdated === true,
      hermesAgentUpdated: json.hermesAgentUpdated === true,
    };
  }
  return { ok: json.ok === true, jsonParsed: true };
}

function buildSshArgs(options = {}, remoteCommand) {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${Math.max(1, Number(options.connectTimeoutSeconds || 15) || 15)}`];
  if (options.sshConfig) args.push("-F", options.sshConfig);
  if (options.identityFile) args.push("-i", options.identityFile);
  if (options.port) args.push("-p", String(options.port));
  for (const item of options.sshOptions || []) {
    args.push(item);
  }
  args.push(options.sshTarget, remoteCommand);
  return args;
}

function buildScpArgs(options = {}, sourcePath, remotePath) {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${Math.max(1, Number(options.connectTimeoutSeconds || 15) || 15)}`];
  if (options.sshConfig) args.push("-F", options.sshConfig);
  if (options.identityFile) args.push("-i", options.identityFile);
  if (options.port) args.push("-P", String(options.port));
  for (const item of options.sshOptions || []) {
    args.push(item);
  }
  args.push(sourcePath, `${options.sshTarget}:${remotePath}`);
  return args;
}

function remoteShell(script) {
  return `/bin/sh -lc ${shellQuote(script)}`;
}

function remoteNodeEnv(plan = {}) {
  const lines = [
    `export PATH=${shellQuote(`${plan.remoteRoot}/runtime/bin`)}:"$PATH"`,
    `export HOMEAI_NODE=${shellQuote(`${plan.remoteRoot}/runtime/bin/node`)}`,
    `export HOMEAI_NPM=${shellQuote(`${plan.remoteRoot}/runtime/bin/npm`)}`,
    "if [ -z \"${HOMEAI_PYTHON:-}\" ]; then",
    "  for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3.13 python3.12 python3; do",
    "    if command -v \"$candidate\" >/dev/null 2>&1; then export HOMEAI_PYTHON=\"$(command -v \"$candidate\")\"; break; fi",
    "  done",
    "fi",
    `export HOMEAI_PUBLIC_REPOSITORY_URL=${shellQuote(plan.publicRepoUrl || DEFAULT_PUBLIC_REPO_URL)}`,
    "export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'",
  ];
  if (plan.remoteSudoPasswordFile) {
    lines.push(`export HOMEAI_MAC_SUDO_PASSWORD_FILE=${shellQuote(plan.remoteSudoPasswordFile)}`);
  }
  return lines.join("\n");
}

function bootstrapNodeScript(plan = {}) {
  const runtimeRoot = `${plan.remoteRoot}/runtime`;
  const runtimeBin = `${runtimeRoot}/bin`;
  const nodeVersion = clean(plan.nodeVersion || DEFAULT_NODE_VERSION, 40);
  return [
    "set -e",
    `runtime_root=${shellQuote(runtimeRoot)}`,
    `runtime_bin=${shellQuote(runtimeBin)}`,
    `node_version=${shellQuote(nodeVersion)}`,
    "mkdir -p \"$runtime_bin\"",
    "system_node=\"$(command -v node 2>/dev/null || true)\"",
    "system_npm=\"$(command -v npm 2>/dev/null || true)\"",
    "if [ -n \"$system_node\" ] && [ -n \"$system_npm\" ]; then",
    "  ln -sf \"$system_node\" \"$runtime_bin/node\"",
    "  ln -sf \"$system_npm\" \"$runtime_bin/npm\"",
    "else",
    "  arch=\"$(uname -m)\"",
    "  case \"$arch\" in arm64) node_arch=arm64 ;; x86_64) node_arch=x64 ;; *) printf 'unsupported_arch=%s\\n' \"$arch\"; exit 2 ;; esac",
    "  package=\"node-${node_version}-darwin-${node_arch}\"",
    "  archive=\"$runtime_root/${package}.tar.gz\"",
    "  url=\"https://nodejs.org/dist/${node_version}/${package}.tar.gz\"",
    "  mkdir -p \"$runtime_root\"",
    "  curl -fsSL \"$url\" -o \"$archive\"",
    "  rm -rf \"$runtime_root/$package\"",
    "  tar -xzf \"$archive\" -C \"$runtime_root\"",
    "  ln -sf \"$runtime_root/$package/bin/node\" \"$runtime_bin/node\"",
    "  ln -sf \"$runtime_root/$package/bin/npm\" \"$runtime_bin/npm\"",
    "fi",
    "PATH=\"$runtime_bin:$PATH\"",
    "export PATH",
    "\"$runtime_bin/node\" --version >/dev/null",
    "\"$runtime_bin/npm\" --version >/dev/null",
    "printf 'node=%s\\n' \"$runtime_bin/node\"",
    "printf 'npm=%s\\n' \"$runtime_bin/npm\"",
    "printf 'nodeVersion=%s\\n' \"$(\"$runtime_bin/node\" --version)\"",
  ].join("\n");
}

function remoteInstallSummaryScript(command, outputPath) {
  const jsonPath = clean(outputPath, 300);
  return [
    "set +e",
    `${command} > ${shellQuote(jsonPath)} 2> ${shellQuote(`${jsonPath}.err`)}`,
    "status=$?",
    "set -e",
    `INSTALL_STATUS="$status" INSTALL_JSON=${shellQuote(jsonPath)} node - <<'NODE'`,
    "const fs = require('node:fs');",
    "const status = Number(process.env.INSTALL_STATUS || 0);",
    "let json = {};",
    "try { json = JSON.parse(fs.readFileSync(process.env.INSTALL_JSON, 'utf8')); } catch (_) { json = {}; }",
    "const issues = Array.isArray(json.issues) ? json.issues : [];",
    "const guidedExecutedCount = Number(json.guidedExecutedCount || json.execution?.guidedExecutedCount || json.guidedPlan?.executedCount || 0);",
    "const operatorPhaseCount = Array.isArray(json.guidedPlan?.operatorPhaseIds) ? json.guidedPlan.operatorPhaseIds.length : 0;",
    "const phaseCount = Number(json.phaseCount || (Array.isArray(json.phases) ? json.phases.length : 0));",
    "const issueCount = issues.length || Number(json.issueCount || 0);",
    "console.log(`installStatus=${status}`);",
    "console.log(`installOk=${json.ok === true}`);",
    "console.log(`guidedExecutedCount=${guidedExecutedCount}`);",
    "console.log(`operatorPhaseCount=${operatorPhaseCount}`);",
    "console.log(`phaseCount=${phaseCount}`);",
    "console.log(`issueCount=${issueCount}`);",
    "NODE",
    "if [ \"$status\" -ne 0 ]; then",
    `  tail -n 40 ${shellQuote(`${jsonPath}.err`)} >&2 || true`,
    "  exit \"$status\"",
    "fi",
  ].join("\n");
}

function remoteResultFileReaderScript(files = {}) {
  return [
    "set -e",
    `HOMEAI_REMOTE_RESULT_STATUS_PATH=${shellQuote(files.statusPath || "")} \\`,
    `HOMEAI_REMOTE_RESULT_STDOUT_PATH=${shellQuote(files.stdoutPath || "")} \\`,
    `HOMEAI_REMOTE_RESULT_STDERR_PATH=${shellQuote(files.stderrPath || "")} \\`,
    "node - <<'NODE'",
    "const fs = require('node:fs');",
    "function readBounded(path, maxBytes) {",
    "  if (!path || !fs.existsSync(path)) return '';",
    "  const stat = fs.statSync(path);",
    "  const size = Number(stat.size || 0);",
    "  const fd = fs.openSync(path, 'r');",
    "  try {",
    "    const length = Math.min(size, maxBytes);",
    "    const buffer = Buffer.alloc(length);",
    "    fs.readSync(fd, buffer, 0, length, 0);",
    "    return buffer.toString('utf8');",
    "  } finally {",
    "    fs.closeSync(fd);",
    "  }",
    "}",
    "const rawStatus = readBounded(process.env.HOMEAI_REMOTE_RESULT_STATUS_PATH, 100).trim();",
    "const status = Number(rawStatus);",
    "process.stdout.write(JSON.stringify({",
    "  status: Number.isFinite(status) ? status : 1,",
    "  statusPresent: Boolean(rawStatus),",
    "  stdout: readBounded(process.env.HOMEAI_REMOTE_RESULT_STDOUT_PATH, 6 * 1024 * 1024),",
    "  stderr: readBounded(process.env.HOMEAI_REMOTE_RESULT_STDERR_PATH, 128 * 1024),",
    "}));",
    "NODE",
  ].join("\n");
}

function remoteDetachedJsonCommandScript(command, files = {}, waitSeconds = 1800) {
  const stdoutPath = clean(files.stdoutPath, 300);
  const stderrPath = clean(files.stderrPath, 300);
  const statusPath = clean(files.statusPath, 300);
  const runnerPath = clean(files.runnerPath, 300);
  const waitLimit = Math.max(30, Math.min(7200, Number(waitSeconds || 1800)));
  return [
    "set -e",
    `stdout_path=${shellQuote(stdoutPath)}`,
    `stderr_path=${shellQuote(stderrPath)}`,
    `status_path=${shellQuote(statusPath)}`,
    `runner_path=${shellQuote(runnerPath)}`,
    "rm -f \"$stdout_path\" \"$stderr_path\" \"$status_path\" \"$runner_path\"",
    "cat > \"$runner_path\" <<'HOMEAI_REMOTE_RUNNER'",
    "#!/bin/sh",
    "set +e",
    command,
    "exit_code=$?",
    `printf '%s\\n' "$exit_code" > ${shellQuote(`${statusPath}.tmp`)}`,
    `mv ${shellQuote(`${statusPath}.tmp`)} ${shellQuote(statusPath)}`,
    "exit 0",
    "HOMEAI_REMOTE_RUNNER",
    "chmod 700 \"$runner_path\"",
    "nohup /bin/sh \"$runner_path\" > \"$stdout_path\" 2> \"$stderr_path\" < /dev/null &",
    "elapsed=0",
    `wait_limit=${waitLimit}`,
    "while [ ! -f \"$status_path\" ]; do",
    "  if [ \"$elapsed\" -ge \"$wait_limit\" ]; then",
    "    printf 'upgradeResult=files\\n'",
    "    printf 'statusPath=%s\\n' \"$status_path\"",
    "    printf 'stdoutPath=%s\\n' \"$stdout_path\"",
    "    printf 'stderrPath=%s\\n' \"$stderr_path\"",
    "    printf 'waitTimedOut=true\\n'",
    "    exit 0",
    "  fi",
    "  sleep 2",
    "  elapsed=$((elapsed + 2))",
    "done",
    "printf 'upgradeResult=files\\n'",
    "printf 'statusPath=%s\\n' \"$status_path\"",
    "printf 'stdoutPath=%s\\n' \"$stdout_path\"",
    "printf 'stderrPath=%s\\n' \"$stderr_path\"",
    "printf 'waitTimedOut=false\\n'",
    "exit 0",
  ].join("\n");
}

function buildRemoteSteps(plan = {}) {
  const appPath = `${plan.remoteRoot}/Home-AI-Public`;
  const targetRoot = `${plan.remoteRoot}/target-root`;
  const rehearsalRoot = `${plan.remoteRoot}/rehearsal-root`;
  const upgradeSourceRoot = `${plan.remoteRoot}/upgrade-sources`;
  const upgradePluginRoot = `${upgradeSourceRoot}/plugins`;
  const upgradeHermesAgentSource = `${upgradeSourceRoot}/hermes-agent-official`;
  const nodeEnv = remoteNodeEnv(plan);
  const steps = [
    {
      type: "remote-system-probe",
      script: [
        "set +e",
        "printf 'uname=%s\\n' \"$(/usr/bin/uname -s 2>/dev/null || uname -s 2>/dev/null)\"",
        "printf 'arch=%s\\n' \"$(/usr/bin/uname -m 2>/dev/null || uname -m 2>/dev/null)\"",
        "missing=0",
        "for tool in git curl tar bash; do path=\"$(command -v \"$tool\" 2>/dev/null)\"; printf '%s=%s\\n' \"$tool\" \"$path\"; [ -n \"$path\" ] || missing=1; done",
        "for tool in node npm; do path=\"$(command -v \"$tool\" 2>/dev/null)\"; printf '%s=%s\\n' \"$tool\" \"$path\"; done",
        "exit \"$missing\"",
      ].join("\n"),
    },
    {
      type: "prepare-remote-root",
      script: `rm -rf ${shellQuote(plan.remoteRoot)} && mkdir -p ${shellQuote(plan.remoteRoot)}`,
    },
    ...(plan.remoteSudoPasswordFile ? [
      {
        type: "upload-sudo-password-file",
        localCommand: "scp",
        localSource: plan.sudoPasswordFile,
        remotePath: plan.remoteSudoPasswordFile,
      },
      {
        type: "chmod-sudo-password-file",
        script: `chmod 600 ${shellQuote(plan.remoteSudoPasswordFile)}`,
      },
    ] : []),
    {
      type: "bootstrap-node-runtime",
      script: bootstrapNodeScript(plan),
    },
    {
      type: "clone-public-repo",
      script: `${nodeEnv}\ngit clone --depth 1 ${shellQuote(plan.publicRepoUrl)} ${shellQuote(appPath)}`,
    },
    {
      type: "public-source-preflight",
      script: `${nodeEnv}\ncd ${shellQuote(appPath)} && node scripts/public-install-preflight.js --source-only --json`,
    },
    {
      type: "macos-fresh-install-rehearsal",
      script: `${nodeEnv}\ncd ${shellQuote(appPath)} && node scripts/macos-fresh-install-rehearsal.js --root ${shellQuote(rehearsalRoot)} --json`,
    },
  ];
  if (plan.cycleInstall) {
    const installCommand = `cd ${shellQuote(appPath)} && bash scripts/install-macos-production.sh --execute --guided --root ${shellQuote(targetRoot)} --json`;
    steps.push({
      type: "macos-install-cycle-first",
      script: `${nodeEnv}\n${remoteInstallSummaryScript(installCommand, `${plan.remoteRoot}/install-cycle-first.json`)}`,
    });
    steps.push({
      type: "macos-install-cycle-delete",
      script: [
        `rm -rf ${shellQuote(targetRoot)}`,
        `if [ -e ${shellQuote(targetRoot)} ]; then printf 'removed=false\\n'; exit 1; fi`,
        "printf 'removed=true\\n'",
      ].join("\n"),
    });
    steps.push({
      type: "macos-install-cycle-second",
      script: `${nodeEnv}\n${remoteInstallSummaryScript(installCommand, `${plan.remoteRoot}/install-cycle-second.json`)}`,
    });
  } else if (plan.runGuidedInstall) {
    const installCommand = `cd ${shellQuote(appPath)} && bash scripts/install-macos-production.sh --execute --guided --root ${shellQuote(targetRoot)} --json`;
    steps.push({
      type: "macos-guided-install-sandbox",
      script: `${nodeEnv}\n${remoteInstallSummaryScript(installCommand, `${plan.remoteRoot}/guided-install.json`)}`,
    });
  }
  steps.push({
    type: "public-upgrade-rehearsal",
    script: `${nodeEnv}\ncd ${shellQuote(appPath)} && npm run --silent rehearse:public-upgrade -- --execute --json`,
  });
  if (plan.executeProductionUpgrade) {
    const productionUpgradeFiles = {
      stdoutPath: `${plan.remoteRoot}/production-upgrade.stdout`,
      stderrPath: `${plan.remoteRoot}/production-upgrade.stderr`,
      statusPath: `${plan.remoteRoot}/production-upgrade.status`,
      runnerPath: `${plan.remoteRoot}/production-upgrade-runner.sh`,
    };
    const productionUpgradeCommand = [
      `cd ${shellQuote(appPath)} &&`,
      "npm run --silent upgrade:public --",
      `--root ${shellQuote(plan.productionRoot)}`,
      `--app ${shellQuote(appPath)}`,
      `--plugin-root ${shellQuote(upgradePluginRoot)}`,
      `--hermes-agent-source ${shellQuote(upgradeHermesAgentSource)}`,
      "--execute",
      "--clone-missing-plugins",
      "--adopt-non-git-sources",
      "--update-hermes-agent",
      "--install-hermes-agent-dependencies",
      "--force-closure-validation",
      "--allow-provider-auth-pending",
      `--reason ${shellQuote(plan.reason)}`,
      "--json",
    ].join(" ");
    steps.push({
      type: "public-production-upgrade",
      script: [
        nodeEnv,
        remoteDetachedJsonCommandScript(productionUpgradeCommand, productionUpgradeFiles, 1800),
      ].join("\n"),
      resultFiles: productionUpgradeFiles,
    });
  }
  return steps;
}

function buildPlan(options = {}) {
  const stamp = clean(options.stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), 40);
  const remoteRoot = safeRemoteTempRoot(options.remoteRoot, stamp);
  const sudoPasswordFile = clean(options.sudoPasswordFile, 500);
  const blockers = [];
  if (!remoteRoot) blockers.push({ code: "remote_temp_root_invalid" });
  if (options.execute && !clean(options.sshTarget)) blockers.push({ code: "ssh_target_required" });
  if (options.executeProductionUpgrade && !clean(options.productionRoot)) blockers.push({ code: "production_root_required_for_upgrade_execute" });
  if (options.executeProductionUpgrade && !options.execute) blockers.push({ code: "execute_required_for_upgrade_execute" });
  const plan = {
    ok: blockers.length === 0,
    schemaVersion: 1,
    mode: options.execute ? "execute" : "plan",
    generatedAt: new Date().toISOString(),
    sshTarget: clean(options.sshTarget, 240),
    publicRepoUrl: clean(options.publicRepoUrl || DEFAULT_PUBLIC_REPO_URL, 500),
    nodeVersion: clean(options.nodeVersion || DEFAULT_NODE_VERSION, 40),
    remoteRoot,
    appPath: remoteRoot ? `${remoteRoot}/Home-AI-Public` : "",
    targetRoot: remoteRoot ? `${remoteRoot}/target-root` : "",
    productionRoot: clean(options.productionRoot, 300),
    remoteSudoPasswordFile: sudoPasswordFile && remoteRoot ? `${remoteRoot}/sudo-password` : "",
    sudoPasswordFileProvided: Boolean(sudoPasswordFile),
    runGuidedInstall: bool(options.runGuidedInstall),
    cycleInstall: bool(options.cycleInstall),
    executeProductionUpgrade: bool(options.executeProductionUpgrade),
    keepRemoteTemp: bool(options.keepRemoteTemp),
    reason: clean(options.reason || "public-remote-deploy-smoke", 120),
    blockers,
  };
  Object.defineProperty(plan, "sudoPasswordFile", {
    value: sudoPasswordFile,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  plan.actions = remoteRoot ? buildRemoteSteps(plan).map((step) => ({ type: step.type })) : [];
  plan.actionCount = plan.actions.length;
  return plan;
}

async function runRemoteStep(step, options, runProcess) {
  if (step.localCommand === "scp") {
    const result = await runProcess(options.scpCommand || "scp", buildScpArgs(options, step.localSource, step.remotePath), {
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    const normalized = {
      ok: result.ok === true || result.status === 0,
      status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
      stdout: boundedOutput(result.stdout, 1000),
      stderr: boundedOutput(result.stderr || result.error, 1000),
    };
    return {
      type: step.type,
      ok: normalized.ok,
      status: normalized.status,
      summary: { ok: normalized.ok },
      error: normalized.ok ? "" : (normalized.stderr || `local_step_failed:${step.type}`),
    };
  }
  const remoteCommand = remoteShell(step.script);
  const result = await runProcess(options.sshCommand || "ssh", buildSshArgs(options, remoteCommand), {
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (step.resultFiles) {
    const readerCommand = remoteShell(remoteResultFileReaderScript(step.resultFiles));
    const readResult = await runProcess(options.sshCommand || "ssh", buildSshArgs(options, readerCommand), {
      timeoutMs: Math.max(options.timeoutMs || DEFAULT_TIMEOUT_MS, 900000),
      maxBuffer: 8 * 1024 * 1024,
    });
    const readJson = parseJsonOutput(readResult.stdout);
    if (!readJson || readJson.statusPresent !== true) {
      const initialStderr = boundedOutput(result.stderr || result.error, 2000);
      const readStderr = boundedOutput(readResult.stderr || readResult.error, 2000);
      return {
        type: step.type,
        ok: false,
        status: Number.isFinite(Number(readResult.status)) ? Number(readResult.status) : 1,
        summary: {
          ok: false,
          jsonParsed: Boolean(readJson),
          resultFileReadOk: readResult.ok === true || readResult.status === 0,
          statusPresent: Boolean(readJson?.statusPresent),
        },
        error: readStderr || initialStderr || `remote_result_file_missing:${step.type}`,
      };
    }
    const commandStatus = Number(readJson.status || 0);
    const commandOk = commandStatus === 0;
    const summaryStdout = boundedOutput(readJson.stdout, 256000);
    const summaryStderr = boundedOutput(readJson.stderr, 16000);
    const summary = summarizeStep(step.type, {
      ok: commandOk,
      status: commandStatus,
      stdout: summaryStdout,
      stderr: summaryStderr,
    });
    return {
      type: step.type,
      ok: commandOk,
      status: commandStatus,
      summary,
      error: commandOk ? "" : (boundedOutput(readJson.stderr, 2000) || summary.error || boundedOutput(readJson.stdout, 8000) || `remote_step_failed:${step.type}`),
    };
  }
  const summaryStdout = boundedOutput(result.stdout, 256000);
  const summaryStderr = boundedOutput(result.stderr || result.error, 16000);
  const normalized = {
    ok: result.ok === true || result.status === 0,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: boundedOutput(result.stdout, 8000),
    stderr: boundedOutput(result.stderr || result.error, 2000),
  };
  const summary = summarizeStep(step.type, {
    ok: normalized.ok,
    status: normalized.status,
    stdout: summaryStdout,
    stderr: summaryStderr,
  });
  return {
    type: step.type,
    ok: normalized.ok,
    status: normalized.status,
    summary,
    error: normalized.ok ? "" : (normalized.stderr || summary.error || normalized.stdout || `remote_step_failed:${step.type}`),
  };
}

async function runRemoteDeploySmoke(options = {}, deps = {}) {
  const runProcess = deps.runProcess || defaultRunProcess;
  const plan = buildPlan(options);
  if (!options.execute || !plan.ok) return plan;

  const steps = [];
  const remoteSteps = buildRemoteSteps(plan);
  let ok = true;
  for (const step of remoteSteps) {
    const result = await runRemoteStep(step, { ...options, sshTarget: plan.sshTarget }, runProcess);
    steps.push(result);
    if (!result.ok || result.summary?.ok === false) {
      ok = false;
      break;
    }
  }
  let cleanup = { attempted: false, ok: true };
  if (!options.keepRemoteTemp && plan.remoteRoot) {
    const cleanupResult = await runRemoteStep({
      type: "cleanup-remote-root",
      script: `rm -rf ${shellQuote(plan.remoteRoot)}`,
    }, { ...options, sshTarget: plan.sshTarget }, runProcess);
    cleanup = { attempted: true, ok: cleanupResult.ok, status: cleanupResult.status };
    if (!cleanup.ok) ok = false;
  }
  return {
    ...plan,
    ok,
    completedAt: new Date().toISOString(),
    stepCount: steps.length,
    steps,
    cleanup,
  };
}

module.exports = {
  DEFAULT_PUBLIC_REPO_URL,
  DEFAULT_NODE_VERSION,
  buildPlan,
  buildRemoteSteps,
  buildSshArgs,
  runRemoteDeploySmoke,
  safeRemoteTempRoot,
  shellQuote,
  summarizeStep,
};
