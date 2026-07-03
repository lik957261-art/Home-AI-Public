"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function requireFile(issues, relativePath) {
  if (!exists(relativePath)) {
    addIssue(issues, "missing_file", relativePath);
    return false;
  }
  return true;
}

function requireText(issues, relativePath, pattern, code, detail) {
  if (!requireFile(issues, relativePath)) return;
  const text = readText(relativePath);
  if (!pattern.test(text)) {
    addIssue(issues, code, detail || relativePath);
  }
}

function requireTextInOrder(issues, relativePath, needles, code, detail) {
  if (!requireFile(issues, relativePath)) return;
  const text = readText(relativePath);
  let offset = 0;
  for (const needle of needles) {
    const index = text.indexOf(needle, offset);
    if (index === -1) {
      addIssue(issues, code, detail || `${relativePath} must contain productization gates in the expected order`);
      return;
    }
    offset = index + needle.length;
  }
}

function checkRequiredFiles(issues) {
  [
    ".github/workflows/ci.yml",
    "docs/DOCS_INDEX.md",
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/TEST_MATRIX.md",
    "docs/MODULES/deployment.md",
    "docs/MODULES/plugins.md",
    "docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md",
    "docs/PLATFORM_CONTRACTS/fallback-governance-contract.md",
    "docs/IMPLEMENTATION_NOTES/fallback-registry.md",
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    "adapters/codex-mobile-recovery-service.js",
    "server-routes/codex-mobile-recovery-api-routes.js",
    "scripts/productization-check.js",
    "scripts/fallback-governance-check.js",
    "scripts/public-install-preflight.js",
    "scripts/install-macos-production.sh",
    "scripts/macos-install-phase-coverage-audit.js",
    "scripts/macos-fresh-install-rehearsal.js",
    "scripts/macos-install-verification-classification.js",
    "scripts/macos-install-operator-closure-checklist.js",
    "scripts/macos-first-start-preflight.js",
    "scripts/plugin-provisioning-coverage-audit.js",
    "scripts/production-self-diagnostics.js",
    "scripts/production-self-diagnostics-coverage-audit.js",
    "scripts/productization-acceptance-matrix.js",
    "scripts/production-status-smoke.js",
    "scripts/macos-production-profile-audit.js",
    "scripts/grok-auth-metadata-smoke.js",
    "scripts/grok-xai-oauth-closure-checklist.js",
    "scripts/windows-dev-services-boundary-checklist.js",
    "scripts/macos-workspace-file-broker-boundary-checklist.js",
    "scripts/macos-web-push-production-audit.js",
    "scripts/macos-worker-filesystem-access-harness.js",
    "scripts/macos-gateway-manifest-toolset-smoke.js",
    "scripts/macos-plugin-directory-production-smoke.js",
    "scripts/macos-bound-directory-preview-smoke.js",
    "scripts/macos-automation-cron-audit.js",
    "scripts/macos-production-closure-validation.js",
    "tests/production-self-diagnostics.test.js",
    "tests/production-self-diagnostics-coverage-audit.test.js",
    "tests/public-install-preflight.test.js",
    "tests/install-macos-production.test.js",
    "tests/macos-install-phase-coverage-audit.test.js",
    "tests/macos-fresh-install-rehearsal.test.js",
    "tests/macos-install-verification-classification.test.js",
    "tests/macos-install-operator-closure-checklist.test.js",
    "tests/macos-first-start-preflight.test.js",
    "tests/macos-web-push-production-audit.test.js",
    "tests/grok-auth-metadata-smoke-harness.test.js",
    "tests/grok-xai-oauth-closure-checklist.test.js",
    "tests/windows-dev-services-boundary-checklist.test.js",
    "tests/macos-workspace-file-broker-boundary-checklist.test.js",
    "tests/codex-mobile-recovery-service.test.js",
    "tests/codex-mobile-recovery-api-routes.test.js",
    "tests/plugin-provisioning-coverage-audit.test.js",
    "tests/fallback-governance-check.test.js",
    "tests/productization-acceptance-matrix.test.js",
  ].forEach((relativePath) => requireFile(issues, relativePath));
}

