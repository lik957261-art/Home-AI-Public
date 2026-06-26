"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  validateDeepProductRealityBatchLedger,
} = require("../adapters/deep-product-reality-batch-ledger-service");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "scripts", "deep-product-reality-batch-ledger-validator.js");

function assessmentAxes({ architecture = "aligned", implementation = "aligned", ux = "aligned" } = {}) {
  function axis(verdict, label) {
    return {
      verdict,
      opinion: `${label} assessment is bounded and evidence-backed for this audit scope.`,
      evidence: [`${label} docs -> source -> tests -> host proxy evidence`],
      improvements: verdict === "finding" || verdict === "improvement_recommended"
        ? [`Improve ${label} boundary before deep closure.`]
        : [],
    };
  }
  return {
    architecture: axis(architecture, "architecture"),
    implementation: axis(implementation, "implementation"),
    ux: axis(ux, "ux"),
  };
}

function validLedger() {
  return {
    batch_status: "partially_completed",
    requested_plugins: ["finance", "wardrobe", "music"],
    reasoning_evidence: {
      requested: "xhigh",
      delivery_reasoning_effort: "xhigh",
      injection_runtime_reasoning_effort: "xhigh",
    },
    coverage: [
      {
        plugin_id: "finance",
        status: "findings_sent_deep",
        journey_count: 3,
        finding_count: 1,
        repair_cards: ["ttc_finance"],
        blocked_reason: "Attachment UI journey needs executable frontend behavior proof.",
        evidence_digest: {
          assessment_axes: assessmentAxes({ implementation: "finding", ux: "improvement_recommended" }),
        },
      },
      {
        plugin_id: "wardrobe",
        status: "closed_deep",
        journey_count: 4,
        finding_count: 0,
        evidence_digest: {
          documents_read: ["docs/WARDROBE_PRODUCT_REALITY.md", "docs/TEST_MATRIX.md"],
          journeys: ["inventory/photo lifecycle", "today outfit", "style reference", "packing reference"],
          source_test_runtime_trails: [
            "routes: docs -> web/plugin-action-routes.js -> tests/test_hermes_plugin_contract.py -> host proxy 200",
          ],
          skipped_boundaries: ["private wardrobe records/images"],
          open_questions: ["none for audited scope"],
          assessment_axes: assessmentAxes(),
        },
      },
      {
        plugin_id: "music",
        status: "partially_completed",
        journey_count: 2,
        finding_count: 0,
        blocked_reason: "Demo UI visual artifact is still pending.",
        evidence_digest: {
          assessment_axes: assessmentAxes({ ux: "blocked" }),
        },
      },
    ],
    privacy_review: "passed",
  };
}

function testValidPartialLedgerPasses() {
  const result = validateDeepProductRealityBatchLedger(validLedger());
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.status, "partially_completed");
  assert.equal(result.coverage.length, 3);
}

function testClosedDeepRequiresEvidenceDigest() {
  const ledger = validLedger();
  ledger.coverage[1] = {
    plugin_id: "wardrobe",
    status: "closed_deep",
    journey_count: 4,
    finding_count: 0,
    evidence_digest: {
      journeys: ["inventory/photo lifecycle", "today outfit"],
    },
  };
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid_return");
  assert.ok(result.issues.some((issue) => issue.code === "closed_deep_documents_missing" && issue.pluginId === "wardrobe"));
  assert.ok(result.issues.some((issue) => issue.code === "closed_deep_evidence_trails_missing" && issue.pluginId === "wardrobe"));
  assert.ok(result.issues.some((issue) => issue.code === "closed_deep_skipped_boundaries_missing" && issue.pluginId === "wardrobe"));
  assert.ok(result.issues.some((issue) => issue.code === "deep_assessment_axis_missing" && issue.pluginId === "wardrobe"));
}

function testDeepRowsRequireAssessmentAxes() {
  const ledger = validLedger();
  delete ledger.coverage[0].evidence_digest;
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "deep_assessment_axis_missing" && issue.pluginId === "finance"));
}

function testAssessmentFindingsRequireConcreteImprovements() {
  const ledger = validLedger();
  ledger.coverage[1].evidence_digest.assessment_axes.implementation = {
    verdict: "improvement_recommended",
    opinion: "Implementation is coherent but would benefit from a narrower test seam.",
    evidence: ["docs -> service -> test evidence"],
    improvements: [],
  };
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "deep_assessment_axis_improvements_missing" && issue.pluginId === "wardrobe"));
}

function testRejectsMissingRequestedPluginAndOpenCompletedBatch() {
  const ledger = validLedger();
  ledger.batch_status = "completed";
  ledger.requested_plugins.push("codex-mobile");
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "requested_plugin_missing_from_coverage" && issue.pluginId === "codex-mobile"));
  assert.ok(result.issues.some((issue) => issue.code === "batch_completed_with_open_plugin_status"));
}

function testRejectsFindingsWithoutRepairDestination() {
  const ledger = validLedger();
  ledger.coverage[0].repair_cards = [];
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "finding_repair_destination_missing" && issue.pluginId === "finance"));
}

function testRejectsMissingXhighAndSecretMarkers() {
  const ledger = validLedger();
  ledger.reasoning_evidence = { requested: "medium" };
  ledger.notes = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz";
  const result = validateDeepProductRealityBatchLedger(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "xhigh_reasoning_evidence_missing"));
  assert.ok(result.issues.some((issue) => issue.code === "privacy_raw_secret_marker"));
}

function testCliValidatesJsonFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-ledger-validator-"));
  const file = path.join(dir, "ledger.json");
  try {
    fs.writeFileSync(file, JSON.stringify(validLedger()), "utf8");
    const result = spawnSync(process.execPath, [
      cliPath,
      "--json-file", file,
      "--requested-plugins", "finance,wardrobe,music",
      "--json",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.status, "partially_completed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testCliFailsInvalidJsonFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-ledger-validator-"));
  const file = path.join(dir, "ledger.json");
  try {
    const ledger = validLedger();
    ledger.coverage = ledger.coverage.slice(0, 1);
    fs.writeFileSync(file, JSON.stringify(ledger), "utf8");
    const result = spawnSync(process.execPath, [
      cliPath,
      "--json-file", file,
      "--requested-plugins", "finance,wardrobe,music",
      "--json",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, "invalid_return");
    assert.ok(parsed.issues.some((issue) => issue.code === "requested_plugin_missing_from_coverage" && issue.pluginId === "wardrobe"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testCliExtractsLedgerJsonFromReturnMarkdown() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-ledger-validator-"));
  const file = path.join(dir, "return.md");
  try {
    fs.writeFileSync(file, [
      "# Return Card",
      "",
      "Human-readable summary.",
      "",
      "```ledger_json",
      JSON.stringify(validLedger()),
      "```",
      "",
    ].join("\n"), "utf8");
    const result = spawnSync(process.execPath, [
      cliPath,
      "--body-file", file,
      "--requested-plugins", "finance,wardrobe,music",
      "--json",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.coverage.length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

testValidPartialLedgerPasses();
testClosedDeepRequiresEvidenceDigest();
testDeepRowsRequireAssessmentAxes();
testAssessmentFindingsRequireConcreteImprovements();
testRejectsMissingRequestedPluginAndOpenCompletedBatch();
testRejectsFindingsWithoutRepairDestination();
testRejectsMissingXhighAndSecretMarkers();
testCliValidatesJsonFile();
testCliFailsInvalidJsonFile();
testCliExtractsLedgerJsonFromReturnMarkdown();

console.log("deep product reality batch ledger service tests passed");
