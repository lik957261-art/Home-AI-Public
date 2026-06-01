"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

const deployScript = read("scripts/deploy-nas-tracked-source.ps1");
const staticDeployScript = read("scripts/deploy-nas-static-assets.ps1");
const publicChecklist = read("docs/PUBLIC_INSTALLATION_CHECKLIST.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const nasPlan = read("docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md");
const readme = read("README.md");

assert.ok(
  deployScript.includes("git archive --format=tar"),
  "NAS tracked-source deploy must package only Git-tracked source files",
);

assert.ok(
  deployScript.includes("Invoke-NasFirstStartPreflight"),
  "NAS tracked-source deploy must run first-start preflight",
);

for (const requiredCheck of [
  "app_index_version_mismatch",
  "source_index_version_mismatch",
  "served_client_version_mismatch",
  "gateway_user_worker_missing",
  "gateway_healthy_user_worker_missing",
  "nas_single_worker_bridge_not_hybrid_parity",
]) {
  assert.ok(
    deployScript.includes(requiredCheck),
    `NAS first-start preflight must check ${requiredCheck}`,
  );
}

assert.ok(
  deployScript.includes("gateway_not_hybrid_parity"),
  "NAS first-start preflight must support strict hybrid parity failure",
);

assert.ok(
  staticDeployScript.includes("Callers must expand") || deploymentDoc.includes("Callers must expand"),
  "NAS static deploy docs must warn callers to include all changed frontend files",
);

for (const doc of [publicChecklist, deploymentDoc, nasPlan, readme]) {
  assert.ok(
    doc.includes("single worker") || doc.includes("single-worker") || doc.includes("nas-local-codex"),
    "NAS docs must mention the single-worker bridge boundary",
  );
  assert.ok(
    doc.includes("not equivalent") || doc.includes("not the same") || doc.includes("not full elastic"),
    "NAS docs must not present a single-worker bridge as production parity",
  );
}

console.log("nas-deploy-harness ok");