function checkCiGate(issues) {
  requireText(
    issues,
    ".github/workflows/ci.yml",
    /npm\s+run\s+productization:check/,
    "ci_missing_productization_check",
    ".github/workflows/ci.yml must run npm run productization:check",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /public-install-preflight\.js/,
    "productization_missing_public_install_preflight",
    "productization-check.js must run public-install-preflight.js in source-only mode",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /runNpm\(\["test"\]\)/,
    "productization_missing_npm_test",
    "productization-check.js must run npm test",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /runNpm\(\["run",\s*"test:install-lane"\]\)/,
    "productization_missing_install_lane_test",
    "productization-check.js must run npm run test:install-lane",
  );
  requireText(
    issues,
    "scripts/run-checks.js",
    /INSTALL_AND_DEPLOY_LANE_TESTS[\s\S]+--test-install-lane[\s\S]+--test-all/,
    "run_checks_missing_install_lane_split",
    "run-checks.js must keep install/deploy lane tests outside the default local npm test gate",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /startupCheck\(\)/,
    "productization_missing_startup_check",
    "productization-check.js must run startupCheck()",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /engineering-governance-check\.js/,
    "productization_missing_governance_check",
    "productization-check.js must run engineering-governance-check.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /fallback-governance-check\.js[\s\S]+--json/,
    "productization_missing_fallback_governance_check",
    "productization-check.js must run fallback-governance-check.js --json",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /plugin-provisioning-coverage-audit\.js/,
    "productization_missing_plugin_provisioning_coverage_audit",
    "productization-check.js must run plugin-provisioning-coverage-audit.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-install-phase-coverage-audit\.js/,
    "productization_missing_macos_install_phase_coverage_audit",
    "productization-check.js must run macos-install-phase-coverage-audit.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-fresh-install-rehearsal\.js/,
    "productization_missing_macos_fresh_install_rehearsal",
    "productization-check.js must run macos-fresh-install-rehearsal.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-first-start-preflight\.js[\s\S]+--source-only/,
    "productization_missing_macos_first_start_preflight_source_check",
    "productization-check.js must run macos-first-start-preflight.js --source-only",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-install-verification-classification\.js/,
    "productization_missing_macos_install_verification_classification",
    "productization-check.js must run macos-install-verification-classification.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-install-operator-closure-checklist\.js/,
    "productization_missing_macos_install_operator_closure_checklist",
    "productization-check.js must run macos-install-operator-closure-checklist.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /grok-xai-oauth-closure-checklist\.js/,
    "productization_missing_grok_xai_oauth_closure_checklist",
    "productization-check.js must run grok-xai-oauth-closure-checklist.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /windows-dev-services-boundary-checklist\.js/,
    "productization_missing_windows_development_task_boundary_checklist",
    "productization-check.js must run windows-dev-services-boundary-checklist.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-workspace-file-broker-boundary-checklist\.js/,
    "productization_missing_macos_workspace_file_broker_boundary_checklist",
    "productization-check.js must run macos-workspace-file-broker-boundary-checklist.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /codex-mobile-recovery-service\.test\.js/,
    "productization_missing_codex_mobile_recovery_service_test",
    "productization-check.js must run codex-mobile-recovery-service.test.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /codex-mobile-recovery-api-routes\.test\.js/,
    "productization_missing_codex_mobile_recovery_api_route_test",
    "productization-check.js must run codex-mobile-recovery-api-routes.test.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /macos-web-push-production-audit\.js[\s\S]+--source-check/,
    "productization_missing_web_push_production_audit_source_check",
    "productization-check.js must run macos-web-push-production-audit.js --source-check",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /production-self-diagnostics-coverage-audit\.js/,
    "productization_missing_production_self_diagnostics_coverage_audit",
    "productization-check.js must run production-self-diagnostics-coverage-audit.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /production-self-diagnostics\.js/,
    "productization_missing_production_self_diagnostics_inventory",
    "productization-check.js must run production-self-diagnostics.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /productization-acceptance-matrix\.js[\s\S]+--verify-docs/,
    "productization_missing_acceptance_matrix_verify_docs",
    "productization-check.js must run productization-acceptance-matrix.js --verify-docs",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /git",\s*\["diff",\s*"--check"\]/,
    "productization_missing_diff_check",
    "productization-check.js must run git diff --check",
  );
  requireTextInOrder(
    issues,
    "scripts/productization-check.js",
    [
      "Engineering governance check",
      "Fallback governance check",
      "Public install preflight source check",
      "Plugin provisioning coverage audit",
      "macOS install phase coverage audit",
      "macOS fresh install rehearsal",
      "macOS first-start preflight source check",
      "macOS install verification classification",
      "macOS install operator closure checklist",
      "Grok xAI OAuth closure checklist",
      "Windows development task boundary checklist",
      "macOS workspace file broker boundary checklist",
      "Codex Mobile recovery service test",
      "Codex Mobile recovery API route test",
      "macOS Web Push production audit source check",
      "Production self-diagnostics inventory",
      "Production self-diagnostics coverage audit",
      "Productization acceptance matrix docs verification",
      "runNpm([\"test\"])",
      "startupCheck()",
      "Whitespace diff check",
      "Staged whitespace diff check",
    ],
    "productization_gate_order_changed",
    "productization-check.js must preserve the documented gate order",
  );
}

