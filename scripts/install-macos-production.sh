#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SOURCE="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="/Users/example/path"
NODE_COMMAND="${HOMEAI_NODE:-node}"
NPM_COMMAND="${HOMEAI_NPM:-npm}"
PYTHON_COMMAND="${HOMEAI_PYTHON:-${PYTHON:-python3}}"
SERVICE_USERS="${HOMEAI_SERVICE_USERS:-hermes-host,hm-owner,hm-wuping,hm-stephen,hm-xuyan,hm-test}"
ALLOW_USER_CREATE="${HOMEAI_INSTALL_ALLOW_USER_CREATE:-0}"
OWNER_KEY_FILE="${HOMEAI_OWNER_KEY_FILE:-}"
WORKSPACE_MAP="${HOMEAI_WORKSPACE_MAP:-owner:hm-owner:owner,weixin_wuping:hm-wuping:weixin_wuping,weixin_stephen:hm-stephen:weixin_stephen,user-981731fe:hm-xuyan:user-981731fe,test:hm-test:test}"
APPLY_WORKSPACE_ACL="${HOMEAI_INSTALL_APPLY_WORKSPACE_ACL:-0}"
GATEWAY_OPENAI_WORKERS="${HOMEAI_GATEWAY_OPENAI_WORKERS:-2}"
GATEWAY_DEEPSEEK_WORKERS="${HOMEAI_GATEWAY_DEEPSEEK_WORKERS:-1}"
GATEWAY_OWNER_GROK_WORKERS="${HOMEAI_GATEWAY_OWNER_GROK_WORKERS:-1}"
GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS="${HOMEAI_GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS:-2}"
GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS="${HOMEAI_GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS:-1}"
PLUGIN_SOURCE_MODE="${HOMEAI_INSTALL_PLUGIN_SOURCE_MODE:-plan}"
PLUGIN_SOURCE_BUNDLE_DIR="${HOMEAI_INSTALL_PLUGIN_SOURCE_BUNDLE_DIR:-}"
CRON_NETWORK_MODE="${HOMEAI_INSTALL_CRON_NETWORK_MODE:-direct}"
HERMES_AGENT_SOURCE="${HOMEAI_HERMES_AGENT_SOURCE:-}"
HERMES_AGENT_REPOSITORY_URL="${HOMEAI_HERMES_AGENT_REPOSITORY_URL:-${HERMES_MOBILE_HERMES_AGENT_REPOSITORY_URL:-https://github.com/pentiumxp/hermes-agent-public.git}}"
HERMES_AGENT_REF="${HOMEAI_HERMES_AGENT_REF:-${HERMES_MOBILE_HERMES_AGENT_REF:-main}}"
INSTALL_HERMES_AGENT_DEPENDENCIES="${HOMEAI_INSTALL_HERMES_AGENT_DEPENDENCIES:-1}"
APPLY_LAUNCHD_SERVICES="${HOMEAI_INSTALL_LAUNCHD_APPLY:-0}"
LAUNCH_DAEMONS_DIR="${HOMEAI_LAUNCH_DAEMONS_DIR:-/Library/LaunchDaemons}"
LAUNCHCTL_COMMAND="${HOMEAI_LAUNCHCTL:-/bin/launchctl}"
MODE="dry-run"
OUTPUT="text"
PHASE_FILTER=""
GUIDED="false"
NETWORK_MODE="${HOMEAI_INSTALL_NETWORK_MODE:-direct}"
BASE_URL="http://127.0.0.1:8797"
EXECUTED_PHASE=""
EXECUTED_PHASE_OK="null"
EXECUTED_PHASE_ISSUE_CODES=""
EXECUTION_REPORT_JSON="null"
GUIDED_EXECUTED_PHASES=""
GUIDED_EXECUTED_COUNT="0"
GUIDED_FAILED_PHASE=""
GUIDED_REPORTS_JSON="[]"

PHASES=(
  "system-preflight"
  "install-dependencies"
  "create-service-users"
  "create-directory-layout"
  "install-hermes-mobile"
  "install-official-hermes-runtime"
  "configure-owner"
  "configure-workspace-isolation"
  "configure-gateway-profiles"
  "install-gateway-launchd-services"
  "repair-gateway-worker-acl"
  "configure-cron"
  "configure-plugins"
  "install-plugin-dependencies"
  "plan-plugin-workspace-provisioning"
  "install-launchd-services"
  "run-first-start-preflight"
  "run-smoke-tests"
  "print-access-info"
)

GUIDED_AUTO_PHASES=()

GUIDED_OPERATOR_PHASES=(
  "create-service-users"
  "create-directory-layout"
  "install-hermes-mobile"
  "install-official-hermes-runtime"
  "install-dependencies"
  "configure-owner"
  "configure-workspace-isolation"
  "configure-gateway-profiles"
  "install-gateway-launchd-services"
  "repair-gateway-worker-acl"
  "configure-cron"
  "configure-plugins"
  "install-plugin-dependencies"
  "plan-plugin-workspace-provisioning"
  "install-launchd-services"
  "run-first-start-preflight"
  "run-smoke-tests"
  "print-access-info"
)

usage() {
  cat <<'USAGE'
Usage: scripts/install-macos-production.sh [--dry-run|--execute] [--guided] [--json] [--root <path>] [--app-source <path>] [--node-command <path>] [--npm-command <path>] [--python-command <path>] [--service-users <csv>] [--owner-key-file <path>] [--workspace-map <csv>] [--gateway-openai-workers <n>] [--gateway-deepseek-workers <n>] [--gateway-owner-grok-workers <n>] [--gateway-owner-maintenance-openai-workers <n>] [--gateway-owner-maintenance-deepseek-workers <n>] [--plugin-source-mode plan|clone|bundle] [--plugin-source-bundle-dir <path>] [--cron-network-mode direct|proxy] [--hermes-agent-source <path>] [--hermes-agent-repository-url <url>] [--hermes-agent-ref <ref>] [--install-hermes-agent-dependencies 0|1] [--phase <id>] [--network-mode direct|proxy] [--base <url>]

Plans the phase-based Home AI macOS production installation.

Default mode is --dry-run. It runs source-level public install preflight and
prints the full installation phase plan without mutating the host.

--execute without --phase is intentionally fail-closed unless --guided is also
present. Only read-only phases and idempotent low-risk phases are currently
executable: system-preflight, install-dependencies, create-service-users,
create-directory-layout, install-hermes-mobile, install-official-hermes-runtime,
install-plugin-dependencies,
run-first-start-preflight, run-smoke-tests, and print-access-info. Use the
central deploy script for existing production updates.

--guided prints a one-command guided install report. With --execute, it does
not run service-owned phases unless HOMEAI_INSTALL_RUN_OPERATOR_PHASES=1 is set
and the command is already running as root through the operator sudo boundary.
That explicit operator gate can run the full fresh-install phase order; provider
credentials and external OAuth/session setup remain outside this installer.

The create-service-users phase audits the required macOS service users by
default. To let it create missing users, run as root and set
HOMEAI_INSTALL_ALLOW_USER_CREATE=1. User creation is still bounded and
fail-closed; existing conflicting users are never modified.

The configure-owner phase creates a missing Owner Web Access Key file with
0600 permissions and never prints the generated key. Existing key contents are
not overwritten.

The configure-workspace-isolation phase creates and normalizes the baseline
workspace directory scaffold. It applies macOS ownership/ACL repairs only when
run as root with HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1.

The configure-gateway-profiles phase creates a fresh-install Gateway manifest,
per-worker Mobile-to-Gateway API key files, and profile config skeletons for
OpenAI/Codex, DeepSeek, Owner Grok, and Owner maintenance profiles. It does
not copy provider OAuth state, browser credentials, or provider API keys.

The install-gateway-launchd-services phase materializes enabled Gateway
manifest workers into profile start scripts and Gateway LaunchDaemon plists.
It is staging-only by default and uses the same HOMEAI_INSTALL_LAUNCHD_APPLY=1
gate for the privileged install/load step.

The repair-gateway-worker-acl phase writes a Gateway worker ACL plan by
default. To apply macOS ACL/chown repairs for generated profile directories,
manifest files, worker API keys, provider key files, and bridge-host secrets,
run as root with HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1.

The configure-plugins phase reads config/public-plugin-sources.json and writes
a bounded plugin source plan by default. Set --plugin-source-mode clone for
explicit HTTPS public Git clone during first install. Set
--plugin-source-mode bundle with --plugin-source-bundle-dir when an operator
provides pre-fetched plugin source directories for authenticated plugin
repositories.

The plan-plugin-workspace-provisioning phase writes a bounded first-run
workspace plugin provisioning plan from the public plugin manifest and
workspace map. It does not create plugin keys, grants, launch tokens, or
plugin-owned database rows; actual provisioning still goes through
/api/workspace-onboarding/apply or the Owner plugin manager.

The configure-cron phase creates the official Hermes CRON store scaffold,
output/log/workdir directories, helper scripts, and source-controlled CRON
Skills. It does not create business jobs or install launchd.

The install-official-hermes-runtime phase pins the Node runtime, verifies a
Python >=3.12 command, materializes the official Hermes Agent source under
runtime/hermes-agent-official/source, creates runtime/hermes-agent-official/venv,
and installs Hermes Agent dependencies when HOMEAI_INSTALL_HERMES_AGENT_DEPENDENCIES=1.
Run this phase as root/sudo when the production runtime root is owned by the
Home AI service user.

The install-dependencies and install-plugin-dependencies phases write
service-owned production dependency directories. Run them as root/sudo when the
production app or plugin roots are owned by the Home AI service user.

The install-launchd-services phase stages the canonical core and public plugin
launchd plist files and writes a launchd service plan. By default it does not
install files under /Library/LaunchDaemons and does not load or restart
services. To perform the privileged install/load step, run as root with
HOMEAI_INSTALL_LAUNCHD_APPLY=1. Tests may override HOMEAI_LAUNCH_DAEMONS_DIR
and HOMEAI_LAUNCHCTL for a non-system sandbox.
USAGE
}

json_escape() {
  node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.stringify(s)));'
}

phase_command() {
  case "$1" in
    system-preflight)
      printf 'node %s/scripts/public-install-preflight.js --repo-root %s --python-command %s --json' "$APP_SOURCE" "$APP_SOURCE" "$PYTHON_COMMAND"
      ;;
    install-dependencies)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase install-dependencies --root %s --npm-command %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$NPM_COMMAND"
      ;;
    create-service-users)
      printf '%s HOMEAI_INSTALL_ALLOW_USER_CREATE=1 bash %s/scripts/install-macos-production.sh --execute --phase create-service-users --root %s --service-users %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$SERVICE_USERS"
      ;;
    configure-owner)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase configure-owner --root %s --owner-key-file %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "${OWNER_KEY_FILE:-$ROOT/data/secrets/owner-web-key.secret}"
      ;;
    configure-workspace-isolation)
      printf '%s HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash %s/scripts/install-macos-production.sh --execute --phase configure-workspace-isolation --root %s --workspace-map %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$WORKSPACE_MAP"
      ;;
    configure-gateway-profiles)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase configure-gateway-profiles --root %s --workspace-map %s --gateway-openai-workers %s --gateway-deepseek-workers %s --gateway-owner-grok-workers %s --gateway-owner-maintenance-openai-workers %s --gateway-owner-maintenance-deepseek-workers %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$WORKSPACE_MAP" "$GATEWAY_OPENAI_WORKERS" "$GATEWAY_DEEPSEEK_WORKERS" "$GATEWAY_OWNER_GROK_WORKERS" "$GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS" "$GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS"
      ;;
    install-gateway-launchd-services)
      printf '%s HOMEAI_INSTALL_LAUNCHD_APPLY=1 bash %s/scripts/install-macos-production.sh --execute --phase install-gateway-launchd-services --root %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT"
      ;;
    repair-gateway-worker-acl)
      printf '%s HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash %s/scripts/install-macos-production.sh --execute --phase repair-gateway-worker-acl --root %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT"
      ;;
    configure-plugins)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase configure-plugins --root %s --plugin-source-mode %s' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$PLUGIN_SOURCE_MODE"
      if [[ -n "$PLUGIN_SOURCE_BUNDLE_DIR" ]]; then
        printf ' --plugin-source-bundle-dir %s' "$PLUGIN_SOURCE_BUNDLE_DIR"
      fi
      printf ' --json'
      ;;
    install-plugin-dependencies)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase install-plugin-dependencies --root %s --npm-command %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$NPM_COMMAND"
      ;;
    plan-plugin-workspace-provisioning)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase plan-plugin-workspace-provisioning --root %s --workspace-map %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$WORKSPACE_MAP"
      ;;
    configure-cron)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase configure-cron --root %s --cron-network-mode %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$CRON_NETWORK_MODE"
      ;;
    install-launchd-services)
      printf '%s HOMEAI_INSTALL_LAUNCHD_APPLY=1 bash %s/scripts/install-macos-production.sh --execute --phase install-launchd-services --root %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT"
      ;;
    run-first-start-preflight)
      local mode="${NETWORK_MODE:-<direct|proxy>}"
      printf '%s node %s/scripts/macos-first-start-preflight.js --root %s --network-mode %s --base %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$mode" "$BASE_URL"
      ;;
    create-directory-layout)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase create-directory-layout --root %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT"
      ;;
    install-hermes-mobile)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase install-hermes-mobile --root %s --app-source %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$APP_SOURCE"
      ;;
    install-official-hermes-runtime)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase install-official-hermes-runtime --root %s --node-command %s --npm-command %s --python-command %s --hermes-agent-source %s --hermes-agent-repository-url %s --hermes-agent-ref %s --install-hermes-agent-dependencies %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$NODE_COMMAND" "$NPM_COMMAND" "$PYTHON_COMMAND" "${HERMES_AGENT_SOURCE:-$ROOT/runtime/hermes-agent-official/source}" "$HERMES_AGENT_REPOSITORY_URL" "$HERMES_AGENT_REF" "$INSTALL_HERMES_AGENT_DEPENDENCIES"
      ;;
    run-smoke-tests)
      printf '%s %s/runtime/node-current/bin/node %s/app/scripts/macos-production-closure-validation.js --root %s --base %s --json' "$(sudo_phase_prefix)" "$ROOT" "$ROOT" "$ROOT" "$BASE_URL"
      ;;
    print-access-info)
      printf '%s bash %s/scripts/install-macos-production.sh --execute --phase print-access-info --root %s --base %s --json' "$(sudo_phase_prefix)" "$APP_SOURCE" "$ROOT" "$BASE_URL"
      ;;
    *)
      printf 'manual:%s' "$1"
      ;;
  esac
}

phase_exists() {
  local needle="$1"
  for phase in "${PHASES[@]}"; do
    [[ "$phase" == "$needle" ]] && return 0
  done
  return 1
}

phase_selected() {
  [[ -z "$PHASE_FILTER" || "$PHASE_FILTER" == "$1" ]]
}

