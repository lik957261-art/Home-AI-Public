#!/usr/bin/env bash
set -euo pipefail

ROOT="${HERMES_MOBILE_ROOT:-/Users/example/path"
APP_DIR="${HERMES_MOBILE_APP_DIR:-$ROOT/app}"
NODE="${HERMES_MOBILE_NODE_EXE:-$ROOT/runtime/node-current/bin/node}"
OUT_DIR="${HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR:-$ROOT/data/production-drift-audit}"
EXPECTED_WORKSPACES="${HOMEAI_PRODUCTION_DRIFT_AUDIT_EXPECTED_WORKSPACES:-owner}"
AUTO_REPAIR="${HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR:-0}"

mkdir -p "$OUT_DIR"
tmp_json="$OUT_DIR/latest.json.tmp"
latest_json="$OUT_DIR/latest.json"
summary_md="$OUT_DIR/summary.md"
repair_json="$OUT_DIR/latest-repair.json"

run_audit() {
  "$NODE" "$APP_DIR/scripts/macos-production-profile-audit.js" \
    --root "$ROOT" \
    --expected-workspaces "$EXPECTED_WORKSPACES" \
    --json \
    --no-strict > "$tmp_json"
}

core_count() {
  "$NODE" - "$tmp_json" <<'NODE'
const fs = require("node:fs");
const audit = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const issues = Array.isArray(audit.issues) ? audit.issues.map(String) : [];
const corePattern = /^(profile_config_|profile_(skills_temp_write_failed|memories_temp_write_failed|soul_unreadable|soul_unwritable):|worker_(manifest_unreadable|api_key_file_missing|api_key_unreadable):|telemetry_(state_db_unreadable|response_store_unreadable):|launchd_(label_missing|plist_missing):|codex_auth_|plugin_local_binding_incomplete:)/;
process.stdout.write(String(issues.filter((item) => corePattern.test(item)).length));
NODE
}

run_audit
repair_attempted=0
repair_ok=""
if [[ "$AUTO_REPAIR" == "1" && "$(core_count)" != "0" ]]; then
  repair_attempted=1
  set +e
  "$NODE" "$APP_DIR/scripts/macos-production-drift-reconcile.js" \
    --root "$ROOT" \
    --execute \
    --json > "$repair_json"
  repair_status=$?
  set -e
  if [[ "$repair_status" == "0" ]]; then
    repair_ok="true"
  else
    repair_ok="false"
  fi
  run_audit
fi

"$NODE" - "$tmp_json" "$latest_json" "$summary_md" "$repair_json" "$repair_attempted" "$repair_ok" <<'NODE'
const fs = require("node:fs");
const [input, latest, summary, repairPath, repairAttemptedRaw, repairOkRaw] = process.argv.slice(2);
const audit = JSON.parse(fs.readFileSync(input, "utf8"));
const issues = Array.isArray(audit.issues) ? audit.issues.map(String) : [];
const warnings = Array.isArray(audit.warnings) ? audit.warnings.map(String) : [];
const corePattern = /^(profile_config_|profile_(skills_temp_write_failed|memories_temp_write_failed|soul_unreadable|soul_unwritable):|worker_(manifest_unreadable|api_key_file_missing|api_key_unreadable):|telemetry_(state_db_unreadable|response_store_unreadable):|launchd_(label_missing|plist_missing):|codex_auth_|plugin_local_binding_incomplete:)/;
const coreDriftIssues = issues.filter((item) => corePattern.test(item));
const profileConfigIssues = issues.filter((item) => item.startsWith("profile_config_"));
let repair = null;
if (repairPath && fs.existsSync(repairPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(repairPath, "utf8"));
    repair = {
      ok: Boolean(raw.ok),
      execute: Boolean(raw.execute),
      actionCount: Number(raw.actionCount || 0),
      rows: Array.isArray(raw.rows)
        ? raw.rows.map((row) => ({
          type: String(row.type || ""),
          action: String(row.action || ""),
          ok: row.ok !== false,
          status: row.status == null ? null : Number(row.status),
          error: String(row.error || "").slice(0, 160),
        })).slice(0, 40)
        : [],
    };
  } catch (_) {
    repair = { ok: false, execute: true, actionCount: 0, rows: [], error: "repair_report_unreadable" };
  }
}
const report = {
  ok: coreDriftIssues.length === 0,
  generatedAt: new Date().toISOString(),
  auditOk: Boolean(audit.ok),
  issueCount: issues.length,
  warningCount: warnings.length,
  coreDriftIssueCount: coreDriftIssues.length,
  profileConfigIssueCount: profileConfigIssues.length,
  autoRepair: {
    enabled: process.env.HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR === "1",
    attempted: repairAttemptedRaw === "1",
    ok: repairOkRaw === "true" ? true : repairOkRaw === "false" ? false : null,
    repair,
  },
  coreDriftIssues: coreDriftIssues.slice(0, 80),
  issues: issues.slice(0, 80),
  warnings: warnings.slice(0, 80),
};
fs.writeFileSync(latest, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
fs.writeFileSync(summary, [
  "# Home AI Production Drift Audit",
  "",
  `- generatedAt: ${report.generatedAt}`,
  `- ok: ${report.ok}`,
  `- auditOk: ${report.auditOk}`,
  `- coreDriftIssueCount: ${report.coreDriftIssueCount}`,
  `- profileConfigIssueCount: ${report.profileConfigIssueCount}`,
  `- autoRepairEnabled: ${report.autoRepair.enabled}`,
  `- autoRepairAttempted: ${report.autoRepair.attempted}`,
  `- autoRepairOk: ${report.autoRepair.ok}`,
  `- issueCount: ${report.issueCount}`,
  `- warningCount: ${report.warningCount}`,
  "",
  "## Repair",
  ...(report.autoRepair.repair
    ? [
      `- ok: ${report.autoRepair.repair.ok}`,
      `- actionCount: ${report.autoRepair.repair.actionCount}`,
      ...report.autoRepair.repair.rows.map((row) => `- ${row.type}: ${row.action} ok=${row.ok}`),
    ]
    : ["- none"]),
  "",
  "## Core Drift Issues",
  ...(report.coreDriftIssues.length ? report.coreDriftIssues.map((item) => `- ${item}`) : ["- none"]),
  "",
].join("\n"), { encoding: "utf8", mode: 0o600 });
process.exit(report.ok ? 0 : 2);
NODE

rm -f "$tmp_json"