function checkDocs(issues) {
  requireText(
    issues,
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    /## CI-Enforced Constraints[\s\S]+## Production Self-Diagnostics[\s\S]+## Productization Acceptance Matrix/,
    "governance_doc_missing_required_sections",
    "engineering-governance-gates.md must define the three governance sections",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /engineering-governance-gates\.md/,
    "docs_index_missing_governance_doc",
    "DOCS_INDEX must point to engineering-governance-gates.md",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /fallback-governance-contract\.md[\s\S]+fallback-registry\.md[\s\S]+fallback-governance-check\.js/,
    "docs_index_missing_fallback_governance",
    "DOCS_INDEX must point to the fallback governance contract, registry, and executable check",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /audit-thread-governance-contract\.md/,
    "docs_index_missing_audit_thread_governance",
    "DOCS_INDEX must point to the audit thread governance contract",
  );
  requireText(
    issues,
    "docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md",
    /Home AI Platform Audit[\s\S]+Plugin Workspace Audit[\s\S]+must not read[\s\S]+\.agent-context\/HANDOFF\.md[\s\S]+Contract lane[\s\S]+Architecture lane[\s\S]+architecture lane is mandatory[\s\S]+Return Card Required[\s\S]+Scheduled automation may create an audit request card[\s\S]+discover the current audit thread dynamically[\s\S]+must not persist or hard-code Codex audit[\s\S]+[Ss]end exactly one task card to that central audit thread[\s\S]+must not fan out to plugin implementation threads/,
    "audit_thread_governance_contract_incomplete",
    "audit thread governance contract must define dedicated threads, handoff independence, contract and architecture lanes, return-card requirements, scheduler limits, dynamic thread discovery, and central audit-thread routing",
  );
  requireText(
    issues,
    "docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md",
    /Return Card Required[\s\S]+source thread cannot\s+close[\s\S]+silently consumed[\s\S]+redirects, blocks, partially completes, or defers/,
    "root_cause_contract_missing_return_card_closure",
    "root-cause contract must require return cards for every task-card outcome",
  );
  requireText(
    issues,
    "docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md",
    /Return Card Required[\s\S]+Every accepted or rejected cross-thread card[\s\S]+redirected, blocked, partially completed,[\s\S]+Silent consumption is a contract violation/,
    "plugin_contract_missing_return_card_closure",
    "plugin platform contract must require return cards and prohibit silent task-card consumption",
  );
  requireText(
    issues,
    "AGENTS.md",
    /Dedicated audit thread exception[\s\S]+audit-thread-governance-contract\.md[\s\S]+must not read[\s\S]+\.agent-context\/HANDOFF\.md/,
    "agents_missing_audit_thread_exception",
    "AGENTS.md must exempt dedicated audit threads from ordinary handoff loading",
  );
  requireText(
    issues,
    "docs/MODULES/automation.md",
    /audit-thread-governance-contract\.md[\s\S]+Scheduled\s+automation may create a bounded audit request card[\s\S]+must not run deep host\/plugin audits[\s\S]+directly/,
    "automation_doc_missing_audit_scheduler_boundary",
    "Automation docs must state that scheduled audits create request cards instead of running deep audits directly",
  );
  requireText(
    issues,
    "docs/PRODUCT_REQUIREMENTS.md",
    /CI-enforced constraints[\s\S]+production self-diagnostics[\s\S]+productization\s+acceptance\s+matrix/i,
    "product_requirements_missing_governance_rule",
    "PRODUCT_REQUIREMENTS must include the engineering governance product rule",
  );
  requireText(
    issues,
    "docs/TEST_MATRIX.md",
    /engineering-governance-check\.js[\s\S]+fallback-governance-check\.js[\s\S]+production-self-diagnostics\.js[\s\S]+productization-acceptance-matrix\.js[\s\S]+Productization Acceptance Matrix/i,
    "test_matrix_missing_governance_gate",
    "TEST_MATRIX must include the governance check, fallback governance check, and productization matrix",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /public-install-preflight\.js[\s\S]+macos-install-phase-coverage-audit\.js[\s\S]+macos-fresh-install-rehearsal\.js[\s\S]+macos-install-verification-classification\.js[\s\S]+macos-install-operator-closure-checklist\.js[\s\S]+production-self-diagnostics\.js[\s\S]+production-self-diagnostics-coverage-audit\.js[\s\S]+productization-acceptance-matrix\.js/,
    "docs_index_missing_governance_tools",
    "DOCS_INDEX must point to the public install preflight, macOS install phase audit, production diagnostics, and productization matrix tools",
  );
  requireText(
    issues,
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    /fallback-governance-check\.js[\s\S]+public-install-preflight\.js[\s\S]+macos-install-phase-coverage-audit\.js[\s\S]+macos-fresh-install-rehearsal\.js[\s\S]+macos-install-verification-classification\.js[\s\S]+macos-install-operator-closure-checklist\.js[\s\S]+production-self-diagnostics\.js[\s\S]+production-self-diagnostics-coverage-audit\.js[\s\S]+productization-acceptance-matrix\.js/,
    "governance_doc_missing_executable_tools",
    "engineering-governance-gates.md must describe the executable governance tools including fallback governance and the macOS install phase audit",
  );
  requireText(
    issues,
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    /fallback-governance-check\.js[\s\S]+fallback-governance-check\.test\.js/,
    "governance_doc_missing_fallback_governance_local_check",
    "engineering-governance-gates.md must include the fallback governance check and test",
  );
  requireText(
    issues,
    "docs/TEST_MATRIX.md",
    /codex-mobile-recovery-service\.test\.js[\s\S]+codex-mobile-recovery-api-routes\.test\.js/,
    "test_matrix_missing_codex_mobile_recovery_checks",
    "TEST_MATRIX must include the Codex Mobile host recovery service and API route tests",
  );
}

