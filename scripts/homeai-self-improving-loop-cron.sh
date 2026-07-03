#!/usr/bin/env bash
set -euo pipefail

ROOT="${HERMES_MOBILE_ROOT:-/Users/example/path"
APP_DIR="${HERMES_MOBILE_APP_DIR:-${ROOT%/}/app}"
NODE="${HERMES_MOBILE_NODE_EXE:-${ROOT%/}/runtime/node-current/bin/node}"
ACCESS_KEY_FILE="${HERMES_SELF_LOOP_ACCESS_KEY_FILE:-${ROOT%/}/data/secrets/owner-web-key.secret}"
BASE="${HERMES_SELF_LOOP_BASE:-http://127.0.0.1:8797}"
EXPECTED_VERSION="${HERMES_SELF_LOOP_EXPECTED_VERSION:-}"
AUDIT_SCOPE="${HERMES_SELF_LOOP_AUDIT_SCOPE:-all}"
STATUS_WINDOW_HOURS="${HERMES_SELF_LOOP_STATUS_WINDOW_HOURS:-24}"
SUBMIT_DIAGNOSTICS="${HERMES_SELF_LOOP_SUBMIT_DIAGNOSTICS:-1}"
CREATE_AUDIT_CARDS="${HERMES_SELF_LOOP_CREATE_AUDIT_CARDS:-1}"
QUALITY_EVIDENCE_OUTPUT="${HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT:-${ROOT%/}/data/hermes-home/self-improving-loop/owner-3a-quality-evidence.json}"

if [[ ! -x "$NODE" ]]; then
  echo '{"ok":false,"error":"self_loop_node_missing"}'
  exit 1
fi

if [[ ! -f "${APP_DIR}/scripts/homeai-self-improving-loop.js" ]]; then
  echo '{"ok":false,"error":"self_loop_script_missing"}'
  exit 1
fi

cd "$APP_DIR"

args=(
  "${APP_DIR}/scripts/homeai-self-improving-loop.js"
  "--collect-production-observations"
  "--collector-context" "production"
  "--base" "$BASE"
  "--root" "$ROOT"
  "--status-window-hours" "$STATUS_WINDOW_HOURS"
  "--quality-evidence-output" "$QUALITY_EVIDENCE_OUTPUT"
  "--diagnostic-issues-nonfatal"
  "--json"
)

if [[ -n "$EXPECTED_VERSION" ]]; then
  args+=("--expected-version" "$EXPECTED_VERSION")
fi

if [[ -f "$ACCESS_KEY_FILE" ]]; then
  args+=("--access-key-file" "$ACCESS_KEY_FILE")
elif [[ "$SUBMIT_DIAGNOSTICS" =~ ^(1|true|yes|on)$ || "$CREATE_AUDIT_CARDS" =~ ^(1|true|yes|on)$ ]]; then
  echo '{"ok":false,"error":"self_loop_access_key_file_missing"}'
  exit 1
fi

if [[ "$SUBMIT_DIAGNOSTICS" =~ ^(1|true|yes|on)$ ]]; then
  args+=("--submit-diagnostics")
fi

if [[ "$CREATE_AUDIT_CARDS" =~ ^(1|true|yes|on)$ ]]; then
  args+=("--create-audit-cards" "--audit-scope" "$AUDIT_SCOPE" "--execute")
fi

output="$("$NODE" "${args[@]}")" || {
  status=$?
  printf '%s\n' "$output" | SELF_LOOP_STATUS="$status" "$NODE" -e '
const fs = require("node:fs");
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch (_) {}
const evaluation = payload.evaluation || {};
const production = payload.productionCollection || {};
console.log(JSON.stringify({
  ok: false,
  error: String(payload.error || "self_loop_failed").slice(0, 160),
  status: Number(process.env.SELF_LOOP_STATUS || 1),
  matrixVersion: payload.matrixVersion || "",
  issueCount: Number(evaluation.issueCount || 0),
  observationCount: Number(production.observationCount || evaluation.observationCount || 0),
  qualityEvidenceStatus: String(payload.qualityProgramEvidence?.status || ""),
  qualityEvidenceOutputWritten: payload.qualityEvidenceOutputWritten === true,
  diagnosticSubmitCount: Array.isArray(payload.diagnosticSubmitResults) ? payload.diagnosticSubmitResults.length : 0,
  dispatchCount: Array.isArray(payload.dispatchResults) ? payload.dispatchResults.length : 0
}));
'
  exit "$status"
}

printf '%s\n' "$output" | "$NODE" -e '
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const evaluation = payload.evaluation || {};
const production = payload.productionCollection || {};
console.log(JSON.stringify({
  ok: payload.ok === true,
  matrixVersion: payload.matrixVersion || "",
  status: payload.status || "",
  issueCount: Number(evaluation.issueCount || 0),
  observationCount: Number(production.observationCount || evaluation.observationCount || 0),
  qualityEvidenceStatus: String(payload.qualityProgramEvidence?.status || ""),
  qualityEvidenceOutputWritten: payload.qualityEvidenceOutputWritten === true,
  diagnosticSubmitCount: Array.isArray(payload.diagnosticSubmitResults) ? payload.diagnosticSubmitResults.length : 0,
  diagnosticSubmitFailedCount: Array.isArray(payload.diagnosticSubmitResults) ? payload.diagnosticSubmitResults.filter((item) => !item || item.ok === false).length : 0,
  dispatchCount: Array.isArray(payload.dispatchResults) ? payload.dispatchResults.length : 0,
  dispatchFailedCount: Array.isArray(payload.dispatchResults) ? payload.dispatchResults.filter((item) => !item || item.ok === false).length : 0
}));
'