array_contains() {
  local needle="$1"
  shift
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

sudo_phase_path() {
  local phase_path="$ROOT/runtime/node-current/bin"
  local command_path command_dir
  for command_path in "$NODE_COMMAND" "$NPM_COMMAND"; do
    if [[ "$command_path" == */* ]]; then
      command_dir="${command_path%/*}"
      if [[ -z "$command_dir" ]]; then
        command_dir="/"
      fi
      if [[ -n "$command_dir" && ":$phase_path:" != *":$command_dir:"* ]]; then
        phase_path="$command_dir:$phase_path"
      fi
    fi
  done
  printf '%s:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin' "$phase_path"
}

sudo_phase_prefix() {
  printf 'sudo env PATH=%s' "$(sudo_phase_path)"
}

phase_guided_auto() {
  if [[ "${#GUIDED_AUTO_PHASES[@]}" -eq 0 ]]; then
    return 1
  fi
  array_contains "$1" "${GUIDED_AUTO_PHASES[@]}"
}

phase_guided_operator() {
  array_contains "$1" "${GUIDED_OPERATOR_PHASES[@]}"
}

guided_phase_executed() {
  [[ ",$GUIDED_EXECUTED_PHASES," == *",$1,"* ]]
}

json_array() {
  if [[ "$#" -eq 0 ]]; then
    printf '[]'
    return 0
  fi
  node - "$@" <<'NODE'
console.log(JSON.stringify(process.argv.slice(2)));
NODE
}

guided_operator_steps_json() {
  node - "$ROOT" "$APP_SOURCE" "$SERVICE_USERS" "$WORKSPACE_MAP" "$BASE_URL" "$NODE_COMMAND" "$NPM_COMMAND" "$PYTHON_COMMAND" "${HERMES_AGENT_SOURCE:-$ROOT/runtime/hermes-agent-official/source}" "$HERMES_AGENT_REPOSITORY_URL" "$HERMES_AGENT_REF" "$INSTALL_HERMES_AGENT_DEPENDENCIES" <<'NODE'
const [
  root,
  appSource,
  serviceUsers,
  workspaceMap,
  baseUrl,
  nodeCommand,
  npmCommand,
  pythonCommand,
  hermesAgentSource,
  hermesAgentRepositoryUrl,
  hermesAgentRef,
  installHermesAgentDependencies,
] = process.argv.slice(2);
const installer = `bash ${appSource}/scripts/install-macos-production.sh`;
function commandDir(command) {
  const value = String(command || "").trim();
  if (!value.includes("/")) return "";
  const index = value.lastIndexOf("/");
  if (index < 0) return "";
  return index === 0 ? "/" : value.slice(0, index);
}
function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
const sudoPath = unique([
  commandDir(nodeCommand),
  commandDir(npmCommand),
  `${root}/runtime/node-current/bin`,
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
]).join(":");
const sudoEnv = `sudo env PATH=${sudoPath}`;
const steps = [
  {
    id: "create-service-users",
    title: "Audit and create macOS service users",
    requiresSudo: true,
    gate: "HOMEAI_INSTALL_ALLOW_USER_CREATE=1",
    commands: [
      `${installer} --execute --phase create-service-users --root ${root} --service-users ${serviceUsers} --json`,
      `${sudoEnv} HOMEAI_INSTALL_ALLOW_USER_CREATE=1 ${installer} --execute --phase create-service-users --root ${root} --service-users ${serviceUsers} --json`,
    ],
    evidenceRequired: ["phase JSON ok=true", "all required macOS service users exist"],
    riskBoundary: "Audits by default; user creation requires explicit administrator approval.",
  },
  {
    id: "create-directory-layout",
    title: "Create production directory layout",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase create-directory-layout --root ${root} --json`],
    evidenceRequired: ["standard production directories exist"],
    riskBoundary: "Creates the service-owned production directory scaffold only.",
  },
  {
    id: "install-hermes-mobile",
    title: "Install Home AI source into the production app root",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase install-hermes-mobile --root ${root} --app-source ${appSource} --json`],
    evidenceRequired: ["root/app contains the public Home AI source"],
    riskBoundary: "Copies source only into an empty app root; existing production updates use the deploy script.",
  },
  {
    id: "install-official-hermes-runtime",
    title: "Install official Node and Hermes Agent runtime",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase install-official-hermes-runtime --root ${root} --node-command ${nodeCommand} --npm-command ${npmCommand} --python-command ${pythonCommand} --hermes-agent-source ${hermesAgentSource} --hermes-agent-repository-url ${hermesAgentRepositoryUrl} --hermes-agent-ref ${hermesAgentRef} --install-hermes-agent-dependencies ${installHermesAgentDependencies} --json`],
    evidenceRequired: ["runtime/node-current/bin/node, npm, and npx exist", "runtime/hermes-agent-official/venv exists"],
    riskBoundary: "Production runtime paths are service-owned; dependency refresh must run with an operator sudo boundary.",
  },
  {
    id: "install-dependencies",
    title: "Install Home AI production npm dependencies",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase install-dependencies --root ${root} --npm-command ${npmCommand} --json`],
    evidenceRequired: ["Home AI npm ci report has no issues"],
    riskBoundary: "The production app root is service-owned; dependency install must run through the operator sudo boundary.",
  },
  {
    id: "configure-owner",
    title: "Create or verify Owner access key",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase configure-owner --root ${root} --json`],
    evidenceRequired: ["Owner key file exists with bounded metadata only", "no generated key value is printed"],
    riskBoundary: "Owner key storage is service-owned and must not expose the raw key.",
  },
  {
    id: "configure-workspace-isolation",
    title: "Apply workspace ownership and ACL isolation",
    requiresSudo: true,
    gate: "HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1",
    commands: [
      `${installer} --execute --phase configure-workspace-isolation --root ${root} --workspace-map ${workspaceMap} --json`,
      `${sudoEnv} HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 ${installer} --execute --phase configure-workspace-isolation --root ${root} --workspace-map ${workspaceMap} --json`,
    ],
    evidenceRequired: ["workspace data roots exist", "ACL/ownership repair report has no issues"],
    riskBoundary: "Ownership and ACL mutation requires explicit sudo gate.",
  },
  {
    id: "configure-gateway-profiles",
    title: "Create Gateway worker manifest and profile skeletons",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase configure-gateway-profiles --root ${root} --workspace-map ${workspaceMap} --gateway-openai-workers 3 --gateway-deepseek-workers 1 --gateway-owner-grok-workers 1 --gateway-owner-maintenance-openai-workers 1 --gateway-owner-maintenance-deepseek-workers 1 --json`],
    evidenceRequired: ["gateway-pool-manifest-mac.json exists", "worker API key files are stored as files"],
    riskBoundary: "Creates profile skeletons only; provider OAuth/session setup remains external.",
  },
  {
    id: "install-gateway-launchd-services",
    title: "Install Gateway worker LaunchDaemons",
    requiresSudo: true,
    gate: "HOMEAI_INSTALL_LAUNCHD_APPLY=1",
    commands: [`${sudoEnv} HOMEAI_INSTALL_LAUNCHD_APPLY=1 ${installer} --execute --phase install-gateway-launchd-services --root ${root} --json`],
    evidenceRequired: ["Gateway worker plist files are installed and loaded"],
    riskBoundary: "Installs only generated Gateway worker LaunchDaemons.",
  },
  {
    id: "repair-gateway-worker-acl",
    title: "Apply Gateway worker ACL repairs",
    requiresSudo: true,
    gate: "HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1",
    commands: [
      `${installer} --execute --phase repair-gateway-worker-acl --root ${root} --json`,
      `${sudoEnv} HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 ${installer} --execute --phase repair-gateway-worker-acl --root ${root} --json`,
    ],
    evidenceRequired: ["data/gateway-worker-acl-plan.json reviewed", "applied ACL report has no issues"],
    riskBoundary: "Writes an ACL plan by default; filesystem mutation requires explicit sudo gate.",
  },
  {
    id: "configure-cron",
    title: "Create Home AI CRON store and helper scripts",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase configure-cron --root ${root} --json`],
    evidenceRequired: ["cron-config-plan.json exists", "Hermes Home helper scripts exist under data/hermes-home/scripts"],
    riskBoundary: "CRON runtime state is service-owned; business jobs are not created by this phase.",
  },
  {
    id: "configure-plugins",
    title: "Create or install plugin source plan",
    requiresSudo: true,
    gate: "sudo",
    commands: [
      `${sudoEnv} ${installer} --execute --phase configure-plugins --root ${root} --plugin-source-mode plan --json`,
      `${sudoEnv} ${installer} --execute --phase configure-plugins --root ${root} --plugin-source-mode clone --json`,
      `${sudoEnv} ${installer} --execute --phase configure-plugins --root ${root} --plugin-source-mode bundle --plugin-source-bundle-dir <plugin-source-bundle-dir> --json`,
    ],
    evidenceRequired: ["plugin-source-plan.json exists", "plugin source directories exist when clone or bundle mode is used", "no workspace grants or plugin secrets are created"],
    riskBoundary: "Plans plugin sources by default; clone uses public HTTPS Git, while bundle copies operator-provided source directories for authenticated plugins.",
  },
  {
    id: "install-plugin-dependencies",
    title: "Install public plugin production dependencies",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase install-plugin-dependencies --root ${root} --npm-command ${npmCommand} --json`],
    evidenceRequired: ["plugin dependency report has no issues"],
    riskBoundary: "Plugin production roots are service-owned; dependency install must run through the operator sudo boundary.",
  },
  {
    id: "plan-plugin-workspace-provisioning",
    title: "Write plugin workspace provisioning plan",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase plan-plugin-workspace-provisioning --root ${root} --workspace-map ${workspaceMap} --json`],
    evidenceRequired: ["plugin-workspace-provisioning-plan.json exists", "plan does not create plugin keys or workspace grants"],
    riskBoundary: "Writes a bounded plan only; actual grants still require Owner provisioning flow.",
  },
  {
    id: "install-launchd-services",
    title: "Install Home AI and plugin LaunchDaemons",
    requiresSudo: true,
    gate: "HOMEAI_INSTALL_LAUNCHD_APPLY=1",
    commands: [`${sudoEnv} HOMEAI_INSTALL_LAUNCHD_APPLY=1 ${installer} --execute --phase install-launchd-services --root ${root} --json`],
    evidenceRequired: ["core and plugin plist files are installed", "launchd load succeeds for staged services"],
    riskBoundary: "Installs only generated core and public plugin LaunchDaemons.",
  },
  {
    id: "run-first-start-preflight",
    title: "Run first-start runtime preflight",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase run-first-start-preflight --root ${root} --network-mode direct --base ${baseUrl} --json`],
    evidenceRequired: ["first-start preflight ok=true for the selected network mode"],
    riskBoundary: "Read-only runtime readiness check before first service use.",
  },
  {
    id: "run-smoke-tests",
    title: "Run aggregate production smoke tests",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase run-smoke-tests --root ${root} --base ${baseUrl} --json`],
    evidenceRequired: ["production closure validation ok=true", "listener and supporting runtime services reachable"],
    riskBoundary: "Validates live services; does not repair production state.",
  },
  {
    id: "print-access-info",
    title: "Print bounded access information",
    requiresSudo: true,
    gate: "sudo",
    commands: [`${sudoEnv} ${installer} --execute --phase print-access-info --root ${root} --base ${baseUrl} --json`],
    evidenceRequired: ["local access URL and placeholder smoke commands are printed"],
    riskBoundary: "Does not print Owner keys or other secrets.",
  },
];
process.stdout.write(JSON.stringify(steps));
NODE
}

phase_executable() {
  case "$1" in
    system-preflight|install-dependencies|create-service-users|create-directory-layout|install-hermes-mobile|install-official-hermes-runtime|configure-owner|configure-workspace-isolation|configure-gateway-profiles|install-gateway-launchd-services|repair-gateway-worker-acl|configure-cron|configure-plugins|install-plugin-dependencies|plan-plugin-workspace-provisioning|install-launchd-services|run-first-start-preflight|run-smoke-tests|print-access-info)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

run_install_app_phase() {
  node - "$ROOT" "$APP_SOURCE" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const source = path.resolve(process.argv[3]);
const target = path.join(root, "app");
const excludedNames = new Set([
  ".git",
  ".codegraph",
  ".codex",
  ".agent-context",
  ".deploy-backups",
  "node_modules",
  ".venv",
  "logs",
  "mounts",
  "tmp",
  "temp",
  ".DS_Store",
]);
const excludedPrefixes = [
  ".env",
];
const excludedSuffixes = [
  ".log",
];

function shouldExclude(name) {
  if (excludedNames.has(name)) return true;
  if (excludedPrefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}.`))) return true;
  if (excludedSuffixes.some((suffix) => name.endsWith(suffix))) return true;
  return false;
}

function listVisibleEntries(dir) {
  try {
    return fs.readdirSync(dir).filter((entry) => entry !== ".DS_Store");
  } catch {
    return [];
  }
}

function copyRecursive(src, dest, stats) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true, mode: 0o755 });
  for (const entry of entries) {
    if (shouldExclude(entry.name)) {
      stats.excluded.push(path.relative(source, path.join(src, entry.name)) || entry.name);
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      stats.excluded.push(path.relative(source, srcPath));
      continue;
    }
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, stats);
      continue;
    }
    if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true, mode: 0o755 });
      fs.copyFileSync(srcPath, destPath);
      const mode = fs.statSync(srcPath).mode & 0o777;
      fs.chmodSync(destPath, mode);
      stats.fileCount += 1;
      stats.byteCount += fs.statSync(destPath).size;
    }
  }
}

const issues = [];
const stats = { fileCount: 0, byteCount: 0, excluded: [] };
try {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    issues.push({ code: "app_source_missing_or_not_directory", path: source });
  }
  fs.mkdirSync(target, { recursive: true, mode: 0o755 });
  const targetEntries = listVisibleEntries(target);
  if (targetEntries.length > 0) {
    issues.push({
      code: "target_app_not_empty",
      path: target,
      entryCount: targetEntries.length,
    });
  }
  if (issues.length === 0) {
    copyRecursive(source, target, stats);
  }
} catch (err) {
  issues.push({
    code: "install_app_copy_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-hermes-mobile",
  source,
  target,
  fileCount: stats.fileCount,
  byteCount: stats.byteCount,
  excludedCount: stats.excluded.length,
  excludedSamples: stats.excluded.slice(0, 20),
  rollback: {
    safeOnlyForFreshEmptyTarget: true,
    command: `rm -rf ${JSON.stringify(target)}`,
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_dependency_phase() {
  node - "$ROOT" "$NPM_COMMAND" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const requestedNpm = process.argv[3] || "npm";
const appDir = path.join(root, "app");
const issues = [];
const startedAt = Date.now();

function resolveCommand(command) {
  if (command.includes("/")) return path.resolve(command);
  const result = spawnSync("/usr/bin/env", ["bash", "-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function countNodeModules(dir) {
  try {
    return fs.readdirSync(dir).filter((entry) => entry !== ".bin").length;
  } catch {
    return 0;
  }
}

let resolvedNpm = "";
let npmVersion = "";
let installStatus = null;
let outputSample = "";
try {
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) {
    issues.push({ code: "app_dir_missing", path: appDir });
  }
  if (!fs.existsSync(path.join(appDir, "package.json"))) {
    issues.push({ code: "package_json_missing", path: "app/package.json" });
  }
  if (!fs.existsSync(path.join(appDir, "package-lock.json"))) {
    issues.push({ code: "package_lock_missing", path: "app/package-lock.json" });
  }

  resolvedNpm = resolveCommand(requestedNpm);
  if (!resolvedNpm || !fs.existsSync(resolvedNpm)) {
    issues.push({ code: "npm_command_not_found", command: requestedNpm });
  } else {
    const versionResult = spawnSync(resolvedNpm, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    npmVersion = `${versionResult.stdout || ""}\n${versionResult.stderr || ""}`.trim();
    if (versionResult.status !== 0 || !npmVersion) {
      issues.push({ code: "npm_version_unreadable", command: resolvedNpm });
    }
  }

  if (issues.length === 0) {
    const install = spawnSync(resolvedNpm, ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });
    installStatus = install.status == null ? 1 : install.status;
    const combined = `${install.stdout || ""}\n${install.stderr || ""}`.trim();
    outputSample = combined.slice(-2000);
    if (installStatus !== 0) {
      issues.push({
        code: "npm_ci_failed",
        status: installStatus,
        outputSample,
      });
    }
  }
} catch (err) {
  issues.push({
    code: "dependency_install_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-dependencies",
  root,
  appDir,
  npmCommand: requestedNpm,
  resolvedNpm,
  npmVersion,
  installStatus,
  durationMs: Date.now() - startedAt,
  installedPackageCount: issues.length === 0 ? countNodeModules(path.join(appDir, "node_modules")) : 0,
  rollback: {
    safeOnlyForFreshInstall: true,
    command: `rm -rf ${JSON.stringify(path.join(appDir, "node_modules"))}`,
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_service_user_phase() {
  node - "$ROOT" "$SERVICE_USERS" "$ALLOW_USER_CREATE" <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.argv[2];
const serviceUserCsv = process.argv[3] || "";
const allowCreate = process.argv[4] === "1";
const issues = [];
const actions = [];
const users = [...new Set(serviceUserCsv.split(",").map((item) => item.trim()).filter(Boolean))];

function commandExists(command) {
  const result = spawnSync("/usr/bin/env", ["bash", "-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseUser(result) {
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  const uidMatch = out.match(/UniqueID:\s*(\d+)/);
  const shellMatch = out.match(/UserShell:\s*(\S+)/);
  const homeMatch = out.match(/NFSHomeDirectory:\s*(\S+)/);
  const gidMatch = out.match(/PrimaryGroupID:\s*(\d+)/);
  return {
    uid: uidMatch ? Number(uidMatch[1]) : null,
    gid: gidMatch ? Number(gidMatch[1]) : null,
    shell: shellMatch ? shellMatch[1] : "",
    home: homeMatch ? homeMatch[1] : "",
  };
}

function userExists(dsclPath, user) {
  const result = run(dsclPath, [".", "-read", `/Users/${user}`]);
  if (result.status === 0) return { exists: true, metadata: parseUser(result) };
  return { exists: false, metadata: {} };
}

function findNextUid(dsclPath) {
  const result = run(dsclPath, [".", "-list", "/Users", "UniqueID"]);
  const ids = `${result.stdout || ""}`.split(/\n+/)
    .map((line) => Number((line.trim().split(/\s+/)[1] || "").trim()))
    .filter((value) => Number.isInteger(value) && value >= 500 && value < 900);
  let uid = 550;
  while (ids.includes(uid)) uid += 1;
  return uid;
}

function createUser(dsclPath, user, uid) {
  const home = `/Users/${user}`;
  const steps = [
    [".", "-create", `/Users/${user}`],
    [".", "-create", `/Users/${user}`, "UserShell", "/usr/bin/false"],
    [".", "-create", `/Users/${user}`, "RealName", `Home AI service user ${user}`],
    [".", "-create", `/Users/${user}`, "UniqueID", String(uid)],
    [".", "-create", `/Users/${user}`, "PrimaryGroupID", "20"],
    [".", "-create", `/Users/${user}`, "NFSHomeDirectory", home],
    [".", "-create", `/Users/${user}`, "Password", "*"],
  ];
  for (const args of steps) {
    const result = run(dsclPath, args);
    if (result.status !== 0) {
      return {
        ok: false,
        detail: `${result.stderr || result.stdout || `status=${result.status}`}`.trim().slice(-500),
      };
    }
  }
  return { ok: true };
}

function ensureHomeDirectory(user) {
  const home = `/Users/${user}`;
  try {
    if (fs.existsSync(home) && !fs.statSync(home).isDirectory()) {
      return { ok: false, code: "service_user_home_not_directory", detail: home };
    }
    const existed = fs.existsSync(home);
    fs.mkdirSync(home, { recursive: true, mode: 0o755 });
    fs.chmodSync(home, 0o755);
    const chown = run("/usr/sbin/chown", [`${user}:staff`, home]);
    if (chown.status !== 0) {
      return {
        ok: false,
        code: "service_user_home_chown_failed",
        detail: `${chown.stderr || chown.stdout || `status=${chown.status}`}`.trim().slice(-500),
      };
    }
    return { ok: true, existed, home };
  } catch (err) {
    return {
      ok: false,
      code: "service_user_home_create_failed",
      detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
    };
  }
}

try {
  if (os.platform() !== "darwin") {
    issues.push({ code: "macos_required", found: os.platform() });
  }
  if (users.length === 0) {
    issues.push({ code: "service_user_list_empty" });
  }
  const dsclPath = commandExists("dscl");
  if (!dsclPath) {
    issues.push({ code: "dscl_not_found" });
  }
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (allowCreate && !isRoot) {
    issues.push({ code: "root_required_for_user_create" });
  }

  if (issues.length === 0) {
    let nextUid = findNextUid(dsclPath);
    for (const user of users) {
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) {
        issues.push({ code: "service_user_name_invalid", user });
        continue;
      }
      const before = userExists(dsclPath, user);
      if (before.exists) {
        const home = `/Users/${user}`;
        if (!fs.existsSync(home)) {
          if (!allowCreate || !isRoot) {
            issues.push({
              code: "service_user_home_missing",
              user,
              home,
              remediation: "rerun as root with HOMEAI_INSTALL_ALLOW_USER_CREATE=1",
            });
          } else {
            const ensured = ensureHomeDirectory(user);
            if (!ensured.ok) {
              issues.push({ code: ensured.code, user, detail: ensured.detail });
            } else {
              actions.push({ user, action: "home-created", home, mode: "0755" });
            }
          }
        }
        actions.push({
          user,
          action: "exists",
          uid: before.metadata.uid,
          shell: before.metadata.shell,
          home: before.metadata.home,
        });
        continue;
      }
      if (!allowCreate) {
        issues.push({
          code: "service_user_missing",
          user,
          remediation: "rerun as root with HOMEAI_INSTALL_ALLOW_USER_CREATE=1",
        });
        continue;
      }
      const uid = nextUid;
      nextUid += 1;
      const created = createUser(dsclPath, user, uid);
      if (!created.ok) {
        issues.push({ code: "service_user_create_failed", user, detail: created.detail });
        continue;
      }
      const ensured = ensureHomeDirectory(user);
      if (!ensured.ok) {
        issues.push({ code: ensured.code, user, detail: ensured.detail });
        continue;
      }
      actions.push({ user, action: "created", uid, shell: "/usr/bin/false", home: `/Users/${user}` });
    }
  }
} catch (err) {
  issues.push({
    code: "service_user_phase_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const createdUsers = actions.filter((item) => item.action === "created").map((item) => item.user);
const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "create-service-users",
  root,
  platform: os.platform(),
  allowCreate,
  serviceUsers: users,
  actionCount: actions.length,
  createdCount: createdUsers.length,
  actions,
  rollback: {
    manualReviewRequired: true,
    commands: createdUsers.map((user) => `sudo dscl . -delete /Users/${user}`),
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_configure_owner_phase() {
  node - "$ROOT" "$OWNER_KEY_FILE" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const requestedOwnerKeyFile = String(process.argv[3] || "").trim();
const ownerKeyFile = path.resolve(requestedOwnerKeyFile || path.join(root, "data", "secrets", "owner-web-key.secret"));
const bridgeHostKeyFile = path.join(root, "data", "secrets", "bridge-host.secret");
const pluginSecretFiles = [
  path.join(root, "data", "plugin-secrets", "growth-registration-key.txt"),
  path.join(root, "data", "plugin-secrets", "health-registration-key.txt"),
  path.join(root, "data", "plugin-secrets", "email-registration-key.txt"),
];
const issues = [];
const actions = [];

function modeOctal(stat) {
  return `0${(stat.mode & 0o777).toString(8).padStart(3, "0")}`;
}

function readFirstNonEmptyLine(file) {
  const text = fs.readFileSync(file, "utf8");
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function ensureHexSecret(file, actionPrefix) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  if (fs.existsSync(file)) {
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      issues.push({ code: `${actionPrefix}_path_not_file`, path: path.relative(root, file) || file });
      return;
    }
    const key = readFirstNonEmptyLine(file);
    if (!key) {
      issues.push({ code: `${actionPrefix}_file_empty`, path: path.relative(root, file) || file });
      return;
    }
    if ((stat.mode & 0o077) !== 0) fs.chmodSync(file, 0o600);
    actions.push({ action: `${actionPrefix}-exists`, path: path.relative(root, file) || file, mode: modeOctal(fs.statSync(file)), keyLength: key.length });
    return;
  }
  fs.writeFileSync(file, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600, flag: "wx" });
  fs.chmodSync(file, 0o600);
  actions.push({ action: `${actionPrefix}-create`, path: path.relative(root, file) || file, mode: "0600", keyBytes: 32 });
}

try {
  const secretsDir = path.dirname(ownerKeyFile);
  fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(secretsDir, 0o700);
  actions.push({ action: "ensure-directory", path: path.relative(root, secretsDir) || secretsDir, mode: "0700" });

  if (fs.existsSync(ownerKeyFile)) {
    const stat = fs.statSync(ownerKeyFile);
    if (!stat.isFile()) {
      issues.push({ code: "owner_key_path_not_file", path: "<owner-key-file>" });
    } else {
      const key = readFirstNonEmptyLine(ownerKeyFile);
      if (!key) {
        issues.push({ code: "owner_key_file_empty", path: "<owner-key-file>" });
      }
      if ((stat.mode & 0o077) !== 0) {
        fs.chmodSync(ownerKeyFile, 0o600);
        actions.push({
          action: "chmod",
          path: path.relative(root, ownerKeyFile) || "<owner-key-file>",
          from: modeOctal(stat),
          mode: "0600",
        });
      } else {
        actions.push({
          action: "exists",
          path: path.relative(root, ownerKeyFile) || "<owner-key-file>",
          mode: modeOctal(stat),
        });
      }
    }
  } else {
    const key = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(ownerKeyFile, `${key}\n`, { mode: 0o600, flag: "wx" });
    fs.chmodSync(ownerKeyFile, 0o600);
    actions.push({
      action: "create",
      path: path.relative(root, ownerKeyFile) || "<owner-key-file>",
      mode: "0600",
      keyBytes: 32,
    });
  }
  if (issues.length === 0) {
    ensureHexSecret(bridgeHostKeyFile, "bridge-host-key");
    for (const file of pluginSecretFiles) ensureHexSecret(file, "plugin-registration-key");
  }
} catch (err) {
  issues.push({
    code: "configure_owner_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let keyStatus = "unknown";
let keyLength = 0;
try {
  if (fs.existsSync(ownerKeyFile) && fs.statSync(ownerKeyFile).isFile()) {
    const key = readFirstNonEmptyLine(ownerKeyFile);
    keyStatus = key ? "present" : "empty";
    keyLength = key.length;
  } else {
    keyStatus = "missing";
  }
} catch {
  keyStatus = "unreadable";
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "configure-owner",
  root,
  ownerKeyFile,
  keyStatus,
  keyLength,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyIfCreatedByThisPhase: true,
    commands: actions.some((item) => item.action === "create") ? [`rm -f ${JSON.stringify(ownerKeyFile)}`] : [],
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_workspace_isolation_phase() {
  node - "$ROOT" "$WORKSPACE_MAP" "$APPLY_WORKSPACE_ACL" <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const workspaceMapCsv = String(process.argv[3] || "");
const applyAcl = process.argv[4] === "1";
const issues = [];
const actions = [];
const aclPlan = [];

function modeString(mode) {
  return `0${mode.toString(8).padStart(3, "0")}`;
}

function parseWorkspaceMap(value) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [workspaceId, macUser, driveName] = entry.split(":").map((item) => String(item || "").trim());
    return { workspaceId, macUser, driveName: driveName || workspaceId };
  });
}

function validWorkspaceId(value) {
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(value || ""));
}

function validMacUser(value) {
  return /^hm-[a-z0-9][a-z0-9-]{0,62}$/.test(String(value || ""));
}

function userExists(user) {
  return spawnSync("/usr/bin/id", ["-u", user], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "workspace_isolation_path_not_directory", path: path.relative(root, target) || target });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({
    action: existed ? "chmod" : "mkdir",
    path: path.relative(root, target) || ".",
    mode: modeString(mode),
    existed,
  });
}

function chown(target, owner) {
  const result = run("/usr/sbin/chown", ["-R", owner, target]);
  if (result.status !== 0) {
    issues.push({
      code: "workspace_isolation_chown_failed",
      path: path.relative(root, target) || target,
      owner,
      detail: String(result.stderr || result.stdout || `status=${result.status}`).trim().slice(-300),
    });
    return;
  }
  actions.push({ action: "chown", path: path.relative(root, target) || target, owner });
}

function chmodAcl(user, target, permissions, recursive = false) {
  const args = [recursive ? "-R" : "", "+a", `user:${user} allow ${permissions}`, target].filter(Boolean);
  aclPlan.push({
    user,
    path: path.relative(root, target) || target,
    permissions,
    recursive,
  });
  if (!applyAcl) return;
  const result = run("/bin/chmod", args);
  if (result.status !== 0) {
    issues.push({
      code: "workspace_isolation_acl_failed",
      user,
      path: path.relative(root, target) || target,
      detail: String(result.stderr || result.stdout || `status=${result.status}`).trim().slice(-300),
    });
  } else {
    actions.push({ action: "acl", user, path: path.relative(root, target) || target, recursive });
  }
}

try {
  if (os.platform() !== "darwin") {
    issues.push({ code: "macos_required", found: os.platform() });
  }
  if (applyAcl && typeof process.getuid === "function" && process.getuid() !== 0) {
    issues.push({ code: "root_required_for_workspace_acl" });
  }
  const workspaces = parseWorkspaceMap(workspaceMapCsv);
  if (!workspaces.length) {
    issues.push({ code: "workspace_map_empty" });
  }
  for (const item of workspaces) {
    if (!validWorkspaceId(item.workspaceId) || !validMacUser(item.macUser) || !validWorkspaceId(item.driveName)) {
      issues.push({ code: "workspace_map_invalid", entry: `${item.workspaceId}:${item.macUser}:${item.driveName}` });
    }
  }

  if (issues.length === 0) {
    const data = path.join(root, "data");
    const drive = path.join(data, "drive");
    const driveUsers = path.join(drive, "users");
    const uploads = path.join(data, "uploads");
    const skillProfiles = path.join(data, "skill-profiles");
    const artifacts = path.join(data, "artifacts");
    ensureDir(data, 0o750);
    ensureDir(drive, 0o750);
    ensureDir(driveUsers, 0o750);
    ensureDir(uploads, 0o770);
    ensureDir(skillProfiles, 0o750);
    ensureDir(path.join(artifacts, "http-request"), 0o770);
    ensureDir(path.join(artifacts, "grok-videos"), 0o770);

    for (const item of workspaces) {
      const workerHome = path.join("/Users", item.macUser);
      const workerWorkspaceRoot = path.join(workerHome, "HermesWorkspace");
      const workspaceDataRoot = item.workspaceId === "owner" ? path.join(drive, item.driveName) : path.join(driveUsers, item.driveName);
      const ownerPluginRoot = item.workspaceId === "owner" ? path.join(drive, "插件") : "";
      const ownerPluginFolders = ownerPluginRoot ? ["衣橱", "记账", "邮箱", "健康", "笔记"].map((folder) => path.join(ownerPluginRoot, folder)) : [];
      const skillStoreId = item.workspaceId === "owner" ? "owner-full" : item.workspaceId;
      const skillRoot = path.join(skillProfiles, skillStoreId);
      ensureDir(workspaceDataRoot, 0o700);
      if (ownerPluginRoot) {
        ensureDir(ownerPluginRoot, 0o750);
        for (const pluginFolder of ownerPluginFolders) ensureDir(pluginFolder, 0o700);
      }
      ensureDir(path.join(skillRoot, "skills"), 0o700);
      ensureDir(path.join(skillRoot, "memories"), 0o700);
      if (applyAcl) {
        if (!userExists(item.macUser)) {
          issues.push({ code: "workspace_user_missing", user: item.macUser });
          continue;
        }
        ensureDir(workerWorkspaceRoot, 0o700);
        ensureDir(path.join(workerWorkspaceRoot, ".hermes-gateway"), 0o700);
        ensureDir(path.join(workerWorkspaceRoot, ".hermes-gateway", "profiles"), 0o700);
        ensureDir(path.join(workerWorkspaceRoot, ".hermes-gateway", "logs"), 0o700);
        chown(workerWorkspaceRoot, `${item.macUser}:staff`);
        chown(workspaceDataRoot, `${item.macUser}:staff`);
        if (ownerPluginRoot) chown(ownerPluginRoot, `${item.macUser}:staff`);
        for (const pluginFolder of ownerPluginFolders) chown(pluginFolder, `${item.macUser}:staff`);
        chown(skillRoot, `${item.macUser}:staff`);
        chmodAcl(item.macUser, root, "search,readattr,readextattr,readsecurity");
        chmodAcl(item.macUser, data, "list,search,readattr,readextattr,readsecurity");
        if (item.workspaceId === "owner") {
          chmodAcl(item.macUser, drive, "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit");
        } else {
          chmodAcl(item.macUser, drive, "list,search,readattr,readextattr,readsecurity");
        }
        if (workspaceDataRoot.startsWith(`${driveUsers}${path.sep}`)) {
          chmodAcl(item.macUser, driveUsers, "list,search,readattr,readextattr,readsecurity");
        }
        chmodAcl(item.macUser, workspaceDataRoot, "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit", true);
        if (ownerPluginRoot) {
          chmodAcl(item.macUser, ownerPluginRoot, "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit", true);
        }
        chmodAcl(item.macUser, uploads, "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit", true);
      } else {
        aclPlan.push({
          user: item.macUser,
          path: path.relative(root, workspaceDataRoot) || workspaceDataRoot,
          permissions: "workspace read/write ACL requires HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1",
          recursive: true,
        });
      }
    }
  }
} catch (err) {
  issues.push({
    code: "workspace_isolation_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "configure-workspace-isolation",
  root,
  applyAcl,
  workspaceMap: parseWorkspaceMap(workspaceMapCsv),
  actionCount: actions.length,
  actions,
  aclPlan,
  rollback: {
    manualReviewRequired: true,
    note: "Do not delete workspace data roots automatically after first install.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_gateway_profiles_phase() {
  node - "$ROOT" "$WORKSPACE_MAP" "$GATEWAY_OPENAI_WORKERS" "$APP_SOURCE" "$GATEWAY_DEEPSEEK_WORKERS" "$GATEWAY_OWNER_GROK_WORKERS" "$GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS" "$GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { renderGatewayConfigYaml } = require(path.join(process.argv[5], "scripts", "build-gateway-profile-template.js"));

const root = path.resolve(process.argv[2]);
const workspaceMapCsv = String(process.argv[3] || "");
const openAiWorkersPerWorkspace = Number(process.argv[4] || 2);
const deepSeekWorkersPerWorkspace = Number(process.argv[6] || 1);
const ownerGrokWorkers = Number(process.argv[7] || 1);
const ownerMaintenanceOpenAiWorkers = Number(process.argv[8] || 2);
const ownerMaintenanceDeepSeekWorkers = Number(process.argv[9] || 1);
const dataDir = path.join(root, "data");
const manifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
const secretsDir = path.join(dataDir, "secrets", "gateway-workers");
const profileHomeRoot = path.join(root, "users");
const telemetryRoot = path.join(dataDir, "gateway-telemetry", "profiles");
const issues = [];
const actions = [];
const createdProfiles = [];
const createdKeyFiles = [];

const STANDARD_TOOLSETS = [
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
  "current_environment",
  "cronjob_mobile",
];
const GROK_TOOLSETS = [
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "video_gen",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
  "current_environment",
  "cronjob_mobile",
];
const MAINTENANCE_TOOLSETS = [
  ...STANDARD_TOOLSETS,
  "chatgpt_pro",
  "hermes-cli",
];

function modeString(mode) {
  return `0${mode.toString(8).padStart(3, "0")}`;
}

function rel(file) {
  return path.relative(root, file) || ".";
}

function parseWorkspaceMap(value) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [workspaceId, macUser, driveName] = entry.split(":").map((item) => String(item || "").trim());
    return { workspaceId, macUser, driveName: driveName || workspaceId };
  });
}

function validWorkspaceId(value) {
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(value || ""));
}

function validMacUser(value) {
  return /^hm-[a-z0-9][a-z0-9-]{0,62}$/.test(String(value || ""));
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "gateway_profile_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: modeString(mode), existed });
}

function readManifestIfExists() {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    issues.push({ code: "gateway_manifest_invalid_json", path: rel(manifestPath), detail: err && err.name ? err.name : "parse_failed" });
    return null;
  }
}

function ensureKeyFile(file) {
  const existed = fs.existsSync(file);
  if (existed && !fs.statSync(file).isFile()) {
    issues.push({ code: "gateway_key_path_not_file", path: rel(file) });
    return;
  }
  if (!existed) {
    fs.writeFileSync(file, `${crypto.randomBytes(48).toString("base64url")}\n`, { mode: 0o600, flag: "wx" });
    createdKeyFiles.push(file);
    actions.push({ action: "create-key-file", path: rel(file), mode: "0600" });
  }
  fs.chmodSync(file, 0o600);
}

function ensureSymlink(linkPath, targetPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
      if (current === targetPath) {
        actions.push({ action: "symlink-exists", path: rel(linkPath), target: rel(targetPath) });
        return;
      }
    }
    issues.push({ code: "gateway_profile_link_conflict", path: rel(linkPath) });
    return;
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      issues.push({ code: "gateway_profile_link_check_failed", path: rel(linkPath), detail: err.code || "lstat_failed" });
      return;
    }
  }
  fs.symlinkSync(targetPath, linkPath);
  actions.push({ action: "symlink", path: rel(linkPath), target: rel(targetPath) });
}

function skillStoreIdFor(workspaceId) {
  return workspaceId === "owner" ? "owner-full" : workspaceId;
}

function boundedInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function workerFor(options) {
  const item = options.workspace;
  const profile = options.profile;
  const profileDir = path.join(profileHomeRoot, item.macUser, "HermesWorkspace", ".hermes-gateway", "profiles", profile);
  const keyFile = path.join(secretsDir, `${profile}.key`);
  const templateKey = `${item.workspaceId}|${options.securityLevel}|${options.provider}`;
  const skillStoreId = skillStoreIdFor(item.workspaceId);
  const worker = {
    id: profile,
    name: profile,
    profile,
    replicaId: profile,
    profileAlias: profile,
    profileTemplateKey: templateKey,
    poolKey: templateKey,
    host: "127.0.0.1",
    port: options.port,
    apiKeyFile: keyFile,
    enabled: true,
    securityLevel: options.securityLevel,
    provider: options.provider,
    allowedWorkspaceIds: [item.workspaceId],
    osUser: item.macUser,
    launchdLabel: options.launchdLabel,
    skillProfile: item.workspaceId === "owner" ? "owner-full" : `workspace:${item.workspaceId}`,
    skillWorkspaceIds: [item.workspaceId],
    toolsets: options.toolsets,
    configPath: path.join(profileDir, "config.yaml"),
    telemetryStateDbPath: path.join(telemetryRoot, profile, "state.db"),
    telemetryResponseStoreDbPath: path.join(telemetryRoot, profile, "response_store.db"),
    authStatus: "provider-auth-not-copied",
    configKind: options.configKind,
  };
  if (options.securityLevel === "owner-maintenance") {
    worker.allowMaintenance = true;
    worker.allowedWorkspaceIds = ["owner"];
    worker.skillWorkspaceIds = ["owner"];
    worker.skillProfile = "owner-full";
  }
  return worker;
}

function writeProfileConfig(worker) {
  const profileDir = path.dirname(worker.configPath);
  const skillStoreId = skillStoreIdFor(worker.allowedWorkspaceIds[0]);
  const skillRoot = path.join(dataDir, "skill-profiles", skillStoreId);
  ensureDir(profileDir, 0o700);
  ensureDir(path.join(skillRoot, "skills"), 0o700);
  ensureDir(path.join(skillRoot, "memories"), 0o700);
  ensureDir(path.dirname(worker.telemetryStateDbPath), 0o700);
  ensureKeyFile(worker.apiKeyFile);
  ensureSymlink(path.join(profileDir, "skills"), path.join(skillRoot, "skills"));
  ensureSymlink(path.join(profileDir, "memories"), path.join(skillRoot, "memories"));
  if (!fs.existsSync(worker.configPath)) {
    const yaml = renderGatewayConfigYaml({
      configKind: worker.configKind || "profile",
      values: {
        profile: worker.profile,
        port: String(worker.port),
        provider: worker.provider,
        weather_plugin_enabled: "true",
        http_plugin_enabled: "true",
        current_environment_plugin_enabled: "true",
        docx_plugin_enabled: "true",
        pptx_plugin_enabled: "true",
        pdf_plugin_enabled: "true",
        image_plugin_enabled: "true",
        audio_plugin_enabled: "true",
        archive_plugin_enabled: "true",
        cronjob_plugin_enabled: "true",
        video_plugin_enabled: worker.provider === "xai-oauth" ? "true" : "false",
        profile_link: profileDir,
      },
    });
    fs.writeFileSync(worker.configPath, yaml, { encoding: "utf8", mode: 0o600, flag: "wx" });
    createdProfiles.push(worker.profile);
    actions.push({ action: "create-config", profile: worker.profile, path: rel(worker.configPath), mode: "0600" });
  } else {
    actions.push({ action: "config-exists", profile: worker.profile, path: rel(worker.configPath) });
  }
}

try {
  const workspaces = parseWorkspaceMap(workspaceMapCsv);
  const ownerWorkspace = workspaces.find((item) => item.workspaceId === "owner") || null;
  const boundedOpenAiWorkers = boundedInteger(openAiWorkersPerWorkspace, 2, 1, 4);
  const boundedDeepSeekWorkers = boundedInteger(deepSeekWorkersPerWorkspace, 1, 0, 2);
  const boundedOwnerGrokWorkers = boundedInteger(ownerGrokWorkers, 1, 0, 1);
  const boundedOwnerMaintenanceOpenAiWorkers = boundedInteger(ownerMaintenanceOpenAiWorkers, 2, 0, 2);
  const boundedOwnerMaintenanceDeepSeekWorkers = boundedInteger(ownerMaintenanceDeepSeekWorkers, 1, 0, 2);
  if (!workspaces.length) issues.push({ code: "workspace_map_empty" });
  if (boundedOpenAiWorkers !== openAiWorkersPerWorkspace) {
    issues.push({ code: "gateway_openai_worker_count_invalid", value: openAiWorkersPerWorkspace });
  }
  if (boundedDeepSeekWorkers !== deepSeekWorkersPerWorkspace) {
    issues.push({ code: "gateway_deepseek_worker_count_invalid", value: deepSeekWorkersPerWorkspace });
  }
  if (boundedOwnerGrokWorkers !== ownerGrokWorkers) {
    issues.push({ code: "gateway_owner_grok_worker_count_invalid", value: ownerGrokWorkers });
  }
  if (boundedOwnerMaintenanceOpenAiWorkers !== ownerMaintenanceOpenAiWorkers) {
    issues.push({ code: "gateway_owner_maintenance_openai_worker_count_invalid", value: ownerMaintenanceOpenAiWorkers });
  }
  if (boundedOwnerMaintenanceDeepSeekWorkers !== ownerMaintenanceDeepSeekWorkers) {
    issues.push({ code: "gateway_owner_maintenance_deepseek_worker_count_invalid", value: ownerMaintenanceDeepSeekWorkers });
  }
  if ((boundedOwnerGrokWorkers > 0 || boundedOwnerMaintenanceOpenAiWorkers > 0 || boundedOwnerMaintenanceDeepSeekWorkers > 0) && !ownerWorkspace) {
    issues.push({ code: "gateway_owner_workspace_required_for_owner_profiles" });
  }
  for (const item of workspaces) {
    if (!validWorkspaceId(item.workspaceId) || !validMacUser(item.macUser)) {
      issues.push({ code: "workspace_map_invalid", entry: `${item.workspaceId}:${item.macUser}:${item.driveName}` });
    }
  }

  ensureDir(dataDir, 0o750);
  ensureDir(path.join(dataDir, "secrets"), 0o700);
  ensureDir(secretsDir, 0o700);
  ensureDir(profileHomeRoot, 0o750);

  const existingManifest = readManifestIfExists();
  if (issues.length === 0 && existingManifest && Array.isArray(existingManifest.workers) && existingManifest.workers.length > 0) {
    const workers = existingManifest.workers;
    for (const worker of workers) {
      if (worker.api_key || worker.apiKey) {
        issues.push({ code: "gateway_manifest_inline_api_key_not_allowed", profile: worker.profile || worker.name || "" });
      }
      const keyFile = String(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path || "").trim();
      if (!keyFile) issues.push({ code: "gateway_manifest_worker_missing_key_file", profile: worker.profile || worker.name || "" });
      else if (fs.existsSync(keyFile) && fs.statSync(keyFile).isFile()) fs.chmodSync(keyFile, 0o600);
    }
    actions.push({ action: "preserve-existing-manifest", path: rel(manifestPath), workerCount: workers.length });
  } else if (issues.length === 0) {
    const workers = [];
    let port = 18751;
    for (const item of workspaces) {
      for (let ordinal = 1; ordinal <= boundedOpenAiWorkers; ordinal += 1) {
        const profile = `${item.macUser}-openai-${ordinal}`;
        const worker = workerFor({
          workspace: item,
          profile,
          port,
          provider: "openai-codex",
          securityLevel: "user",
          toolsets: STANDARD_TOOLSETS,
          configKind: "profile",
          launchdLabel: `com.hermesmobile.gateway.${item.macUser}.openai.${ordinal}`,
        });
        port += 1;
        writeProfileConfig(worker);
        workers.push(worker);
      }
      for (let ordinal = 1; ordinal <= boundedDeepSeekWorkers; ordinal += 1) {
        const profile = `${item.macUser}-deepseek-${ordinal}`;
        const worker = workerFor({
          workspace: item,
          profile,
          port,
          provider: "deepseek",
          securityLevel: "user",
          toolsets: STANDARD_TOOLSETS,
          configKind: "profile",
          launchdLabel: `com.hermesmobile.gateway.${item.macUser}.deepseek.${ordinal}`,
        });
        port += 1;
        writeProfileConfig(worker);
        workers.push(worker);
      }
    }
    if (ownerWorkspace) {
      for (let ordinal = 1; ordinal <= boundedOwnerGrokWorkers; ordinal += 1) {
        const profile = `grokgw${ordinal}`;
        const worker = workerFor({
          workspace: ownerWorkspace,
          profile,
          port,
          provider: "xai-oauth",
          securityLevel: "user",
          toolsets: GROK_TOOLSETS,
          configKind: "grok",
          launchdLabel: `com.hermesmobile.gateway.${ownerWorkspace.macUser}.grok.${ordinal}`,
        });
        port += 1;
        writeProfileConfig(worker);
        workers.push(worker);
      }
      for (let ordinal = 1; ordinal <= boundedOwnerMaintenanceOpenAiWorkers; ordinal += 1) {
        const profile = `officialclean${ordinal}`;
        const worker = workerFor({
          workspace: ownerWorkspace,
          profile,
          port,
          provider: "openai-codex",
          securityLevel: "owner-maintenance",
          toolsets: MAINTENANCE_TOOLSETS,
          configKind: "maintenance",
          launchdLabel: `com.hermesmobile.gateway.${ownerWorkspace.macUser}.maintenance.openai.${ordinal}`,
        });
        port += 1;
        writeProfileConfig(worker);
        workers.push(worker);
      }
      for (let ordinal = 1; ordinal <= boundedOwnerMaintenanceDeepSeekWorkers; ordinal += 1) {
        const profile = `deepseekmaint${ordinal}`;
        const worker = workerFor({
          workspace: ownerWorkspace,
          profile,
          port,
          provider: "deepseek",
          securityLevel: "owner-maintenance",
          toolsets: MAINTENANCE_TOOLSETS,
          configKind: "maintenance",
          launchdLabel: `com.hermesmobile.gateway.${ownerWorkspace.macUser}.maintenance.deepseek.${ordinal}`,
        });
        port += 1;
        writeProfileConfig(worker);
        workers.push(worker);
      }
    }
    if (issues.length === 0) {
      const manifest = {
        enabled: true,
        version: 1,
        generatedBy: "install-macos-production configure-gateway-profiles",
        generatedAt: new Date().toISOString(),
        authStatus: "provider-auth-not-copied",
        workers,
      };
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      fs.chmodSync(manifestPath, 0o600);
      actions.push({ action: "write-manifest", path: rel(manifestPath), workerCount: workers.length, mode: "0600" });
    }
  }
} catch (err) {
  issues.push({
    code: "configure_gateway_profiles_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let manifestWorkerCount = 0;
try {
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifestWorkerCount = Array.isArray(manifest.workers) ? manifest.workers.length : 0;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "configure-gateway-profiles",
  root,
  manifestPath,
  openAiWorkersPerWorkspace,
  deepSeekWorkersPerWorkspace,
  ownerGrokWorkers,
  ownerMaintenanceOpenAiWorkers,
  ownerMaintenanceDeepSeekWorkers,
  workspaceCount: parseWorkspaceMap(workspaceMapCsv).length,
  manifestWorkerCount,
  createdProfileCount: createdProfiles.length,
  createdProfiles,
  createdKeyFileCount: createdKeyFiles.length,
  createdKeyFiles: createdKeyFiles.map(rel),
  authStatus: "provider-auth-not-copied",
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeFirstRun: true,
    commands: createdKeyFiles.map((file) => `rm -f ${JSON.stringify(file)}`).concat(
      createdProfiles.map((profile) => `rm -rf ${JSON.stringify(path.join(profileHomeRoot, "*", "HermesWorkspace", ".hermes-gateway", "profiles", profile))}`),
      [`rm -f ${JSON.stringify(manifestPath)}`],
    ),
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_gateway_launchd_services_phase() {
  node - "$ROOT" "$APPLY_LAUNCHD_SERVICES" "$LAUNCH_DAEMONS_DIR" "$LAUNCHCTL_COMMAND" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const applyLaunchd = process.argv[3] === "1";
const launchDaemonsDir = path.resolve(process.argv[4] || "/Library/LaunchDaemons");
const launchctlCommand = process.argv[5] || "/bin/launchctl";
const dataDir = path.join(root, "data");
const manifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
const stagingDir = path.join(dataDir, "launchd-staging", "gateway");
const planPath = path.join(dataDir, "gateway-launchd-services-plan.json");
const issues = [];
const actions = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "gateway_launchd_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: `0${mode.toString(8)}`, existed });
}

function safeProfile(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(text) ? text : "";
}

function safeMacUser(value) {
  const text = String(value || "").trim();
  return /^hm-[a-z0-9][a-z0-9-]{0,62}$/.test(text) ? text : "";
}

function safeLaunchdLabel(value) {
  const text = String(value || "").trim();
  return /^com\.hermesmobile\.gateway\.[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function providerFamily(worker) {
  const provider = String(worker.provider || "").toLowerCase();
  if (provider.includes("deepseek")) return "deepseek";
  if (provider.includes("xai") || provider.includes("grok")) return "grok";
  if (String(worker.securityLevel || worker.security_level || "").toLowerCase() === "owner-maintenance") return "maintenance";
  return "openai";
}

function labelFor(worker, providerOrdinal) {
  const existing = safeLaunchdLabel(worker.launchdLabel || worker.launchd_label);
  if (existing) return existing;
  const osUser = safeMacUser(worker.osUser || worker.os_user);
  if (!osUser) return "";
  return `com.hermesmobile.gateway.${osUser}.${providerFamily(worker)}.${providerOrdinal}`;
}

function workspaceRootForProfileDir(profileDir) {
  return path.dirname(gatewayDirForProfileDir(profileDir));
}

function gatewayDirForProfileDir(profileDir) {
  return path.dirname(path.dirname(profileDir));
}

function chownRecursive(target, owner) {
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (!isRoot) {
    actions.push({ action: "chown-skipped-nonroot", path: rel(target), owner });
    return;
  }
  const result = spawnSync("/usr/sbin/chown", ["-R", owner, target], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    issues.push({
      code: "gateway_profile_chown_failed",
      path: rel(target),
      owner,
      status: result.status,
      outputSample: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500),
    });
  }
}

function chmodRecursive(target, mode) {
  const result = spawnSync("/bin/chmod", ["-R", mode, target], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    issues.push({
      code: "gateway_profile_chmod_failed",
      path: rel(target),
      mode,
      status: result.status,
      outputSample: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500),
    });
  }
}

function ensureConfigPluginEnabled(configPath, pluginName) {
  let text = "";
  try {
    text = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  } catch (_) {
    issues.push({ code: "gateway_profile_config_read_failed", path: rel(configPath) });
    return false;
  }
  if (new RegExp(`^\\s*-\\s*${pluginName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(text)) {
    return false;
  }
  const lines = text ? text.split(/\r?\n/) : [];
  let pluginsIndex = lines.findIndex((line) => /^plugins:\s*$/.test(line));
  if (pluginsIndex < 0) {
    const prefix = lines.length && lines[lines.length - 1].trim() ? [""] : [];
    lines.push(...prefix, "plugins:", "  enabled:", `    - ${pluginName}`);
  } else {
    let sectionEnd = lines.length;
    for (let index = pluginsIndex + 1; index < lines.length; index += 1) {
      if (/^\S.*:\s*$/.test(lines[index])) {
        sectionEnd = index;
        break;
      }
    }
    let enabledIndex = -1;
    for (let index = pluginsIndex + 1; index < sectionEnd; index += 1) {
      if (/^\s{2}enabled:\s*(?:\[\])?\s*$/.test(lines[index])) {
        enabledIndex = index;
        break;
      }
    }
    if (enabledIndex < 0) {
      lines.splice(pluginsIndex + 1, 0, "  enabled:", `    - ${pluginName}`);
    } else if (/^\s{2}enabled:\s*\[\]\s*$/.test(lines[enabledIndex])) {
      lines.splice(enabledIndex, 1, "  enabled:", `    - ${pluginName}`);
    } else {
      let insertAt = enabledIndex + 1;
      while (insertAt < sectionEnd && /^\s{4}-\s+/.test(lines[insertAt])) insertAt += 1;
      lines.splice(insertAt, 0, `    - ${pluginName}`);
    }
  }
  fs.writeFileSync(configPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  fs.chmodSync(configPath, 0o600);
  actions.push({ action: "enable-gateway-profile-plugin", path: rel(configPath), plugin: pluginName });
  return true;
}

function syncProfilePlugin(profileDir, osUser, pluginName) {
  const source = path.join(root, "app", "gateway-plugins", pluginName);
  if (!fs.existsSync(path.join(source, "plugin.yaml")) || !fs.existsSync(path.join(source, "__init__.py"))) {
    issues.push({ code: "gateway_profile_plugin_source_missing", plugin: pluginName, path: rel(source) });
    return;
  }
  const pluginRoot = path.join(profileDir, "plugins");
  ensureDir(pluginRoot, 0o700);
  const target = path.join(pluginRoot, pluginName);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  chmodRecursive(target, "u+rwX,go-rwx");
  chownRecursive(target, `${osUser}:staff`);
  actions.push({ action: "sync-gateway-profile-plugin", path: rel(target), plugin: pluginName });
}

function syncProfileDocumentFilePlugins(profileDir, osUser) {
  for (const pluginName of [
    "hermes-mobile-docx",
    "hermes-mobile-pptx",
    "hermes-mobile-pdf",
    "hermes-mobile-audio",
    "hermes-mobile-archive",
  ]) {
    syncProfilePlugin(profileDir, osUser, pluginName);
    ensureConfigPluginEnabled(path.join(profileDir, "config.yaml"), pluginName);
  }
}

function startScriptFor(worker, profileDir, startScript, manifestFile) {
  const profile = safeProfile(worker.profile || worker.name);
  const osUser = safeMacUser(worker.osUser || worker.os_user);
  const workerHome = path.join("/Users", osUser);
  const workerWorkspaceRoot = workspaceRootForProfileDir(profileDir);
  const port = Number(worker.port || 0);
  return `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(root)}
PROFILE=${JSON.stringify(profile)}
PORT=${JSON.stringify(String(port))}
MANIFEST=${JSON.stringify(manifestFile)}
PROFILE_DIR=${JSON.stringify(profileDir)}
RUNTIME_PYTHON="$ROOT/runtime/hermes-agent-official/venv/bin/python"
RUNTIME_SOURCE="$ROOT/runtime/hermes-agent-official/source"
RUNTIME_OVERRIDES="$ROOT/app/gateway-runtime-overrides"
FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"
MOBILE_BRIDGE_HOST_URL="\${HERMES_MOBILE_BRIDGE_HOST_URL:-\${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"
MOBILE_BRIDGE_HOST_KEY_PATH="\${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-\${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"
export HERMES_MOBILE_DOCX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_PPTX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_PPTX_OUTPUT_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_PDF_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_PDF_OUTPUT_ROOTS="$ROOT/data/artifacts"
export HERMES_MOBILE_NODE_MODULES="$ROOT/app/node_modules"
export HERMES_MOBILE_APP_ROOT="$ROOT/app"
export HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_IMAGE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_VIDEO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_HTTP_FILE_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"
export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="$ROOT/data/drive/users"
export HERMES_MOBILE_HTTP_SAVE_ROOT="$ROOT/data/artifacts/http-request"
export HERMES_MOBILE_VIDEO_OUTPUT_ROOT="$ROOT/data/artifacts/grok-videos"
read_worker_field() {
  "$RUNTIME_PYTHON" - "$MANIFEST" "$PROFILE" "$1" <<'PY'
import json, sys
manifest_path, profile, field = sys.argv[1:4]
try:
    data = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    raise SystemExit(0)
for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    for name in field.split("|"):
        value = worker.get(name)
        if value:
            print(str(value).strip())
            raise SystemExit(0)
PY
}
api_key_file="$(read_worker_field 'apiKeyFile|api_key_file|apiKeyPath|api_key_path')"
api_server_key="$(read_worker_field 'apiKey|api_key')"
if [ -n "$api_key_file" ] && [ -s "$api_key_file" ]; then
  api_server_key="$(tr -d '\\r\\n' < "$api_key_file")"
fi
if [ -z "$api_server_key" ]; then
  echo "missing Gateway API key for $PROFILE" >&2
  exit 1
fi
deepseek_api_key=""
deepseek_api_key_file="$(read_worker_field 'deepseekApiKeyFile|deepseek_api_key_file|providerKeyFile|provider_key_file')"
if [ -z "$deepseek_api_key_file" ]; then
  deepseek_api_key_file="$ROOT/data/secrets/deepseek-api-key.secret"
fi
if [ -s "$deepseek_api_key_file" ]; then
  deepseek_api_key="$(tr -d '\\r\\n' < "$deepseek_api_key_file")"
fi
mkdir -p "$PROFILE_DIR/logs"
exec env HOME=${JSON.stringify(workerHome)} HERMES_HOME="$PROFILE_DIR" HERMES_PROFILE="$PROFILE" HERMES_WORKSPACE_ROOT=${JSON.stringify(workerWorkspaceRoot)} HERMES_GOOGLE_PROFILE_HOME="$PROFILE_DIR" HERMES_MOBILE_ROOT="$ROOT" HERMES_WEB_ROOT="$ROOT" HERMES_MOBILE_GATEWAY_POOL_MANIFEST="$MANIFEST" HERMES_WEB_GATEWAY_POOL_MANIFEST="$MANIFEST" HERMES_GATEWAY_POOL_MANIFEST_PATH="$MANIFEST" HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL" HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH" PYTHONPATH="$RUNTIME_OVERRIDES:$RUNTIME_SOURCE" PATH="$ROOT/runtime/node-current/bin:$ROOT/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin" HERMES_ACCEPT_HOOKS=1 HERMES_KANBAN_DISPATCH_IN_GATEWAY=0 API_SERVER_KEY="$api_server_key" DEEPSEEK_API_KEY="$deepseek_api_key" "$RUNTIME_PYTHON" -m hermes_cli.main gateway run --replace --accept-hooks
`;
}

function plistFor(worker, label, profileDir, startScript) {
  const profile = safeProfile(worker.profile || worker.name);
  const osUser = safeMacUser(worker.osUser || worker.os_user);
  const logs = path.join(profileDir, "logs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xmlEscape(label)}</string>
  <key>UserName</key><string>${xmlEscape(osUser)}</string>
  <key>WorkingDirectory</key><string>${xmlEscape(profileDir)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(startScript)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${xmlEscape(path.join("/Users", osUser))}</string>
    <key>HERMES_HOME</key><string>${xmlEscape(profileDir)}</string>
    <key>HERMES_PROFILE</key><string>${xmlEscape(profile)}</string>
    <key>HERMES_WORKSPACE_ROOT</key><string>${xmlEscape(path.join(root, "users", osUser, "HermesWorkspace"))}</string>
    <key>PATH</key><string>${xmlEscape(`${root}/runtime/node-current/bin:${root}/runtime/hermes-agent-official/venv/bin:/usr/local/bin:/usr/bin:/bin`)}</string>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(logs, `${profile}.stdout.log`))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(logs, `${profile}.stderr.log`))}</string>
</dict>
</plist>
`;
}

function runLaunchctl(args, allowFailure = false) {
  const result = spawnSync(launchctlCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputSample = `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500);
  if (result.status !== 0 && !allowFailure) {
    issues.push({
      code: "gateway_launchd_launchctl_failed",
      command: path.basename(launchctlCommand),
      args,
      status: result.status,
      outputSample,
    });
  }
  return { status: result.status == null ? 1 : result.status, outputSample };
}

function applyServicePlans(servicePlans) {
  if (!applyLaunchd) return;
  const requiresRoot = launchDaemonsDir === "/Library/LaunchDaemons";
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (requiresRoot && !isRoot) {
    issues.push({ code: "root_required_for_gateway_launchd_install", launchDaemonsDir });
    return;
  }
  if (!fs.existsSync(launchctlCommand)) {
    issues.push({ code: "launchctl_command_missing", command: launchctlCommand });
    return;
  }
  ensureDir(launchDaemonsDir, 0o755);
  for (const service of servicePlans) {
    fs.copyFileSync(service.stagedPlistPath, service.productionPlistPath);
    fs.chmodSync(service.productionPlistPath, 0o644);
    service.installStatus = "installed";
    actions.push({ action: "install-gateway-plist", label: service.label, path: service.productionPlistPath, mode: "0644" });
    const unload = runLaunchctl(["unload", "-w", service.productionPlistPath], true);
    actions.push({ action: "launchctl-unload", label: service.label, status: unload.status, ignoredFailure: unload.status !== 0 });
    const load = runLaunchctl(["load", "-w", service.productionPlistPath]);
    actions.push({ action: "launchctl-load", label: service.label, status: load.status });
    if (load.status === 0) service.installStatus = "installed-and-loaded";
  }
}

try {
  ensureDir(dataDir, 0o750);
  ensureDir(stagingDir, 0o755);
  if (!fs.existsSync(manifestPath)) {
    issues.push({ code: "gateway_manifest_missing", path: rel(manifestPath) });
  }
  const manifest = issues.length === 0 ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { workers: [] };
  const enabledWorkers = (Array.isArray(manifest.workers) ? manifest.workers : []).filter((worker) => worker && worker.enabled !== false);
  if (issues.length === 0 && enabledWorkers.length === 0) {
    issues.push({ code: "gateway_manifest_workers_empty", path: rel(manifestPath) });
  }
  const providerOrdinals = {};
  const servicePlans = [];
  for (const worker of enabledWorkers) {
    const profile = safeProfile(worker.profile || worker.name);
    const osUser = safeMacUser(worker.osUser || worker.os_user);
    if (!profile) {
      issues.push({ code: "gateway_worker_profile_invalid", profile: String(worker.profile || worker.name || "") });
      continue;
    }
    if (!osUser) {
      issues.push({ code: "gateway_worker_os_user_invalid", profile });
      continue;
    }
    const family = providerFamily(worker);
    providerOrdinals[`${osUser}:${family}`] = (providerOrdinals[`${osUser}:${family}`] || 0) + 1;
    const label = labelFor(worker, providerOrdinals[`${osUser}:${family}`]);
    if (!label) {
      issues.push({ code: "gateway_worker_launchd_label_invalid", profile });
      continue;
    }
    const profileDir = worker.configPath
      ? path.dirname(worker.configPath)
      : path.join(root, "users", osUser, "HermesWorkspace", ".hermes-gateway", "profiles", profile);
    const workerGatewayDir = gatewayDirForProfileDir(profileDir);
    const startScript = path.join(workerGatewayDir, `start-${profile}.sh`);
    ensureDir(profileDir, 0o700);
    ensureDir(path.join(profileDir, "logs"), 0o700);
    syncProfileDocumentFilePlugins(profileDir, osUser);
    fs.writeFileSync(startScript, startScriptFor(worker, profileDir, startScript, manifestPath), { encoding: "utf8", mode: 0o700 });
    fs.chmodSync(startScript, 0o700);
    actions.push({ action: "write-gateway-start-script", profile, path: rel(startScript), mode: "0700" });
    const stagedPlistPath = path.join(stagingDir, `${label}.plist`);
    fs.writeFileSync(stagedPlistPath, plistFor(worker, label, profileDir, startScript), { encoding: "utf8", mode: 0o644 });
    fs.chmodSync(stagedPlistPath, 0o644);
    actions.push({ action: "write-gateway-plist", label, path: rel(stagedPlistPath), mode: "0644" });
    servicePlans.push({
      label,
      profile,
      provider: worker.provider || "",
      osUser,
      stagedPlistPath,
      productionPlistPath: path.join(launchDaemonsDir, `${label}.plist`),
      startScript,
      profileDir,
      runAtLoad: false,
      keepAlive: false,
      installStatus: "staged-not-installed",
    });
  }
  applyServicePlans(servicePlans);
  if (issues.length === 0) {
    const launchdInstalled = applyLaunchd && servicePlans.every((service) => service.installStatus === "installed" || service.installStatus === "installed-and-loaded");
    const launchdLoaded = applyLaunchd && servicePlans.every((service) => service.installStatus === "installed-and-loaded");
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production install-gateway-launchd-services",
      generatedAt: new Date().toISOString(),
      root,
      manifestPath,
      stagingDir,
      launchDaemonsDir,
      launchctlCommand,
      workerCount: servicePlans.length,
      launchdInstalled,
      launchdLoaded,
      operatorInstallRequired: !applyLaunchd,
      note: applyLaunchd
        ? "This phase materialized Gateway worker start scripts, installed Gateway LaunchDaemon plists, and loaded them with launchctl."
        : "This phase materializes Gateway worker start scripts and stages Gateway LaunchDaemon plists only. Set HOMEAI_INSTALL_LAUNCHD_APPLY=1 for the privileged install/load step.",
      services: servicePlans,
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    actions.push({ action: "write-gateway-launchd-plan", path: rel(planPath), workerCount: servicePlans.length, mode: "0644" });
  }
} catch (err) {
  issues.push({
    code: "gateway_launchd_services_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let workerCount = 0;
try {
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    workerCount = Array.isArray(plan.services) ? plan.services.length : 0;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-gateway-launchd-services",
  root,
  manifestPath,
  stagingDir,
  planPath,
  launchDaemonsDir,
  launchctlCommand,
  workerCount,
  launchdInstalled: applyLaunchd && issues.length === 0,
  launchdLoaded: applyLaunchd && issues.length === 0,
  operatorInstallRequired: !applyLaunchd,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeInstall: !applyLaunchd,
    commands: applyLaunchd
      ? [`for plist in ${JSON.stringify(launchDaemonsDir)}/com.hermesmobile.gateway*.plist; do ${JSON.stringify(launchctlCommand)} unload -w "$plist" 2>/dev/null || true; rm -f "$plist"; done`]
      : [`rm -rf ${JSON.stringify(stagingDir)}`, `rm -f ${JSON.stringify(planPath)}`],
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_gateway_worker_acl_phase() {
  node - "$ROOT" "$APPLY_WORKSPACE_ACL" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const applyAcl = process.argv[3] === "1";
const dataDir = path.join(root, "data");
const manifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
const planPath = path.join(dataDir, "gateway-worker-acl-plan.json");
const listenerUser = process.env.HOMEAI_LISTENER_USER || "hermes-host";
const chmodCommand = process.env.HOMEAI_CHMOD || "/bin/chmod";
const chownCommand = process.env.HOMEAI_CHOWN || "/usr/sbin/chown";
const idCommand = process.env.HOMEAI_ID || "/usr/bin/id";
const issues = [];
const actions = [];
const aclPlan = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeMacUser(value) {
  const text = String(value || "").trim();
  return /^hm-[a-z0-9][a-z0-9-]{0,62}$/.test(text) ? text : "";
}

function safeProfile(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(text) ? text : "";
}

function fileExists(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function pathExists(file) {
  try { fs.statSync(file); return true; } catch { return false; }
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "gateway_acl_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: `0${mode.toString(8)}`, existed });
}

function userExists(user) {
  const result = spawnSync(idCommand, ["-u", user], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function run(command, args, code, meta = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    issues.push({
      code,
      status: result.status,
      outputSample: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500),
      ...meta,
    });
  }
  return result.status === 0;
}

function addAcl(user, target, permissions, recursive = false) {
  aclPlan.push({
    user,
    path: rel(target),
    permissions,
    recursive,
    exists: pathExists(target),
  });
  if (!applyAcl || !pathExists(target)) return;
  run(chmodCommand, [recursive ? "-R" : "", "+a", `user:${user} allow ${permissions}`, target].filter(Boolean), "gateway_acl_chmod_failed", {
    user,
    path: rel(target),
  });
  actions.push({ action: "acl", user, path: rel(target), recursive });
}

function chownTree(owner, target) {
  if (!applyAcl || !pathExists(target)) return;
  run(chownCommand, ["-R", owner, target], "gateway_acl_chown_failed", { owner, path: rel(target) });
  actions.push({ action: "chown", owner, path: rel(target) });
}

function workerApiKeyFile(worker) {
  return String(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path || "").trim();
}

function workerProviderKeyFiles(worker) {
  const out = [
    worker.deepseekApiKeyFile,
    worker.deepseek_api_key_file,
    worker.providerKeyFile,
    worker.provider_key_file,
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const fallback = path.join(dataDir, "secrets", "deepseek-api-key.secret");
  if (fileExists(fallback)) out.push(fallback);
  return uniq(out);
}

function profileDirFor(worker, osUser, profile) {
  const configured = String(worker.configPath || "").trim();
  if (configured) return path.dirname(configured);
  return path.join(root, "users", osUser, "HermesWorkspace", ".hermes-gateway", "profiles", profile);
}

function parentDirsFor(file, stopAt) {
  const dirs = [];
  let current = path.dirname(file);
  const normalizedStop = path.resolve(stopAt);
  while (current && current.startsWith(normalizedStop)) {
    dirs.push(current);
    if (current === normalizedStop) break;
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return dirs.reverse();
}

try {
  ensureDir(dataDir, 0o750);
  if (!fs.existsSync(manifestPath)) {
    issues.push({ code: "gateway_manifest_missing", path: rel(manifestPath) });
  }
  if (applyAcl) {
    const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
    const testMode = process.env.HOMEAI_INSTALL_ACL_TEST_MODE === "1";
    if (!isRoot && !testMode) {
      issues.push({ code: "root_required_for_gateway_worker_acl" });
    }
  }
  const manifest = issues.length === 0 ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { workers: [] };
  const workers = (Array.isArray(manifest.workers) ? manifest.workers : []).filter((worker) => worker && worker.enabled !== false);
  if (issues.length === 0 && workers.length === 0) {
    issues.push({ code: "gateway_manifest_workers_empty", path: rel(manifestPath) });
  }

  const parentPerms = "search,readattr,readextattr,readsecurity";
  const readPerms = "read,readattr,readextattr,readsecurity";
  const profileDirPerms = "list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit";
  const bridgeSecret = path.join(dataDir, "secrets", "bridge-host.secret");
  for (const worker of workers) {
    const profile = safeProfile(worker.profile || worker.name);
    const osUser = safeMacUser(worker.osUser || worker.os_user);
    if (!profile) {
      issues.push({ code: "gateway_acl_profile_invalid", profile: String(worker.profile || worker.name || "") });
      continue;
    }
    if (!osUser) {
      issues.push({ code: "gateway_acl_os_user_invalid", profile });
      continue;
    }
    if (applyAcl && !userExists(osUser)) {
      issues.push({ code: "gateway_acl_user_missing", user: osUser, profile });
      continue;
    }
    const users = uniq([osUser, listenerUser]);
    const apiKeyFile = workerApiKeyFile(worker);
    const targets = uniq([
      manifestPath,
      apiKeyFile,
      bridgeSecret,
      ...workerProviderKeyFiles(worker),
    ]);
    const profileDir = profileDirFor(worker, osUser, profile);
    ensureDir(profileDir, 0o700);
    chownTree(`${osUser}:staff`, profileDir);
    for (const user of users) {
      for (const dir of uniq([
        ...parentDirsFor(manifestPath, root),
        ...targets.flatMap((target) => target ? parentDirsFor(target, root) : []),
      ])) {
        addAcl(user, dir, parentPerms);
      }
      for (const target of targets) {
        if (target) addAcl(user, target, readPerms);
      }
    }
    addAcl(osUser, profileDir, profileDirPerms, true);
  }
  if (issues.length === 0) {
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production repair-gateway-worker-acl",
      generatedAt: new Date().toISOString(),
      root,
      manifestPath,
      applyAcl,
      workerCount: workers.length,
      aclEntryCount: aclPlan.length,
      applied: applyAcl,
      aclPlan,
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    actions.push({ action: "write-gateway-worker-acl-plan", path: rel(planPath), aclEntryCount: aclPlan.length, mode: "0644" });
  }
} catch (err) {
  issues.push({
    code: "gateway_worker_acl_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let workerCount = 0;
let aclEntryCount = 0;
try {
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    workerCount = Number(plan.workerCount) || 0;
    aclEntryCount = Number(plan.aclEntryCount) || 0;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "repair-gateway-worker-acl",
  root,
  manifestPath,
  planPath,
  applyAcl,
  workerCount,
  aclEntryCount,
  actionCount: actions.length,
  actions,
  rollback: {
    manualReviewRequired: true,
    note: "ACL and ownership repairs are not automatically reverted after a production install.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_configure_plugins_phase() {
  node - "$ROOT" "$APP_SOURCE" "$PLUGIN_SOURCE_MODE" "$PLUGIN_SOURCE_BUNDLE_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const appSource = path.resolve(process.argv[3]);
const sourceMode = String(process.argv[4] || "plan").trim().toLowerCase();
const sourceBundleDirInput = String(process.argv[5] || "").trim();
const sourceBundleDir = sourceBundleDirInput ? path.resolve(sourceBundleDirInput) : "";
const sourceManifestPath = path.join(appSource, "config", "public-plugin-sources.json");
const pluginRoot = path.join(root, "plugins");
const dataDir = path.join(root, "data");
const planPath = path.join(dataDir, "plugin-source-plan.json");
const issues = [];
const actions = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "plugin_config_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: `0${mode.toString(8)}`, existed });
}

function readSourceManifest() {
  try {
    return JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
  } catch (err) {
    issues.push({ code: "public_plugin_sources_unreadable", path: path.relative(appSource, sourceManifestPath), detail: err && err.code ? err.code : "parse_failed" });
    return null;
  }
}

function validId(value) {
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(value || ""));
}

function validSourceDir(value) {
  const text = String(value || "").trim();
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(text) && !text.includes("..") && !path.isAbsolute(text);
}

function validPublicHttpsGitHubUrl(value) {
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\.git$/i.test(String(value || "").trim());
}

function excludedBundleEntry(entry) {
  const name = path.basename(entry);
  return name === ".git"
    || name === ".agent-context"
    || name === ".codegraph"
    || name === "node_modules"
    || name === ".venv"
    || name === "__pycache__"
    || name === "logs"
    || name === "tmp"
    || name === "temp"
    || name === "data"
    || name === "backups"
    || name === ".DS_Store"
    || name.startsWith(".env")
    || name.endsWith(".pyc");
}

function commandExists(command) {
  const result = spawnSync("/usr/bin/env", ["bash", "-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function runGitClone(url, ref, target, id) {
  const git = commandExists("git");
  if (!git) {
    issues.push({ code: "git_not_found_for_plugin_clone" });
    return;
  }
  const clone = spawnSync(git, ["clone", "--branch", ref || "main", "--depth", "1", url, target], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (clone.status !== 0) {
    issues.push({
      code: "plugin_clone_failed",
      id: id || "",
      target: rel(target),
      status: clone.status,
      outputSample: `${clone.stdout || ""}\n${clone.stderr || ""}`.trim().slice(-1200),
    });
    return;
  }
  actions.push({ action: "git-clone", path: rel(target), ref: ref || "main" });
}

function copyBundleSource(plugin, target) {
  if (!sourceBundleDir) {
    issues.push({ code: "plugin_source_bundle_dir_required", id: plugin.id });
    return;
  }
  if (!fs.existsSync(sourceBundleDir) || !fs.statSync(sourceBundleDir).isDirectory()) {
    issues.push({ code: "plugin_source_bundle_dir_missing", path: sourceBundleDir });
    return;
  }
  const candidates = [plugin.sourceDir, plugin.id]
    .filter(Boolean)
    .map((name) => path.join(sourceBundleDir, name));
  const source = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  if (!source) {
    issues.push({ code: "plugin_source_bundle_entry_missing", id: plugin.id, sourceDir: plugin.sourceDir });
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
  fs.cpSync(source, target, {
    recursive: true,
    errorOnExist: false,
    force: true,
    preserveTimestamps: true,
    filter: (entry) => !excludedBundleEntry(entry),
  });
  actions.push({ action: "copy-plugin-source-bundle", id: plugin.id, sourceDir: plugin.sourceDir, path: rel(target) });
}

try {
  if (!["plan", "clone", "bundle"].includes(sourceMode)) {
    issues.push({ code: "plugin_source_mode_invalid", mode: sourceMode });
  }
  ensureDir(dataDir, 0o750);
  ensureDir(pluginRoot, 0o755);
  const sourceManifest = readSourceManifest();
  const plugins = Array.isArray(sourceManifest?.plugins) ? sourceManifest.plugins : [];
  if (sourceManifest && sourceManifest.schemaVersion !== 1) {
    issues.push({ code: "public_plugin_sources_schema_version_invalid" });
  }
  if (sourceManifest && !Array.isArray(sourceManifest.plugins)) {
    issues.push({ code: "public_plugin_sources_plugins_not_array" });
  }
  const seenIds = new Set();
  const planPlugins = [];
  for (const plugin of plugins) {
    const id = String(plugin.id || "").trim();
    const sourceDir = String(plugin.sourceDir || "").trim();
    const repositoryUrl = String(plugin.repositoryUrl || "").trim();
    const ref = String(plugin.ref || "main").trim() || "main";
    const targetDir = path.join(pluginRoot, sourceDir);
    if (!validId(id)) issues.push({ code: "plugin_id_invalid", id });
    if (seenIds.has(id)) issues.push({ code: "plugin_id_duplicate", id });
    seenIds.add(id);
    if (!validSourceDir(sourceDir)) issues.push({ code: "plugin_source_dir_invalid", id, sourceDir });
    if (!validPublicHttpsGitHubUrl(repositoryUrl)) issues.push({ code: "plugin_repository_url_invalid", id });
    planPlugins.push({
      id,
      sourceDir,
      repositoryUrl,
      ref,
      targetDir,
      publicDefault: plugin.publicDefault === true,
      special: plugin.special === true,
      launchdLabel: plugin.launchdLabel || "",
      manifestUrl: plugin.manifestUrl || "",
      sourceInstallMethod: plugin.operatorAuthenticated === true ? "operator-authenticated" : "public-git",
      bundleAvailable: sourceBundleDir ? fs.existsSync(path.join(sourceBundleDir, sourceDir)) || fs.existsSync(path.join(sourceBundleDir, id)) : false,
      installed: fs.existsSync(targetDir),
    });
  }

  if (issues.length === 0 && ["clone", "bundle"].includes(sourceMode)) {
    for (const plugin of planPlugins) {
      if (fs.existsSync(plugin.targetDir)) {
        const entries = fs.readdirSync(plugin.targetDir).filter((entry) => entry !== ".DS_Store");
        if (sourceMode === "clone" && !fs.existsSync(path.join(plugin.targetDir, ".git"))) {
          issues.push({ code: "plugin_target_exists_not_git_checkout", id: plugin.id, path: rel(plugin.targetDir) });
          continue;
        }
        actions.push({ action: sourceMode === "clone" ? "checkout-exists" : "source-exists", id: plugin.id, path: rel(plugin.targetDir), entryCount: entries.length });
        continue;
      }
      if (sourceMode === "clone") {
        runGitClone(plugin.repositoryUrl, plugin.ref, plugin.targetDir, plugin.id);
      } else {
        copyBundleSource(plugin, plugin.targetDir);
      }
    }
  }

  if (issues.length === 0) {
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production configure-plugins",
      generatedAt: new Date().toISOString(),
      mode: sourceMode,
      pluginRoot,
      sourceBundleDir,
      workspaceGrantsCreated: false,
      note: "This plan installs or locates plugin source only; workspace-local plugin key/config is created by plugin provisioning.",
      plugins: planPlugins.map((plugin) => ({
        id: plugin.id,
        sourceDir: plugin.sourceDir,
        repositoryUrl: plugin.repositoryUrl,
        ref: plugin.ref,
        targetDir: plugin.targetDir,
        publicDefault: plugin.publicDefault,
        special: plugin.special,
        sourceInstallMethod: plugin.sourceInstallMethod,
        bundleAvailable: plugin.bundleAvailable,
        launchdLabel: plugin.launchdLabel,
        manifestUrl: plugin.manifestUrl,
        installed: fs.existsSync(plugin.targetDir),
      })),
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    actions.push({ action: "write-plugin-source-plan", path: rel(planPath), pluginCount: plan.plugins.length, mode: "0644" });
  }
} catch (err) {
  issues.push({
    code: "configure_plugins_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let pluginCount = 0;
let installedCount = 0;
try {
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    pluginCount = Array.isArray(plan.plugins) ? plan.plugins.length : 0;
    installedCount = (plan.plugins || []).filter((plugin) => plugin.installed).length;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "configure-plugins",
  root,
  sourceManifestPath,
  pluginRoot,
  planPath,
  sourceMode,
  sourceBundleDir,
  pluginCount,
  installedCount,
  workspaceGrantsCreated: false,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeFirstRun: true,
    note: "Do not remove cloned plugin source after services or plugin data have been created.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_plugin_dependencies_phase() {
  node - "$ROOT" "$NPM_COMMAND" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const requestedNpm = process.argv[3] || "npm";
const pluginRoot = path.join(root, "plugins");
const agentPython = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
const npmCache = path.join(root, "tmp", "npm-cache");
const issues = [];
const actions = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function resolveCommand(command) {
  if (command.includes("/")) return path.resolve(command);
  const result = spawnSync("/usr/bin/env", ["bash", "-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function compactOutput(result) {
  return String(`${result.stderr || ""}\n${result.stdout || ""}`).replace(/\s+/g, " ").trim().slice(-1000);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: process.env.HOME || path.join(root, "tmp", "home"),
      npm_config_cache: npmCache,
      NODE_ENV: "production",
      ...(options.env || {}),
    },
    timeout: options.timeout || 600000,
  });
}

try {
  if (!fs.existsSync(pluginRoot) || !fs.statSync(pluginRoot).isDirectory()) {
    issues.push({ code: "plugin_root_missing", path: rel(pluginRoot) });
  }
  fs.mkdirSync(npmCache, { recursive: true, mode: 0o755 });
  const resolvedNpm = resolveCommand(requestedNpm);
  if (!resolvedNpm || !fs.existsSync(resolvedNpm)) {
    issues.push({ code: "npm_command_not_found", command: requestedNpm });
  }
  if (issues.length === 0) {
    for (const entry of fs.readdirSync(pluginRoot).sort()) {
      const dir = path.join(pluginRoot, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const packageJson = path.join(dir, "package.json");
      if (fs.existsSync(packageJson)) {
        const hasLock = fs.existsSync(path.join(dir, "package-lock.json"));
        const args = hasLock
          ? ["ci", "--omit=dev", "--no-audit", "--no-fund"]
          : ["install", "--omit=dev", "--no-audit", "--no-fund"];
        const install = run(resolvedNpm, args, { cwd: dir, timeout: 1200000 });
        if (install.status !== 0) {
          issues.push({ code: "plugin_npm_install_failed", plugin: entry, status: install.status, outputSample: compactOutput(install) });
          continue;
        }
        actions.push({ action: hasLock ? "npm-ci" : "npm-install", plugin: entry, path: rel(dir) });
      }
      const requirements = path.join(dir, "requirements.txt");
      if (fs.existsSync(requirements)) {
        if (!fs.existsSync(agentPython)) {
          issues.push({ code: "plugin_python_runtime_missing", plugin: entry, path: rel(agentPython) });
          continue;
        }
        const pip = run(agentPython, ["-m", "pip", "install", "-r", requirements], { cwd: dir, timeout: 1200000 });
        if (pip.status !== 0) {
          issues.push({ code: "plugin_pip_install_failed", plugin: entry, status: pip.status, outputSample: compactOutput(pip) });
          continue;
        }
        actions.push({ action: "pip-install", plugin: entry, path: rel(requirements) });
      }
    }
  }
} catch (err) {
  issues.push({
    code: "plugin_dependency_install_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-plugin-dependencies",
  root,
  pluginRoot,
  npmCommand: requestedNpm,
  npmCache,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeFirstRun: true,
    note: "Remove plugin node_modules only before plugin services have created runtime data.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_plugin_workspace_provisioning_plan_phase() {
  node - "$ROOT" "$APP_SOURCE" "$WORKSPACE_MAP" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const appSource = path.resolve(process.argv[3]);
const workspaceMapCsv = String(process.argv[4] || "");
const dataDir = path.join(root, "data");
const driveUsersDir = path.join(dataDir, "drive", "users");
const sourceManifestPath = path.join(appSource, "config", "public-plugin-sources.json");
const authorizationPath = path.join(dataDir, "plugin-workspace-authorizations.json");
const planPath = path.join(dataDir, "plugin-workspace-provisioning-plan.json");
const issues = [];
const actions = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function stringValue(value) {
  return String(value || "").trim();
}

function validId(value) {
  return /^[a-z0-9][a-z0-9_.-]{0,95}$/.test(String(value || ""));
}

function pluginDirName(pluginId) {
  return `.hermes-${pluginId}`;
}

function parseWorkspaceMap(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [workspaceId, macUser, driveName] = entry.split(":").map((item) => item.trim());
      return {
        workspaceId,
        macUser,
        driveName: driveName || workspaceId,
      };
    });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    issues.push({ code: "json_unreadable", path: rel(file), detail: err && err.code ? err.code : "parse_failed" });
    return fallback;
  }
}

function fileExists(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

function dirExists(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch (_) {
    return false;
  }
}

function authorizationRecord(authState, pluginId, workspaceId) {
  const record = authState?.plugins?.[pluginId]?.records?.[workspaceId];
  if (!record || typeof record !== "object") return null;
  return {
    status: stringValue(record.status || "authorized") || "authorized",
    provisioningStatus: stringValue(record.provisioningStatus || record.provisioning_status || "not_started") || "not_started",
    provisioningError: stringValue(record.provisioningError || record.provisioning_error).slice(0, 160),
    updatedAt: stringValue(record.updatedAt || record.updated_at || record.provisioningUpdatedAt || record.provisioning_updated_at),
  };
}

function bindingEvidence(workspaceId, macUser, pluginId) {
  const dataBindingDir = path.join(driveUsersDir, workspaceId, pluginDirName(pluginId));
  const workerBindingDir = path.join("/Users", macUser, "HermesWorkspace", pluginDirName(pluginId));
  const dataConfig = path.join(dataBindingDir, "config.json");
  const dataKey = path.join(dataBindingDir, "access-key.txt");
  const workerConfig = path.join(workerBindingDir, "config.json");
  const workerKey = path.join(workerBindingDir, "access-key.txt");
  const dataComplete = fileExists(dataConfig) && fileExists(dataKey);
  const workerComplete = fileExists(workerConfig) && fileExists(workerKey);
  return {
    dataBindingDir,
    workerBindingDir,
    dataConfigExists: fileExists(dataConfig),
    dataKeyExists: fileExists(dataKey),
    workerConfigExists: fileExists(workerConfig),
    workerKeyExists: fileExists(workerKey),
    dataComplete,
    workerComplete,
    complete: Boolean(dataComplete && workerComplete),
  };
}

function desiredPluginRows(sourceManifest) {
  const plugins = Array.isArray(sourceManifest?.plugins) ? sourceManifest.plugins : [];
  const rows = [];
  const seen = new Set();
  for (const plugin of plugins) {
    const id = stringValue(plugin.id).toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = {
      id,
      sourceDir: stringValue(plugin.sourceDir),
      publicDefault: plugin.publicDefault === true,
      special: plugin.special === true,
      launchdLabel: stringValue(plugin.launchdLabel),
      manifestUrl: stringValue(plugin.manifestUrl),
      provisioningMode: plugin.special === true ? "owner_only_or_manual" : "workspace_binding",
    };
    if (row.publicDefault && !row.special) rows.push(row);
  }
  return rows;
}

function rowStatus(plugin, workspace, auth, evidence) {
  if (plugin.special) return "manual_required";
  if (auth?.status === "authorized" && auth.provisioningStatus === "active" && evidence.complete) return "active";
  if (auth?.status === "authorized" && auth.provisioningStatus === "provisioning_failed") return "provisioning_failed";
  if (evidence.dataComplete && !evidence.workerComplete) return "gateway_binding_pending";
  if (evidence.dataComplete && evidence.workerComplete) return "active_without_authorization_record";
  return "pending";
}

try {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o750 });
  fs.chmodSync(dataDir, 0o750);
  actions.push({ action: "ensure-directory", path: rel(dataDir), mode: "0750" });

  const sourceManifest = readJson(sourceManifestPath, null);
  if (sourceManifest && sourceManifest.schemaVersion !== 1) {
    issues.push({ code: "public_plugin_sources_schema_version_invalid" });
  }
  if (sourceManifest && !Array.isArray(sourceManifest.plugins)) {
    issues.push({ code: "public_plugin_sources_plugins_not_array" });
  }
  const workspaces = parseWorkspaceMap(workspaceMapCsv);
  if (!workspaces.length) issues.push({ code: "workspace_map_empty" });
  const seenWorkspaces = new Set();
  for (const workspace of workspaces) {
    if (!validId(workspace.workspaceId)) issues.push({ code: "workspace_id_invalid", workspaceId: workspace.workspaceId });
    if (!/^hm-[a-z0-9_-]{1,61}$/.test(workspace.macUser)) issues.push({ code: "workspace_mac_user_invalid", workspaceId: workspace.workspaceId, macUser: workspace.macUser });
    if (seenWorkspaces.has(workspace.workspaceId)) issues.push({ code: "workspace_id_duplicate", workspaceId: workspace.workspaceId });
    seenWorkspaces.add(workspace.workspaceId);
  }

  const defaultPlugins = desiredPluginRows(sourceManifest || {});
  if (!defaultPlugins.length) issues.push({ code: "default_business_plugins_empty" });
  const authState = readJson(authorizationPath, { version: 1, plugins: {} });

  if (issues.length === 0) {
    const workspacePlans = workspaces.map((workspace) => {
      const pluginPlans = defaultPlugins.map((plugin) => {
        const auth = authorizationRecord(authState, plugin.id, workspace.workspaceId);
        const evidence = bindingEvidence(workspace.workspaceId, workspace.macUser, plugin.id);
        return {
          pluginId: plugin.id,
          manifestUrl: plugin.manifestUrl,
          launchdLabel: plugin.launchdLabel,
          provisioningMode: plugin.provisioningMode,
          targetStatus: "active",
          currentStatus: rowStatus(plugin, workspace, auth, evidence),
          authorized: auth?.status === "authorized",
          authorizationProvisioningStatus: auth?.provisioningStatus || "",
          authorizationErrorPresent: Boolean(auth?.provisioningError),
          dataBindingDir: rel(evidence.dataBindingDir),
          workerBindingDir: evidence.workerBindingDir,
          dataConfigExists: evidence.dataConfigExists,
          dataKeyExists: evidence.dataKeyExists,
          workerConfigExists: evidence.workerConfigExists,
          workerKeyExists: evidence.workerKeyExists,
          complete: evidence.complete,
          applyPath: "/api/workspace-onboarding/apply",
        };
      });
      return {
        workspaceId: workspace.workspaceId,
        macUser: workspace.macUser,
        driveName: workspace.driveName,
        workspaceDataRoot: rel(path.join(driveUsersDir, workspace.workspaceId)),
        workerWorkspaceRoot: path.join("/Users", workspace.macUser, "HermesWorkspace"),
        defaultBusinessPluginCount: pluginPlans.length,
        activeCount: pluginPlans.filter((plugin) => plugin.currentStatus === "active").length,
        pendingCount: pluginPlans.filter((plugin) => plugin.currentStatus === "pending").length,
        provisioningFailedCount: pluginPlans.filter((plugin) => plugin.currentStatus === "provisioning_failed").length,
        plugins: pluginPlans,
      };
    });
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production plan-plugin-workspace-provisioning",
      generatedAt: new Date().toISOString(),
      workspaceMap: workspaceMapCsv,
      authorizationPath,
      defaultBusinessPluginIds: defaultPlugins.map((plugin) => plugin.id),
      excludedSpecialPluginIds: (sourceManifest.plugins || [])
        .filter((plugin) => plugin?.special === true)
        .map((plugin) => stringValue(plugin.id))
        .filter(Boolean),
      createsPluginKeys: false,
      createsWorkspaceGrants: false,
      callsPluginBindEndpoints: false,
      note: "This is a first-run provisioning plan only. Apply plugin grants through /api/workspace-onboarding/apply or the Owner plugin manager after plugin services are healthy.",
      workspaces: workspacePlans,
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o640 });
    fs.chmodSync(planPath, 0o640);
    actions.push({ action: "write-plugin-workspace-provisioning-plan", path: rel(planPath), workspaceCount: plan.workspaces.length, pluginCount: defaultPlugins.length, mode: "0640" });
  }
} catch (err) {
  issues.push({
    code: "plugin_workspace_provisioning_plan_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let workspaceCount = 0;
let pluginCount = 0;
try {
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    workspaceCount = Array.isArray(plan.workspaces) ? plan.workspaces.length : 0;
    pluginCount = Array.isArray(plan.defaultBusinessPluginIds) ? plan.defaultBusinessPluginIds.length : 0;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "plan-plugin-workspace-provisioning",
  root,
  sourceManifestPath,
  authorizationPath,
  planPath,
  workspaceCount,
  pluginCount,
  createsPluginKeys: false,
  createsWorkspaceGrants: false,
  callsPluginBindEndpoints: false,
  actionCount: actions.length,
  actions,
  rollback: {
    commands: [`rm -f ${planPath}`],
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_configure_cron_phase() {
  node - "$ROOT" "$APP_SOURCE" "$CRON_NETWORK_MODE" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const appSource = path.resolve(process.argv[3]);
const cronNetworkMode = String(process.argv[4] || "direct").trim().toLowerCase();
const dataDir = path.join(root, "data");
const hermesHome = path.join(dataDir, "hermes-home");
const cronDir = path.join(hermesHome, "cron");
const jobsPath = path.join(cronDir, "jobs.json");
const outputRoot = path.join(cronDir, "output");
const runLogRoot = path.join(hermesHome, "run-logs");
const automationWorkspaces = path.join(hermesHome, "automation-workspaces");
const scriptsDir = path.join(hermesHome, "scripts");
const skillsRoot = path.join(hermesHome, "skills");
const planPath = path.join(dataDir, "cron-config-plan.json");
const issues = [];
const actions = [];

const helperScripts = [
  "hermes-mobile-cron-dispatcher.py",
  "homeai-disaster-backup-cron.sh",
  "homeai-production-drift-audit-watchdog.sh",
  "homeai-visual-polish-audit-cron.sh",
  "visual-polish-audit-runner.js",
];

function rel(file) {
  return path.relative(root, file) || ".";
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "cron_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: `0${mode.toString(8)}`, existed });
}

function copyFileIfChanged(source, target, mode) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    issues.push({ code: "cron_helper_source_missing", source: path.relative(appSource, source) || source });
    return false;
  }
  const existed = fs.existsSync(target);
  const sourceBytes = fs.readFileSync(source);
  const current = existed && fs.statSync(target).isFile() ? fs.readFileSync(target) : null;
  if (existed && !fs.statSync(target).isFile()) {
    issues.push({ code: "cron_helper_target_not_file", path: rel(target) });
    return false;
  }
  if (!current || !current.equals(sourceBytes)) {
    fs.copyFileSync(source, target);
    actions.push({ action: existed ? "update-helper" : "copy-helper", path: rel(target), source: path.relative(appSource, source) });
  } else {
    actions.push({ action: "helper-current", path: rel(target), source: path.relative(appSource, source) });
  }
  fs.chmodSync(target, mode);
  return true;
}

function copyDirectoryRecursive(source, target, mode) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    issues.push({ code: "cron_skill_source_missing", source: path.relative(appSource, source) || source });
    return 0;
  }
  let count = 0;
  ensureDir(target, 0o755);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      count += copyDirectoryRecursive(sourcePath, targetPath, mode);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
      fs.chmodSync(targetPath, mode);
      count += 1;
    }
  }
  return count;
}

function ensureJobsStore() {
  if (fs.existsSync(jobsPath)) {
    if (!fs.statSync(jobsPath).isFile()) {
      issues.push({ code: "cron_jobs_path_not_file", path: rel(jobsPath) });
      return "invalid";
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
      if (!Array.isArray(parsed.jobs)) {
        issues.push({ code: "cron_jobs_schema_invalid", path: rel(jobsPath) });
        return "invalid";
      }
      actions.push({ action: "jobs-store-exists", path: rel(jobsPath), jobCount: parsed.jobs.length });
      return "preserved";
    } catch (err) {
      issues.push({ code: "cron_jobs_json_invalid", path: rel(jobsPath), detail: err && err.name ? err.name : "parse_failed" });
      return "invalid";
    }
  }
  fs.writeFileSync(jobsPath, `${JSON.stringify({ jobs: [] }, null, 2)}\n`, { encoding: "utf8", mode: 0o640 });
  actions.push({ action: "create-jobs-store", path: rel(jobsPath), jobCount: 0, mode: "0640" });
  return "created";
}

try {
  if (!["direct", "proxy"].includes(cronNetworkMode)) {
    issues.push({ code: "cron_network_mode_invalid", mode: cronNetworkMode });
  }
  ensureDir(dataDir, 0o750);
  ensureDir(hermesHome, 0o750);
  ensureDir(cronDir, 0o750);
  ensureDir(outputRoot, 0o750);
  ensureDir(runLogRoot, 0o750);
  ensureDir(automationWorkspaces, 0o750);
  ensureDir(scriptsDir, 0o755);
  ensureDir(skillsRoot, 0o755);
  const jobsStatus = ensureJobsStore();

  const copiedHelpers = [];
  for (const script of helperScripts) {
    const mode = script.endsWith(".sh") || script.endsWith(".py") ? 0o755 : 0o644;
    const ok = copyFileIfChanged(path.join(appSource, "scripts", script), path.join(scriptsDir, script), mode);
    if (ok) copiedHelpers.push(script);
  }

  const productivitySource = path.join(appSource, "skills", "productivity");
  const productivityTarget = path.join(skillsRoot, "productivity");
  const copiedSkillFileCount = copyDirectoryRecursive(productivitySource, productivityTarget, 0o644);

  if (issues.length === 0) {
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production configure-cron",
      generatedAt: new Date().toISOString(),
      hermesHome,
      jobsPath,
      outputRoot,
      runLogRoot,
      automationWorkspaces,
      scriptsDir,
      skillsRoot,
      networkMode: cronNetworkMode,
      businessJobsCreated: false,
      launchdInstalled: false,
      jobsStatus,
      helperScripts: copiedHelpers,
      copiedSkillFileCount,
      environment: {
        HERMES_HOME: hermesHome,
        HERMES_WEB_HERMES_HOME: hermesHome,
        HERMES_WEB_DATA_DIR: dataDir,
        HERMES_WEB_CRON_JOBS_PATH: jobsPath,
        HERMES_WEB_CRON_OUTPUT_ROOT: outputRoot,
        HERMES_WEB_RUN_LOG_ROOT: runLogRoot,
        HERMES_MOBILE_ROOT: root,
        HERMES_MOBILE_NETWORK_MODE: cronNetworkMode,
        HERMES_MOBILE_CRON_TICK_SIDE: "macos",
        HERMES_CRON_SCRIPT_TIMEOUT: "1800",
      },
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    actions.push({ action: "write-cron-config-plan", path: rel(planPath), mode: "0644" });
  }
} catch (err) {
  issues.push({
    code: "configure_cron_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let jobCount = 0;
let skillCount = 0;
try {
  if (fs.existsSync(jobsPath)) jobCount = (JSON.parse(fs.readFileSync(jobsPath, "utf8")).jobs || []).length;
  function countSkills(dir) {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) count += countSkills(file);
      else if (entry.name === "SKILL.md") count += 1;
    }
    return count;
  }
  if (fs.existsSync(skillsRoot)) skillCount = countSkills(skillsRoot);
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "configure-cron",
  root,
  hermesHome,
  jobsPath,
  outputRoot,
  runLogRoot,
  automationWorkspaces,
  scriptsDir,
  skillsRoot,
  planPath,
  networkMode: cronNetworkMode,
  jobCount,
  skillCount,
  businessJobsCreated: false,
  launchdInstalled: false,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeFirstRun: true,
    note: "Do not remove CRON output, run logs, jobs, or automation workspaces after first run.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_launchd_services_phase() {
  node - "$ROOT" "$APP_SOURCE" "$APPLY_LAUNCHD_SERVICES" "$LAUNCH_DAEMONS_DIR" "$LAUNCHCTL_COMMAND" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const appSource = path.resolve(process.argv[3]);
const applyLaunchd = process.argv[4] === "1";
const launchDaemonsDir = path.resolve(process.argv[5] || "/Library/LaunchDaemons");
const launchctlCommand = process.argv[6] || "/bin/launchctl";
const appRoot = path.join(root, "app");
const dataDir = path.join(root, "data");
const logsRoot = path.join(root, "logs");
const stagingDir = path.join(dataDir, "launchd-staging");
const planPath = path.join(dataDir, "launchd-services-plan.json");
const serviceUser = "hermes-host";
const nodePath = path.join(root, "runtime", "node-current", "bin", "node");
const pythonPath = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
const hermesHome = path.join(dataDir, "hermes-home");
const cronRoot = path.join(hermesHome, "cron");
const gatewayManifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
const gatewayProfileLaunchScript = path.join(appRoot, "scripts", "macos-launch-gateway-profile.sh");
const issues = [];
const actions = [];
const pluginInstallerScripts = Object.freeze({
  "codex-mobile": "install-codex-mobile-launchd-service.js",
  email: "install-email-launchd-service.js",
  finance: "install-finance-launchd-service.js",
  growth: "install-growth-launchd-service.js",
  health: "install-health-launchd-service.js",
  moira: "install-moira-launchd-service.js",
  movie: "install-movie-launchd-service.js",
  music: "install-music-launchd-service.js",
  note: "install-note-launchd-service.js",
  wardrobe: "install-wardrobe-launchd-service.js",
});

function rel(file) {
  return path.relative(root, file) || ".";
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureDir(target, mode) {
  const existed = fs.existsSync(target);
  if (existed && !fs.statSync(target).isDirectory()) {
    issues.push({ code: "launchd_stage_path_not_directory", path: rel(target) });
    return;
  }
  fs.mkdirSync(target, { recursive: true, mode });
  fs.chmodSync(target, mode);
  actions.push({ action: existed ? "chmod" : "mkdir", path: rel(target), mode: `0${mode.toString(8)}`, existed });
}

function repairServiceOwnedPath(target, owner, mode, options = {}) {
  if (!fs.existsSync(target)) return;
  if (mode) fs.chmodSync(target, mode);
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (!isRoot) {
    actions.push({ action: "service-owner-repair-skipped-nonroot", path: rel(target), owner });
    return;
  }
  const args = options.recursive === false ? [owner, target] : ["-R", owner, target];
  const result = spawnSync("/usr/sbin/chown", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    issues.push({
      code: "service_owner_repair_failed",
      path: rel(target),
      owner,
      status: result.status,
      outputSample: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500),
    });
    return;
  }
  actions.push({ action: "service-owner-repair", path: rel(target), owner, mode: mode ? `0${mode.toString(8)}` : "", recursive: options.recursive !== false });
}

function prepareLaunchdLogFile(target, userName) {
  if (!target) return;
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true, mode: dir === logsRoot ? 0o750 : 0o700 });
  fs.chmodSync(dir, dir === logsRoot ? 0o750 : 0o700);
  fs.closeSync(fs.openSync(target, "a"));
  fs.chmodSync(target, 0o600);
  const owner = `${userName || serviceUser}:staff`;
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (!isRoot) {
    actions.push({ action: "launchd-log-file-owner-repair-skipped-nonroot", path: rel(target), owner });
    return;
  }
  const result = spawnSync("/usr/sbin/chown", [owner, target], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    issues.push({
      code: "launchd_log_file_owner_repair_failed",
      path: rel(target),
      owner,
      status: result.status,
      outputSample: `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500),
    });
    return;
  }
  actions.push({ action: "launchd-log-file-owner-repair", path: rel(target), owner, mode: "0600" });
}

function repairServiceOwnership() {
  const owner = `${serviceUser}:staff`;
  const paths = [
    { path: dataDir, mode: 0o750, recursive: false },
    { path: logsRoot, mode: 0o750 },
    { path: path.join(root, "plugins"), mode: 0o755 },
    { path: path.join(dataDir, "secrets"), mode: 0o700 },
    { path: path.join(dataDir, "plugin-secrets"), mode: 0o700 },
    { path: hermesHome, mode: 0o750 },
    { path: path.join(root, "runtime", "uploads"), mode: 0o750 },
    { path: path.join(root, "tmp"), mode: 0o700 },
  ];
  for (const item of paths) repairServiceOwnedPath(item.path, owner, item.mode, { recursive: item.recursive });
}

function gatewayRuntimeEnvironment() {
  return {
    HERMES_WEB_GATEWAY_POOL_ENABLED: "1",
    HERMES_WEB_GATEWAY_POOL_MANIFEST: gatewayManifestPath,
    HERMES_MOBILE_GATEWAY_POOL_MANIFEST: gatewayManifestPath,
    HERMES_GATEWAY_POOL_MANIFEST_PATH: gatewayManifestPath,
    HERMES_MOBILE_GATEWAY_POOL_START_MODE: "hybrid",
    HERMES_WEB_GATEWAY_POOL_START_MODE: "hybrid",
    HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT: gatewayProfileLaunchScript,
    HERMES_WEB_GATEWAY_PROFILE_LAUNCH_SCRIPT: gatewayProfileLaunchScript,
    HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS: "300000",
    HERMES_WEB_GATEWAY_START_TIMEOUT_MS: "300000",
    HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS: "90000",
    HERMES_WEB_GATEWAY_START_HEALTH_WAIT_MS: "90000",
    HERMES_MOBILE_GATEWAY_START_HEALTH_POLL_MS: "1000",
    HERMES_WEB_GATEWAY_START_HEALTH_POLL_MS: "1000",
  };
}

function envRows(env) {
  const rows = Object.entries(env || {});
  if (!rows.length) return "";
  return [
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    ...rows.map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`),
    "  </dict>",
  ].join("\n");
}

function plist(service) {
  const args = service.programArguments
    .map((item) => `    <string>${xmlEscape(item)}</string>`)
    .join("\n");
  const optionalUser = service.userName ? `  <key>UserName</key>\n  <string>${xmlEscape(service.userName)}</string>\n` : "";
  const optionalEnv = envRows(service.environment);
  const keepAlive = service.keepAlive ? "  <key>KeepAlive</key>\n  <true/>\n" : "";
  const startInterval = service.startInterval ? `  <key>StartInterval</key>\n  <integer>${service.startInterval}</integer>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(service.label)}</string>
${optionalUser}  <key>WorkingDirectory</key>
  <string>${xmlEscape(service.workingDirectory)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${optionalEnv ? `${optionalEnv}\n` : ""}  <key>RunAtLoad</key>
  <true/>
${keepAlive}${startInterval}  <key>StandardOutPath</key>
  <string>${xmlEscape(service.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(service.stderrLog)}</string>
</dict>
</plist>
`;
}

function writeService(service) {
  const target = path.join(stagingDir, `${service.label}.plist`);
  fs.writeFileSync(target, plist(service), { encoding: "utf8", mode: 0o644 });
  fs.chmodSync(target, 0o644);
  actions.push({ action: "write-plist", label: service.label, path: rel(target), mode: "0644" });
  return {
    label: service.label,
    kind: service.kind || "core",
    stagedPlistPath: target,
    productionPlistPath: path.join(launchDaemonsDir, `${service.label}.plist`),
    userName: service.userName || "root",
    workingDirectory: service.workingDirectory,
    programArguments: service.programArguments,
    stdoutLog: service.stdoutLog,
    stderrLog: service.stderrLog,
    runAtLoad: true,
    keepAlive: Boolean(service.keepAlive),
    startInterval: service.startInterval || null,
    installStatus: "staged-not-installed",
  };
}

function writeRawPlistService(service) {
  const target = path.join(stagingDir, `${service.label}.plist`);
  fs.writeFileSync(target, service.plist, { encoding: "utf8", mode: 0o644 });
  fs.chmodSync(target, 0o644);
  actions.push({ action: "write-plist", label: service.label, path: rel(target), mode: "0644", kind: service.kind || "plugin" });
  return {
    label: service.label,
    kind: service.kind || "plugin",
    pluginId: service.pluginId || "",
    stagedPlistPath: target,
    productionPlistPath: path.join(launchDaemonsDir, `${service.label}.plist`),
    userName: service.userName || "hermes-host",
    workingDirectory: service.workingDirectory || "",
    programArguments: service.programArguments || [],
    stdoutLog: service.stdoutLog || "",
    stderrLog: service.stderrLog || "",
    runAtLoad: true,
    keepAlive: service.keepAlive !== false,
    startInterval: service.startInterval || null,
    installStatus: "staged-not-installed",
  };
}

function runLaunchctl(args, allowFailure = false) {
  const result = spawnSync(launchctlCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputSample = `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-500);
  if (result.status !== 0 && !allowFailure) {
    issues.push({
      code: "launchd_launchctl_failed",
      command: path.basename(launchctlCommand),
      args,
      status: result.status,
      outputSample,
    });
  }
  return {
    status: result.status == null ? 1 : result.status,
    outputSample,
  };
}

function applyLaunchdServices(servicePlans) {
  if (!applyLaunchd) return;
  const requiresRoot = launchDaemonsDir === "/Library/LaunchDaemons";
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  if (requiresRoot && !isRoot) {
    issues.push({ code: "root_required_for_launchd_install", launchDaemonsDir });
    return;
  }
  if (!fs.existsSync(launchctlCommand)) {
    issues.push({ code: "launchctl_command_missing", command: launchctlCommand });
    return;
  }
  ensureDir(launchDaemonsDir, 0o755);
  for (const service of servicePlans) {
    prepareLaunchdLogFile(service.stdoutLog, service.userName);
    prepareLaunchdLogFile(service.stderrLog, service.userName);
    if (!fs.existsSync(service.stagedPlistPath)) {
      issues.push({ code: "launchd_staged_plist_missing", label: service.label, path: service.stagedPlistPath });
      continue;
    }
    fs.copyFileSync(service.stagedPlistPath, service.productionPlistPath);
    fs.chmodSync(service.productionPlistPath, 0o644);
    service.installStatus = "installed";
    actions.push({
      action: "install-plist",
      label: service.label,
      path: service.productionPlistPath,
      mode: "0644",
    });
    const unload = runLaunchctl(["unload", "-w", service.productionPlistPath], true);
    actions.push({
      action: "launchctl-unload",
      label: service.label,
      status: unload.status,
      ignoredFailure: unload.status !== 0,
    });
    const load = runLaunchctl(["load", "-w", service.productionPlistPath]);
    actions.push({
      action: "launchctl-load",
      label: service.label,
      status: load.status,
    });
    if (load.status === 0) {
      service.installStatus = "installed-and-loaded";
    }
  }
}

function canonicalPluginServices() {
  const services = [];
  for (const [pluginId, scriptName] of Object.entries(pluginInstallerScripts)) {
    const scriptPath = path.join(appSource, "scripts", scriptName);
    if (!fs.existsSync(scriptPath)) {
      issues.push({ code: "plugin_launchd_installer_missing", pluginId, script: path.relative(appSource, scriptPath) });
      continue;
    }
    const installer = require(scriptPath);
    if (typeof installer.plistFor !== "function" || typeof installer.plan !== "function") {
      issues.push({ code: "plugin_launchd_installer_contract_invalid", pluginId, script: path.relative(appSource, scriptPath) });
      continue;
    }
    const pluginPlan = installer.plan({ macRoot: root });
    services.push({
      kind: "plugin",
      pluginId,
      label: String(pluginPlan.label || installer.DEFAULT_LABEL || ""),
      plist: installer.plistFor({ macRoot: root }),
      productionPlistPath: pluginPlan.plistPath,
      userName: String(pluginPlan.serviceUser || "hermes-host"),
      workingDirectory: pluginPlan.pluginRoot,
      programArguments: [],
      stdoutLog: Array.isArray(pluginPlan.logPaths) ? (pluginPlan.logPaths[0] || "") : "",
      stderrLog: Array.isArray(pluginPlan.logPaths) ? (pluginPlan.logPaths[1] || "") : "",
      keepAlive: true,
    });
  }
  return services;
}

try {
  ensureDir(dataDir, 0o750);
  ensureDir(logsRoot, 0o755);
  ensureDir(stagingDir, 0o755);
  repairServiceOwnership();
  const services = [
    {
      label: "com.hermesmobile.listener",
      userName: serviceUser,
      workingDirectory: appRoot,
      programArguments: [nodePath, path.join(appRoot, "server.js")],
      environment: {
        HERMES_MOBILE_ROOT: root,
        HERMES_WEB_DATA_DIR: dataDir,
        HERMES_WEB_AUTH_KEY_PATH: path.join(dataDir, "secrets", "owner-web-key.secret"),
        HERMES_WEB_RUNTIME_DIR: path.join(root, "runtime"),
        HERMES_WEB_UPLOAD_DIR: path.join(root, "runtime", "uploads"),
        HERMES_WEB_HOST: "0.0.0.0",
        HERMES_WEB_PORT: "8797",
        HERMES_ACCEPT_HOOKS: "1",
        ...gatewayRuntimeEnvironment(),
      },
      keepAlive: true,
      stdoutLog: path.join(logsRoot, "listener.out.log"),
      stderrLog: path.join(logsRoot, "listener.err.log"),
    },
    {
      label: "com.hermesmobile.bridge-host",
      userName: serviceUser,
      workingDirectory: appRoot,
      programArguments: [nodePath, path.join(appRoot, "scripts", "bridge-host.js")],
      environment: {
        HERMES_MOBILE_ROOT: root,
        HERMES_HOME: hermesHome,
        HERMES_WEB_HERMES_HOME: hermesHome,
        HERMES_WEB_DATA_DIR: dataDir,
        HERMES_WEB_AUTH_KEY_PATH: path.join(dataDir, "secrets", "owner-web-key.secret"),
        HERMES_WEB_CRON_JOBS_PATH: path.join(cronRoot, "jobs.json"),
        HERMES_WEB_CRON_OUTPUT_ROOT: path.join(cronRoot, "output"),
        HERMES_WEB_RUN_LOG_ROOT: path.join(hermesHome, "run-logs"),
        HERMES_MOBILE_BRIDGE_HOST: "127.0.0.1",
        HERMES_MOBILE_BRIDGE_HOST_PORT: "8798",
        HERMES_MOBILE_BRIDGE_HOST_KEY_PATH: path.join(dataDir, "secrets", "bridge-host.secret"),
        HERMES_WEB_BRIDGE_HOST_KEY_PATH: path.join(dataDir, "secrets", "bridge-host.secret"),
        HERMES_MOBILE_NETWORK_MODE: "direct",
        HERMES_ACCEPT_HOOKS: "1",
        ...gatewayRuntimeEnvironment(),
      },
      keepAlive: true,
      stdoutLog: path.join(logsRoot, "bridge-host.out.log"),
      stderrLog: path.join(logsRoot, "bridge-host.err.log"),
    },
    {
      label: "com.hermesmobile.cron",
      userName: serviceUser,
      workingDirectory: appRoot,
      programArguments: [pythonPath, path.join(appRoot, "scripts", "hermes-mobile-cron-dispatcher.py"), "--dispatch"],
      environment: {
        HERMES_HOME: hermesHome,
        HERMES_WEB_HERMES_HOME: hermesHome,
        HERMES_WEB_DATA_DIR: dataDir,
        HERMES_WEB_AUTH_KEY_PATH: path.join(dataDir, "secrets", "owner-web-key.secret"),
        HERMES_WEB_CRON_JOBS_PATH: path.join(cronRoot, "jobs.json"),
        HERMES_WEB_CRON_OUTPUT_ROOT: path.join(cronRoot, "output"),
        HERMES_WEB_RUN_LOG_ROOT: path.join(hermesHome, "run-logs"),
        HERMES_MOBILE_ROOT: root,
        HERMES_MOBILE_NETWORK_MODE: "direct",
        HERMES_MOBILE_CRON_TICK_SIDE: "macos",
        HERMES_CRON_SCRIPT_TIMEOUT: "1800",
        ...gatewayRuntimeEnvironment(),
      },
      startInterval: 60,
      stdoutLog: path.join(logsRoot, "cron.out.log"),
      stderrLog: path.join(logsRoot, "cron.err.log"),
    },
    {
      label: "com.hermesmobile.workspace-system-helper",
      userName: "root",
      workingDirectory: appRoot,
      programArguments: [nodePath, path.join(appRoot, "scripts", "workspace-system-provisioning-helper.js")],
      environment: {
        HERMES_MOBILE_ROOT: root,
        HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET: path.join(dataDir, "run", "workspace-system-provisioning-helper.sock"),
        HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET_USER: serviceUser,
      },
      keepAlive: true,
      stdoutLog: path.join(logsRoot, "workspace-system-helper.out.log"),
      stderrLog: path.join(logsRoot, "workspace-system-helper.err.log"),
    },
    {
      label: "com.hermesmobile.production-drift-audit",
      userName: "root",
      workingDirectory: appRoot,
      programArguments: [path.join(hermesHome, "scripts", "homeai-production-drift-audit-watchdog.sh")],
      environment: {
        HERMES_MOBILE_ROOT: root,
        HERMES_MOBILE_APP_DIR: appRoot,
        HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR: path.join(dataDir, "production-drift-audit"),
        HOMEAI_PRODUCTION_DRIFT_AUDIT_EXPECTED_WORKSPACES: "owner",
        HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR: "1",
      },
      startInterval: 900,
      stdoutLog: path.join(logsRoot, "production-drift-audit.out.log"),
      stderrLog: path.join(logsRoot, "production-drift-audit.err.log"),
    },
  ];
  const coreServicePlans = services.map(writeService);
  const pluginServicePlans = canonicalPluginServices().map(writeRawPlistService);
  const servicePlans = [...coreServicePlans, ...pluginServicePlans];
  applyLaunchdServices(servicePlans);
  if (issues.length === 0) {
    const launchdInstalled = applyLaunchd && servicePlans.every((service) => service.installStatus === "installed" || service.installStatus === "installed-and-loaded");
    const launchdLoaded = applyLaunchd && servicePlans.every((service) => service.installStatus === "installed-and-loaded");
    const plan = {
      schemaVersion: 1,
      generatedBy: "install-macos-production install-launchd-services",
      generatedAt: new Date().toISOString(),
      root,
      stagingDir,
      serviceCount: servicePlans.length,
      coreServiceCount: coreServicePlans.length,
      pluginServiceCount: pluginServicePlans.length,
      launchDaemonsDir,
      launchctlCommand,
      launchdInstalled,
      launchdLoaded,
      operatorInstallRequired: !applyLaunchd,
      note: applyLaunchd
        ? "This phase staged launchd plist files, installed them under the configured LaunchDaemons directory, and loaded them with launchctl."
        : "This phase stages launchd plist files only. Set HOMEAI_INSTALL_LAUNCHD_APPLY=1 for the privileged install/load step. Plugin staging covers the public plugin set with canonical launchd installer scripts.",
      services: servicePlans,
    };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    actions.push({ action: "write-launchd-services-plan", path: rel(planPath), serviceCount: servicePlans.length, mode: "0644" });
  }
} catch (err) {
  issues.push({
    code: "launchd_services_stage_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

let serviceCount = 0;
let pluginServiceCount = 0;
try {
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    serviceCount = Array.isArray(plan.services) ? plan.services.length : 0;
    pluginServiceCount = Number(plan.pluginServiceCount) || 0;
  }
} catch {}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-launchd-services",
  root,
  stagingDir,
  planPath,
  launchDaemonsDir,
  launchctlCommand,
  serviceCount,
  pluginServiceCount,
  launchdInstalled: applyLaunchd && issues.length === 0,
  launchdLoaded: applyLaunchd && issues.length === 0,
  operatorInstallRequired: !applyLaunchd,
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyBeforeInstall: !applyLaunchd,
    commands: applyLaunchd
      ? [`for plist in ${JSON.stringify(launchDaemonsDir)}/com.hermesmobile*.plist; do ${JSON.stringify(launchctlCommand)} unload -w "$plist" 2>/dev/null || true; rm -f "$plist"; done`]
      : [`rm -rf ${JSON.stringify(stagingDir)}`, `rm -f ${JSON.stringify(planPath)}`],
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_runtime_phase() {
  node - "$ROOT" "$NODE_COMMAND" "$NPM_COMMAND" "$PYTHON_COMMAND" "$HERMES_AGENT_SOURCE" "$HERMES_AGENT_REPOSITORY_URL" "$HERMES_AGENT_REF" "$INSTALL_HERMES_AGENT_DEPENDENCIES" <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const requestedNode = process.argv[3] || "node";
const requestedNpm = process.argv[4] || "npm";
const requestedPython = process.argv[5] || "python3";
const requestedAgentSource = String(process.argv[6] || "").trim();
const agentRepositoryUrl = String(process.argv[7] || "").trim();
const agentRef = String(process.argv[8] || "main").trim() || "main";
const installAgentDependencies = /^(1|true|yes|on)$/i.test(String(process.argv[9] || "0"));
const runtimeBin = path.join(root, "runtime", "node-current", "bin");
const targetNode = path.join(runtimeBin, "node");
const targetNpm = path.join(runtimeBin, "npm");
const targetNpx = path.join(runtimeBin, "npx");
const agentRoot = path.join(root, "runtime", "hermes-agent-official");
const agentSource = requestedAgentSource ? path.resolve(requestedAgentSource) : path.join(agentRoot, "source");
const agentVenv = path.join(agentRoot, "venv");
const agentPython = path.join(agentVenv, "bin", "python");
const issues = [];
const actions = [];

function parseVersion(text) {
  const match = String(text || "").match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: match[0] };
}

function versionAtLeast(version, minimum) {
  if (!version) return false;
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}

function resolveCommand(command) {
  if (command.includes("/")) return path.resolve(command);
  const result = spawnSync("/usr/bin/env", ["bash", "-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: Object.assign({}, process.env, options.env || {}),
    timeout: options.timeout || 300000,
  });
}

function compactOutput(result) {
  return String(`${result.stderr || ""}\n${result.stdout || ""}`).replace(/\s+/g, " ").trim().slice(-800);
}

function hasPythonProjectMarker(directory) {
  return fs.existsSync(path.join(directory, "pyproject.toml")) || fs.existsSync(path.join(directory, "setup.py"));
}

function ensureSymlink(pathName, resolvedTarget, codePrefix) {
  const actionName = codePrefix.replace(/_/g, "-");
  if (fs.existsSync(pathName)) {
    const stat = fs.lstatSync(pathName);
    if (!stat.isSymbolicLink()) {
      issues.push({ code: `${codePrefix}_target_exists_not_symlink`, path: pathName });
      return;
    }
    const currentTarget = fs.readlinkSync(pathName);
    const currentResolved = path.resolve(path.dirname(pathName), currentTarget);
    if (currentResolved !== resolvedTarget) {
      issues.push({
        code: `${codePrefix}_symlink_target_mismatch`,
        path: pathName,
        currentTarget: currentResolved,
        requestedTarget: resolvedTarget,
      });
      return;
    }
    actions.push({ action: `${actionName}-already-linked`, path: pathName, target: resolvedTarget });
    return;
  }
  fs.symlinkSync(resolvedTarget, pathName);
  actions.push({ action: `${actionName}-symlink`, path: pathName, target: resolvedTarget });
}

function createSanitizedPythonBuildSource(sourceDirectory) {
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-hermes-agent-build-"));
  const buildSource = path.join(buildRoot, "source");
  fs.cpSync(sourceDirectory, buildSource, {
    recursive: true,
    filter(sourcePath) {
      const base = path.basename(sourcePath);
      if (base === ".git" || base === "__pycache__" || base.endsWith(".egg-info")) return false;
      return true;
    },
  });
  actions.push({
    action: "hermes-agent-build-source-create",
    source: path.relative(root, sourceDirectory) || sourceDirectory,
    excluded: [".git", "__pycache__", "*.egg-info"],
  });
  return { buildRoot, buildSource };
}

try {
  const resolvedNode = resolveCommand(requestedNode);
  if (!resolvedNode || !fs.existsSync(resolvedNode)) {
    issues.push({ code: "node_command_not_found", command: requestedNode });
  } else {
    const versionResult = spawnSync(resolvedNode, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const versionOutput = `${versionResult.stdout || ""}\n${versionResult.stderr || ""}`.trim();
    const version = parseVersion(versionOutput);
    if (versionResult.status !== 0 || !versionAtLeast(version, { major: 22, minor: 0, patch: 0 })) {
      issues.push({
        code: "node_version_too_old_or_unreadable",
        command: resolvedNode,
        found: versionOutput || `status=${versionResult.status}`,
        required: ">=22.0.0",
      });
    }

    if (issues.length === 0) {
      fs.mkdirSync(runtimeBin, { recursive: true, mode: 0o755 });
      ensureSymlink(targetNode, resolvedNode, "runtime_node");
    }
  }

  const resolvedNpm = resolveCommand(requestedNpm);
  if (!resolvedNpm || !fs.existsSync(resolvedNpm)) {
    issues.push({ code: "npm_command_not_found", command: requestedNpm });
  } else if (issues.length === 0) {
    ensureSymlink(targetNpm, resolvedNpm, "runtime_npm");
    const siblingNpx = path.join(path.dirname(resolvedNpm), "npx");
    if (fs.existsSync(siblingNpx)) {
      ensureSymlink(targetNpx, siblingNpx, "runtime_npx");
    }
  }

  const resolvedPython = resolveCommand(requestedPython);
  if (!resolvedPython || !fs.existsSync(resolvedPython)) {
    issues.push({ code: "python_command_not_found", command: requestedPython });
  } else {
    const versionResult = spawnSync(resolvedPython, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const versionOutput = `${versionResult.stdout || ""}\n${versionResult.stderr || ""}`.trim();
    const version = parseVersion(versionOutput);
    if (versionResult.status !== 0 || !versionAtLeast(version, { major: 3, minor: 12, patch: 0 })) {
      issues.push({
        code: "python_version_too_old_or_unreadable",
        command: resolvedPython,
        found: versionOutput || `status=${versionResult.status}`,
        required: ">=3.12.0",
      });
    }
  }

  if (issues.length === 0) {
    fs.mkdirSync(agentRoot, { recursive: true, mode: 0o755 });
    if (fs.existsSync(agentSource)) {
      if (!fs.statSync(agentSource).isDirectory()) {
        issues.push({ code: "hermes_agent_source_not_directory", path: agentSource });
      } else if (!hasPythonProjectMarker(agentSource)) {
        issues.push({ code: "hermes_agent_source_not_python_project", path: agentSource });
      } else {
        actions.push({
          action: fs.existsSync(path.join(agentSource, ".git")) ? "hermes-agent-source-exists" : "hermes-agent-packaged-source-exists",
          path: path.relative(root, agentSource) || agentSource,
        });
      }
    } else {
      if (!agentRepositoryUrl) {
        issues.push({ code: "hermes_agent_repository_url_required", path: agentSource });
      } else {
        fs.mkdirSync(path.dirname(agentSource), { recursive: true, mode: 0o755 });
        const clone = run("git", ["clone", "--branch", agentRef, "--depth", "1", agentRepositoryUrl, agentSource], {
          cwd: path.dirname(agentSource),
          timeout: 600000,
        });
        if (clone.status !== 0) {
          issues.push({
            code: "hermes_agent_clone_failed",
            path: agentSource,
            ref: agentRef,
            detail: compactOutput(clone),
          });
        } else {
          actions.push({ action: "hermes-agent-clone", path: path.relative(root, agentSource) || agentSource, ref: agentRef });
        }
      }
    }
  }

  if (issues.length === 0) {
    if (fs.existsSync(agentPython)) {
      actions.push({ action: "hermes-agent-venv-exists", path: path.relative(root, agentPython) || agentPython });
    } else {
      fs.mkdirSync(path.dirname(agentVenv), { recursive: true, mode: 0o755 });
      const venv = run(resolvedPython, ["-m", "venv", agentVenv], { timeout: 600000 });
      if (venv.status !== 0 || !fs.existsSync(agentPython)) {
        issues.push({
          code: "hermes_agent_venv_create_failed",
          path: agentVenv,
          detail: compactOutput(venv),
        });
      } else {
        actions.push({ action: "hermes-agent-venv-create", path: path.relative(root, agentVenv) || agentVenv });
      }
    }
  }

  if (issues.length === 0 && installAgentDependencies) {
    let buildRoot = "";
    let buildSource = agentSource;
    try {
      const sanitized = createSanitizedPythonBuildSource(agentSource);
      buildRoot = sanitized.buildRoot;
      buildSource = sanitized.buildSource;
    } catch (err) {
      issues.push({
        code: "hermes_agent_build_source_create_failed",
        path: path.relative(root, agentSource) || agentSource,
        detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
      });
    }
    const pip = issues.length === 0 ? run(agentPython, ["-m", "pip", "install", buildSource], {
      cwd: buildSource,
      timeout: 1200000,
    }) : null;
    if (buildRoot) {
      try {
        fs.rmSync(buildRoot, { recursive: true, force: true });
      } catch {}
    }
    if (pip && pip.status !== 0) {
      issues.push({
        code: "hermes_agent_dependency_install_failed",
        path: path.relative(root, agentSource) || agentSource,
        detail: compactOutput(pip),
      });
    } else if (pip) {
      actions.push({ action: "hermes-agent-dependencies-install", path: path.relative(root, agentSource) || agentSource });
    }
  }
} catch (err) {
  issues.push({
    code: "runtime_install_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "install-official-hermes-runtime",
  root,
  nodeCommand: requestedNode,
  pythonCommand: requestedPython,
  runtimeNode: targetNode,
  runtimeNpm: targetNpm,
  hermesAgent: {
    source: agentSource,
    repositoryUrl: agentRepositoryUrl,
    ref: agentRef,
    python: agentPython,
    dependenciesInstalled: installAgentDependencies && issues.length === 0,
  },
  actionCount: actions.length,
  actions,
  rollback: {
    safeOnlyIfCreatedByThisPhase: true,
    commands: [
      `rm -f ${JSON.stringify(targetNode)}`,
      `rm -rf ${JSON.stringify(agentRoot)}`,
    ],
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_directory_layout_phase() {
  node - "$ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const specs = [
  { relativePath: ".", mode: 0o755 },
  { relativePath: "app", mode: 0o755 },
  { relativePath: "data", mode: 0o750 },
  { relativePath: "data/secrets", mode: 0o700 },
  { relativePath: "data/run", mode: 0o700 },
  { relativePath: "data/hermes-home", mode: 0o750 },
  { relativePath: "data/production-drift-audit", mode: 0o750 },
  { relativePath: "runtime", mode: 0o755 },
  { relativePath: "runtime/uploads", mode: 0o750 },
  { relativePath: "plugins", mode: 0o755 },
  { relativePath: "logs", mode: 0o750 },
  { relativePath: "backups", mode: 0o750 },
  { relativePath: "tmp", mode: 0o700 },
];

const actions = [];
const issues = [];
for (const spec of specs) {
  const target = spec.relativePath === "." ? root : path.join(root, spec.relativePath);
  try {
    const existed = fs.existsSync(target);
    if (existed && !fs.statSync(target).isDirectory()) {
      issues.push({ code: "layout_path_not_directory", path: spec.relativePath });
      continue;
    }
    fs.mkdirSync(target, { recursive: true, mode: spec.mode });
    fs.chmodSync(target, spec.mode);
    actions.push({
      path: spec.relativePath,
      mode: `0${spec.mode.toString(8)}`,
      existed,
      action: existed ? "chmod" : "mkdir",
    });
  } catch (err) {
    issues.push({
      code: "layout_path_create_failed",
      path: spec.relativePath,
      detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
    });
  }
}

const created = actions.filter((item) => !item.existed).map((item) => item.path);
const rollbackCommands = created
  .slice()
  .sort((a, b) => b.length - a.length)
  .filter((item) => item !== ".")
  .map((item) => `rmdir ${JSON.stringify(path.join(root, item))} 2>/dev/null || true`);

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "create-directory-layout",
  root,
  actionCount: actions.length,
  createdCount: created.length,
  actions,
  rollback: {
    safeOnlyForEmptyDirectories: true,
    commands: rollbackCommands,
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_access_info_phase() {
  local root="$ROOT"
  local app="$ROOT/app"
  local data="$ROOT/data"
  local runtime="$ROOT/runtime"
  local plugins="$ROOT/plugins"
  local logs="$ROOT/logs"
  local base="$BASE_URL"
  node - "$root" "$app" "$data" "$runtime" "$plugins" "$logs" "$base" "$NETWORK_MODE" <<'NODE'
const [root, app, data, runtime, plugins, logs, base, networkMode] = process.argv.slice(2);
const report = {
  ok: true,
  schemaVersion: 1,
  phase: "print-access-info",
  root,
  paths: { app, data, runtime, plugins, logs },
  access: {
    localUrl: base,
    ownerSetup: `${base.replace(/\/+$/, "")}/`,
    status: `${base.replace(/\/+$/, "")}/api/status?detail=1`,
  },
  networkMode: networkMode || "",
  followUpCommands: [
    `node ${app}/scripts/production-status-smoke.js --access-key-file <owner-key-file> --base ${base.replace(/\/+$/, "")} --json`,
    `sudo ${runtime}/node-current/bin/node ${app}/scripts/macos-production-profile-audit.js --root ${root} --json`,
    `sudo ${runtime}/node-current/bin/node ${app}/scripts/macos-production-closure-validation.js --root ${root} --json`,
  ],
  docs: [
    "docs/PUBLIC_INSTALLATION_CHECKLIST.md",
    "docs/MODULES/deployment.md",
    "docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md",
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
NODE
}

run_smoke_tests_phase() {
  node - "$ROOT" "$NODE_COMMAND" "$BASE_URL" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const requestedNode = String(process.argv[3] || "node").trim() || "node";
const base = String(process.argv[4] || "http://127.0.0.1:8797").trim().replace(/\/+$/, "") || "http://127.0.0.1:8797";
const app = path.join(root, "app");
const runtimeNode = path.join(root, "runtime", "node-current", "bin", "node");
const nodeCommand = fs.existsSync(runtimeNode) ? runtimeNode : requestedNode;
const closureScript = path.join(app, "scripts", "macos-production-closure-validation.js");
const issues = [];
const actions = [];

function rel(file) {
  return path.relative(root, file) || ".";
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1800);
}

function compactClosure(summary = {}) {
  return {
    ok: Boolean(summary.ok),
    expectedVersion: String(summary.expectedVersion || ""),
    activeGlobal: Number(summary.status?.activeGlobal ?? -1),
    finalActiveGlobal: Number(summary.finalStatus?.activeGlobal ?? -1),
    clientVersion: String(summary.status?.clientVersion || ""),
    finalClientVersion: String(summary.finalStatus?.clientVersion || ""),
    profileIssueCount: Number(summary.profileAudit?.issueCount || 0),
    profileBlockingIssueCount: Number(summary.profileAudit?.blockingIssueCount || 0),
    providerAuthPendingIssueCount: Number(summary.profileAudit?.providerAuthPendingIssueCount || 0),
    providerAuthPendingAccepted: Boolean(summary.profileAudit?.providerAuthPendingAccepted),
    profileBlockingWarningCount: Number(summary.profileAudit?.blockingWarningCount || 0),
    aclFailedCount: Number(summary.acl?.failedCount || 0),
    pluginDirectoryOk: summary.pluginDirectory ? Boolean(summary.pluginDirectory.ok) : null,
    boundDirectoryOk: summary.boundDirectory ? Boolean(summary.boundDirectory.path?.ok && summary.boundDirectory.uiRoute?.ok) : null,
    wardrobeBindingOk: summary.wardrobeBinding ? Boolean(summary.wardrobeBinding.ok) : null,
    schemaCount: Array.isArray(summary.schemas) ? summary.schemas.length : 0,
    schemaFailedCount: Array.isArray(summary.schemas) ? summary.schemas.filter((row) => !row.ok).length : 0,
    scope: summary.scope || {},
  };
}

let closure = null;
try {
  if (!fs.existsSync(closureScript)) {
    issues.push({ code: "closure_validation_script_missing", path: rel(closureScript) });
  }
  if (!fs.existsSync(nodeCommand) && nodeCommand.includes("/")) {
    issues.push({ code: "closure_node_missing", path: nodeCommand });
  }
  if (issues.length === 0) {
    const args = [closureScript, "--root", root, "--base", base, "--allow-provider-auth-pending", "--json"];
    const result = spawnSync(nodeCommand, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { NO_COLOR: "1" }),
    });
    actions.push({
      action: "run-closure-validation",
      node: nodeCommand,
      script: rel(closureScript),
      base,
      status: result.status,
    });
    let parsed = null;
    try {
      parsed = JSON.parse(String(result.stdout || "").trim());
    } catch (_) {
      parsed = null;
    }
    if (!parsed) {
      issues.push({
        code: "closure_validation_output_invalid",
        status: result.status,
        outputSample: compactText(result.stderr || result.stdout),
      });
    } else {
      closure = compactClosure(parsed);
      if (result.status !== 0 || !parsed.ok) {
        issues.push({
          code: "closure_validation_failed",
          status: result.status,
          summary: closure,
          outputSample: compactText(result.stderr),
        });
      }
    }
  }
} catch (err) {
  issues.push({
    code: "run_smoke_tests_failed",
    detail: err && err.code ? err.code : String(err && err.message ? err.message : err),
  });
}

const report = {
  ok: issues.length === 0,
  schemaVersion: 1,
  phase: "run-smoke-tests",
  root,
  app,
  nodeCommand,
  base,
  closureScript,
  closure,
  actionCount: actions.length,
  actions,
  rollback: {
    notApplicable: true,
    note: "run-smoke-tests is read-only and does not mutate production state.",
  },
  issues,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
NODE
}

run_phase() {
  case "$1" in
    system-preflight)
      node "$APP_SOURCE/scripts/public-install-preflight.js" --repo-root "$APP_SOURCE" --python-command "$PYTHON_COMMAND" --json
      ;;
    install-dependencies)
      run_dependency_phase
      ;;
    create-service-users)
      run_service_user_phase
      ;;
    configure-owner)
      run_configure_owner_phase
      ;;
    configure-workspace-isolation)
      run_workspace_isolation_phase
      ;;
    configure-gateway-profiles)
      run_gateway_profiles_phase
      ;;
    install-gateway-launchd-services)
      run_gateway_launchd_services_phase
      ;;
    repair-gateway-worker-acl)
      run_gateway_worker_acl_phase
      ;;
    configure-cron)
      run_configure_cron_phase
      ;;
    configure-plugins)
      run_configure_plugins_phase
      ;;
    install-plugin-dependencies)
      run_plugin_dependencies_phase
      ;;
    plan-plugin-workspace-provisioning)
      run_plugin_workspace_provisioning_plan_phase
      ;;
    install-launchd-services)
      run_launchd_services_phase
      ;;
    run-first-start-preflight)
      node "$APP_SOURCE/scripts/macos-first-start-preflight.js" --root "$ROOT" --network-mode "$NETWORK_MODE" --base "$BASE_URL" --json
      ;;
    run-smoke-tests)
      run_smoke_tests_phase
      ;;
    create-directory-layout)
      run_directory_layout_phase
      ;;
    install-hermes-mobile)
      run_install_app_phase
      ;;
    install-official-hermes-runtime)
      run_runtime_phase
      ;;
    print-access-info)
      run_access_info_phase
      ;;
    *)
      return 64
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|--plan)
      MODE="dry-run"
      shift
      ;;
    --execute)
      MODE="execute"
      shift
      ;;
    --guided)
      GUIDED="true"
      shift
      ;;
    --json)
      OUTPUT="json"
      shift
      ;;
    --root)
      ROOT="${2:-}"
      shift 2
      ;;
    --app-source)
      APP_SOURCE="${2:-}"
      shift 2
      ;;
    --node-command)
      NODE_COMMAND="${2:-}"
      shift 2
      ;;
    --npm-command)
      NPM_COMMAND="${2:-}"
      shift 2
      ;;
    --python-command)
      PYTHON_COMMAND="${2:-}"
      shift 2
      ;;
    --service-users)
      SERVICE_USERS="${2:-}"
      shift 2
      ;;
    --owner-key-file)
      OWNER_KEY_FILE="${2:-}"
      shift 2
      ;;
    --workspace-map)
      WORKSPACE_MAP="${2:-}"
      shift 2
      ;;
    --gateway-openai-workers)
      GATEWAY_OPENAI_WORKERS="${2:-}"
      shift 2
      ;;
    --gateway-deepseek-workers)
      GATEWAY_DEEPSEEK_WORKERS="${2:-}"
      shift 2
      ;;
    --gateway-owner-grok-workers)
      GATEWAY_OWNER_GROK_WORKERS="${2:-}"
      shift 2
      ;;
    --gateway-owner-maintenance-openai-workers)
      GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS="${2:-}"
      shift 2
      ;;
    --gateway-owner-maintenance-deepseek-workers)
      GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS="${2:-}"
      shift 2
      ;;
    --plugin-source-mode)
      PLUGIN_SOURCE_MODE="${2:-}"
      shift 2
      ;;
    --plugin-source-bundle-dir)
      PLUGIN_SOURCE_BUNDLE_DIR="${2:-}"
      shift 2
      ;;
    --cron-network-mode)
      CRON_NETWORK_MODE="${2:-}"
      shift 2
      ;;
    --hermes-agent-source)
      HERMES_AGENT_SOURCE="${2:-}"
      shift 2
      ;;
    --hermes-agent-repository-url)
      HERMES_AGENT_REPOSITORY_URL="${2:-}"
      shift 2
      ;;
    --hermes-agent-ref)
      HERMES_AGENT_REF="${2:-}"
      shift 2
      ;;
    --install-hermes-agent-dependencies)
      INSTALL_HERMES_AGENT_DEPENDENCIES="${2:-}"
      shift 2
      ;;
    --phase)
      PHASE_FILTER="${2:-}"
      shift 2
      ;;
    --network-mode)
      NETWORK_MODE="${2:-}"
      shift 2
      ;;
    --base)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$ROOT" || -z "$APP_SOURCE" ]]; then
  echo "root and app-source must be non-empty" >&2
  exit 2
fi

if [[ -z "$NODE_COMMAND" ]]; then
  echo "node-command must be non-empty" >&2
  exit 2
fi

if [[ -z "$NPM_COMMAND" ]]; then
  echo "npm-command must be non-empty" >&2
  exit 2
fi

if [[ -z "$PYTHON_COMMAND" ]]; then
  echo "python-command must be non-empty" >&2
  exit 2
fi

if [[ -n "$PHASE_FILTER" ]] && ! phase_exists "$PHASE_FILTER"; then
  echo "unknown phase: $PHASE_FILTER" >&2
  exit 2
fi

if [[ "$GUIDED" == "true" && -n "$PHASE_FILTER" ]]; then
  echo "--guided cannot be combined with --phase" >&2
  exit 2
fi

PREFLIGHT_JSON="$(node "$APP_SOURCE/scripts/public-install-preflight.js" --repo-root "$APP_SOURCE" --source-only --json)"
PREFLIGHT_OK="$(printf '%s' "$PREFLIGHT_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.parse(s).ok ? "true" : "false"));')"

OK="true"
ISSUE_CODE=""
ISSUE_DETAIL=""
if [[ "$PREFLIGHT_OK" != "true" ]]; then
  OK="false"
  ISSUE_CODE="source_preflight_failed"
  ISSUE_DETAIL="public install source preflight failed"
elif [[ "$MODE" == "execute" ]]; then
  if [[ "$GUIDED" == "true" ]]; then
    GUIDED_REPORTS_FILE="$(mktemp)"
    trap 'rm -f "$GUIDED_REPORTS_FILE"' EXIT
    GUIDED_RUN_PHASES=()
    if [[ "${#GUIDED_AUTO_PHASES[@]}" -gt 0 ]]; then
      GUIDED_RUN_PHASES=("${GUIDED_AUTO_PHASES[@]}")
    fi
    if [[ "${HOMEAI_INSTALL_RUN_OPERATOR_PHASES:-0}" == "1" ]]; then
      if [[ "$(id -u)" != "0" ]]; then
        OK="false"
        ISSUE_CODE="guided_operator_phases_require_root"
        ISSUE_DETAIL="HOMEAI_INSTALL_RUN_OPERATOR_PHASES requires sudo/root"
        GUIDED_FAILED_PHASE="operator-gate"
      else
        GUIDED_RUN_PHASES=("${GUIDED_OPERATOR_PHASES[@]}")
      fi
    fi
    if [[ "${#GUIDED_RUN_PHASES[@]}" -gt 0 ]]; then
      for guided_phase in "${GUIDED_RUN_PHASES[@]}"; do
        if [[ "$OK" != "true" ]]; then
          break
        fi
        EXECUTED_PHASE="$guided_phase"
        set +e
        EXECUTION_JSON="$(run_phase "$guided_phase" 2>/dev/null)"
        EXECUTION_STATUS=$?
        set -e
        PHASE_OK="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const p = JSON.parse(s); console.log(p.ok ? "true" : "false"); } catch { console.log("false"); } });')"
        if [[ "$EXECUTION_STATUS" -eq 0 && "$PHASE_OK" == "true" ]]; then
          GUIDED_EXECUTED_COUNT="$((GUIDED_EXECUTED_COUNT + 1))"
          if [[ -z "$GUIDED_EXECUTED_PHASES" ]]; then
            GUIDED_EXECUTED_PHASES="$guided_phase"
          else
            GUIDED_EXECUTED_PHASES="$GUIDED_EXECUTED_PHASES,$guided_phase"
          fi
          printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { process.stdout.write(JSON.stringify(JSON.parse(s))); });' >> "$GUIDED_REPORTS_FILE"
          printf '\n' >> "$GUIDED_REPORTS_FILE"
        else
          GUIDED_FAILED_PHASE="$guided_phase"
          EXECUTED_PHASE_OK="false"
          EXECUTED_PHASE_ISSUE_CODES="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const p = JSON.parse(s); console.log((p.issues || []).map((item) => item.code).filter(Boolean).join(",")); } catch { console.log("phase_output_not_json"); } });')"
          EXECUTION_REPORT_JSON="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { JSON.parse(s); process.stdout.write(s.trim() || "null"); } catch { process.stdout.write("null"); } });')"
          OK="false"
          ISSUE_CODE="guided_phase_execution_failed"
          ISSUE_DETAIL="$guided_phase failed"
          break
        fi
      done
    fi
    if [[ -z "$GUIDED_FAILED_PHASE" ]]; then
      EXECUTED_PHASE="guided"
      EXECUTED_PHASE_OK="true"
      EXECUTED_PHASE_ISSUE_CODES=""
      EXECUTION_REPORT_JSON="null"
    fi
    GUIDED_REPORTS_JSON="$(node - "$GUIDED_REPORTS_FILE" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const reports = [];
if (file && fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\n+/)) {
    const text = line.trim();
    if (!text) continue;
    try {
      reports.push(JSON.parse(text));
    } catch {
      reports.push({ ok: false, issues: [{ code: "guided_report_not_json" }] });
    }
  }
}
process.stdout.write(JSON.stringify(reports));
NODE
)"
  elif [[ -z "$PHASE_FILTER" ]]; then
    OK="false"
    ISSUE_CODE="execute_phase_required"
    ISSUE_DETAIL="execute requires --phase; full privileged install execution is not enabled"
  elif ! phase_executable "$PHASE_FILTER"; then
    OK="false"
    ISSUE_CODE="phase_execute_not_enabled"
    ISSUE_DETAIL="this phase is not executable until it has an idempotent implementation and rollback test"
  elif [[ "$PHASE_FILTER" == "run-first-start-preflight" && "$NETWORK_MODE" != "direct" && "$NETWORK_MODE" != "proxy" ]]; then
    OK="false"
    ISSUE_CODE="network_mode_required"
    ISSUE_DETAIL="run-first-start-preflight requires --network-mode direct or --network-mode proxy"
  else
    EXECUTED_PHASE="$PHASE_FILTER"
    set +e
    EXECUTION_JSON="$(run_phase "$PHASE_FILTER" 2>/dev/null)"
    EXECUTION_STATUS=$?
    set -e
    EXECUTED_PHASE_OK="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const p = JSON.parse(s); console.log(p.ok ? "true" : "false"); } catch { console.log("false"); } });')"
    EXECUTED_PHASE_ISSUE_CODES="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const p = JSON.parse(s); console.log((p.issues || []).map((item) => item.code).filter(Boolean).join(",")); } catch { console.log("phase_output_not_json"); } });')"
    EXECUTION_REPORT_JSON="$(printf '%s' "$EXECUTION_JSON" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { JSON.parse(s); process.stdout.write(s.trim() || "null"); } catch { process.stdout.write("null"); } });')"
    if [[ "$EXECUTION_STATUS" -ne 0 || "$EXECUTED_PHASE_OK" != "true" ]]; then
      OK="false"
      ISSUE_CODE="phase_execution_failed"
      ISSUE_DETAIL="$PHASE_FILTER failed"
    fi
  fi
fi

if [[ "$OUTPUT" == "json" ]]; then
  {
    printf '{\n'
    printf '  "ok": %s,\n' "$OK"
    printf '  "schemaVersion": 1,\n'
    printf '  "mode": %s,\n' "$(printf '%s' "$MODE" | json_escape)"
    printf '  "guided": %s,\n' "$GUIDED"
    printf '  "root": %s,\n' "$(printf '%s' "$ROOT" | json_escape)"
    printf '  "appSource": %s,\n' "$(printf '%s' "$APP_SOURCE" | json_escape)"
    printf '  "nodeCommand": %s,\n' "$(printf '%s' "$NODE_COMMAND" | json_escape)"
    printf '  "npmCommand": %s,\n' "$(printf '%s' "$NPM_COMMAND" | json_escape)"
    printf '  "pythonCommand": %s,\n' "$(printf '%s' "$PYTHON_COMMAND" | json_escape)"
    printf '  "serviceUsers": %s,\n' "$(printf '%s' "$SERVICE_USERS" | json_escape)"
    printf '  "ownerKeyFile": %s,\n' "$(printf '%s' "${OWNER_KEY_FILE:-$ROOT/data/secrets/owner-web-key.secret}" | json_escape)"
    printf '  "workspaceMap": %s,\n' "$(printf '%s' "$WORKSPACE_MAP" | json_escape)"
    printf '  "gatewayOpenAiWorkers": %s,\n' "$(printf '%s' "$GATEWAY_OPENAI_WORKERS" | json_escape)"
    printf '  "gatewayDeepSeekWorkers": %s,\n' "$(printf '%s' "$GATEWAY_DEEPSEEK_WORKERS" | json_escape)"
    printf '  "gatewayOwnerGrokWorkers": %s,\n' "$(printf '%s' "$GATEWAY_OWNER_GROK_WORKERS" | json_escape)"
    printf '  "gatewayOwnerMaintenanceOpenAiWorkers": %s,\n' "$(printf '%s' "$GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS" | json_escape)"
    printf '  "gatewayOwnerMaintenanceDeepSeekWorkers": %s,\n' "$(printf '%s' "$GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS" | json_escape)"
    printf '  "pluginSourceMode": %s,\n' "$(printf '%s' "$PLUGIN_SOURCE_MODE" | json_escape)"
    printf '  "pluginSourceBundleDir": %s,\n' "$(printf '%s' "$PLUGIN_SOURCE_BUNDLE_DIR" | json_escape)"
    printf '  "cronNetworkMode": %s,\n' "$(printf '%s' "$CRON_NETWORK_MODE" | json_escape)"
    printf '  "hermesAgentSource": %s,\n' "$(printf '%s' "${HERMES_AGENT_SOURCE:-$ROOT/runtime/hermes-agent-official/source}" | json_escape)"
    printf '  "hermesAgentRepositoryUrl": %s,\n' "$(printf '%s' "$HERMES_AGENT_REPOSITORY_URL" | json_escape)"
    printf '  "hermesAgentRef": %s,\n' "$(printf '%s' "$HERMES_AGENT_REF" | json_escape)"
    printf '  "installHermesAgentDependencies": %s,\n' "$(printf '%s' "$INSTALL_HERMES_AGENT_DEPENDENCIES" | json_escape)"
    printf '  "phaseFilter": %s,\n' "$(printf '%s' "$PHASE_FILTER" | json_escape)"
    printf '  "networkMode": %s,\n' "$(printf '%s' "$NETWORK_MODE" | json_escape)"
    printf '  "base": %s,\n' "$(printf '%s' "$BASE_URL" | json_escape)"
    printf '  "preflightOk": %s,\n' "$PREFLIGHT_OK"
    printf '  "phaseCount": %s,\n' "${#PHASES[@]}"
    printf '  "phases": [\n'
    for index in "${!PHASES[@]}"; do
      phase="${PHASES[$index]}"
      comma=","
      [[ "$index" == "$((${#PHASES[@]} - 1))" ]] && comma=""
      command="$(phase_command "$phase")"
      status="planned"
      if [[ "$GUIDED" == "true" ]]; then
        if guided_phase_executed "$phase"; then
          status="executed"
        elif [[ "$GUIDED_FAILED_PHASE" == "$phase" ]]; then
          status="failed"
        elif phase_guided_auto "$phase"; then
          status="guided-auto"
        elif phase_guided_operator "$phase"; then
          status="operator-required"
        else
          status="source-check"
        fi
      elif [[ "$MODE" == "execute" ]] && phase_selected "$phase"; then
        if [[ "$EXECUTED_PHASE" == "$phase" && "$EXECUTED_PHASE_OK" == "true" ]]; then
          status="executed"
        elif [[ "$EXECUTED_PHASE" == "$phase" ]]; then
          status="failed"
        elif phase_executable "$phase"; then
          status="ready"
        else
          status="not-enabled"
        fi
      fi
      printf '    {"order": %s, "id": %s, "status": %s, "selected": %s, "command": %s}%s\n' "$((index + 1))" "$(printf '%s' "$phase" | json_escape)" "$(printf '%s' "$status" | json_escape)" "$(phase_selected "$phase" && printf true || printf false)" "$(printf '%s' "$command" | json_escape)" "$comma"
    done
    printf '  ],\n'
    if [[ "${#GUIDED_AUTO_PHASES[@]}" -gt 0 ]]; then
      GUIDED_AUTO_PHASES_JSON="$(json_array "${GUIDED_AUTO_PHASES[@]}")"
    else
      GUIDED_AUTO_PHASES_JSON="[]"
    fi
    printf '  "guidedPlan": {"autoPhaseIds": %s, "operatorPhaseIds": %s, "operatorSteps": %s, "executedCount": %s, "failedPhase": %s, "reports": %s},\n' "$GUIDED_AUTO_PHASES_JSON" "$(json_array "${GUIDED_OPERATOR_PHASES[@]}")" "$(guided_operator_steps_json)" "$GUIDED_EXECUTED_COUNT" "$(printf '%s' "$GUIDED_FAILED_PHASE" | json_escape)" "$GUIDED_REPORTS_JSON"
    printf '  "execution": {"phase": %s, "ok": %s, "issueCodes": [' "$(printf '%s' "$EXECUTED_PHASE" | json_escape)" "$EXECUTED_PHASE_OK"
    if [[ -n "$EXECUTED_PHASE_ISSUE_CODES" ]]; then
      IFS=',' read -r -a issue_codes <<< "$EXECUTED_PHASE_ISSUE_CODES"
      for issue_index in "${!issue_codes[@]}"; do
        [[ "$issue_index" != "0" ]] && printf ', '
        printf '%s' "$(printf '%s' "${issue_codes[$issue_index]}" | json_escape)"
      done
    fi
    printf '], "report": %s},\n' "$EXECUTION_REPORT_JSON"
    printf '  "issues": ['
    if [[ -n "$ISSUE_CODE" ]]; then
      printf '{"code": %s, "detail": %s}' "$(printf '%s' "$ISSUE_CODE" | json_escape)" "$(printf '%s' "$ISSUE_DETAIL" | json_escape)"
    fi
    printf ']\n'
    printf '}\n'
  }
else
  echo "Home AI macOS production install plan"
  echo "mode: $MODE"
  echo "guided: $GUIDED"
  echo "root: $ROOT"
  echo "appSource: $APP_SOURCE"
  [[ -n "$PHASE_FILTER" ]] && echo "phase: $PHASE_FILTER"
  [[ -n "$NETWORK_MODE" ]] && echo "networkMode: $NETWORK_MODE"
  echo "base: $BASE_URL"
  echo "source preflight ok: $PREFLIGHT_OK"
  for index in "${!PHASES[@]}"; do
    printf '%02d. %s\n' "$((index + 1))" "${PHASES[$index]}"
  done
  if [[ "$GUIDED" == "true" ]]; then
    echo "guided automatic phases:"
    for phase in "${GUIDED_AUTO_PHASES[@]}"; do
      echo "- $phase"
    done
    echo "guided operator phases:"
    for phase in "${GUIDED_OPERATOR_PHASES[@]}"; do
      echo "- $phase"
    done
  fi
  if [[ -n "$ISSUE_CODE" ]]; then
    echo "issue: $ISSUE_CODE - $ISSUE_DETAIL"
  fi
fi

[[ "$OK" == "true" ]]