function checkCodexMobileRecovery(issues) {
  requireText(
    issues,
    "docs/MODULES/plugins.md",
    /\/api\/codex-mobile\/recovery\/status[\s\S]+\/api\/codex-mobile\/recovery\/homes[\s\S]+\/api\/codex-mobile\/recovery\/plan[\s\S]+\/api\/codex-mobile\/recovery\/restore/,
    "plugins_doc_missing_codex_mobile_recovery_routes",
    "docs/MODULES/plugins.md must document the Codex Mobile recovery routes",
  );
  requireText(
    issues,
    "docs/MODULES/deployment.md",
    /Codex Mobile has a narrower macOS host recovery path[\s\S]+\/api\/codex-mobile\/recovery\/homes[\s\S]+\/plan[\s\S]+\/restore/,
    "deployment_doc_missing_codex_mobile_recovery",
    "docs/MODULES/deployment.md must document the Codex Mobile host recovery boundary",
  );
  requireText(
    issues,
    "server-routes/mobile-api-plugin-composition.js",
    /createCodexMobileRecoveryApiRoutes[\s\S]+createCodexMobileRecoveryService[\s\S]+codex mobile recovery api routes ready/,
    "mobile_api_missing_codex_mobile_recovery_composition",
    "mobile API plugin composition must wire the Codex Mobile recovery routes and service",
  );
  requireText(
    issues,
    "server-routes/codex-mobile-recovery-api-routes.js",
    /ownerOnly:\s*true[\s\S]+ownerOnly:\s*true[\s\S]+ownerOnly:\s*true[\s\S]+ownerOnly:\s*true/,
    "codex_mobile_recovery_routes_not_owner_only",
    "all Codex Mobile recovery routes must remain Owner-only",
  );
}

function checkProductionDiagnostics(issues) {
  const deploymentDoc = "docs/MODULES/deployment.md";
  [
    "production-status-smoke.js",
    "macos-install-phase-coverage-audit.js",
    "macos-fresh-install-rehearsal.js",
    "macos-install-verification-classification.js",
    "macos-install-operator-closure-checklist.js",
    "production-self-diagnostics-coverage-audit.js",
    "macos-production-profile-audit.js",
    "macos-first-start-preflight.js",
    "grok-auth-metadata-smoke.js",
    "grok-xai-oauth-closure-checklist.js",
    "windows-dev-services-boundary-checklist.js",
    "macos-workspace-file-broker-boundary-checklist.js",
    "macos-web-push-production-audit.js",
    "macos-worker-filesystem-access-harness.js",
    "macos-gateway-manifest-toolset-smoke.js",
    "macos-plugin-directory-production-smoke.js",
    "macos-bound-directory-preview-smoke.js",
    "macos-automation-cron-audit.js",
    "macos-production-closure-validation.js",
  ].forEach((scriptName) => {
    requireText(
      issues,
      deploymentDoc,
      new RegExp(scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "deployment_doc_missing_diagnostic",
      `${deploymentDoc} must reference ${scriptName}`,
    );
  });
}

function runCheck() {
  const issues = [];
  checkRequiredFiles(issues);
  checkCiGate(issues);
  checkDocs(issues);
  checkProductionDiagnostics(issues);
  checkCodexMobileRecovery(issues);
  return { ok: issues.length === 0, issues };
}

function main() {
  const result = runCheck();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    console.log("Engineering governance check passed.");
  } else {
    console.error("Engineering governance check failed:");
    for (const issue of result.issues) {
      console.error(`- ${issue.code}: ${issue.detail}`);
    }
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCheck };
