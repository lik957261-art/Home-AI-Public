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
  "nas_skill_profiles_missing",
  "nas_user_worker_wildcard_workspace",
  "nas_worker_skill_store_missing",
  "nas_worker_uses_shared_base_skills",
  "nas_workspace_root_not_private",
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

const nasStartScript = read("scripts/start-nas-gateway-pool.sh");
assert.ok(
  nasStartScript.includes("SKILL_PROFILES_ROOT"),
  "NAS Gateway launcher must bind workers to NAS-local skill profiles",
);
assert.ok(
  nasStartScript.includes("MEMORY_PROFILES_ROOT"),
  "NAS Gateway launcher must bind workers to NAS-local memory profiles",
);
assert.ok(
  !nasStartScript.includes('for dirname in ["plugins", "skills", "node"]'),
  "NAS Gateway launcher must not symlink every worker to the base Hermes skills directory",
);
assert.ok(
  nasStartScript.includes("first_plugin_workspace"),
  "NAS Gateway launcher must discover workspace-local plugin config before registering plugin MCP",
);
assert.ok(
  nasStartScript.includes("plugin_mcp_config"),
  "NAS Gateway launcher must generate plugin MCP config per worker profile",
);
assert.ok(
  nasStartScript.includes("strip_plugin_toolset") && nasStartScript.includes("append_toolset"),
  "NAS Gateway launcher must hide plugin toolsets unless the selected workspace has plugin config",
);
for (const expectedWorkspace of ["weixin_wuping", "weixin_stephen", "xuyan"]) {
  assert.ok(
    nasStartScript.includes(expectedWorkspace),
    `NAS Gateway launcher must include first-class worker coverage for ${expectedWorkspace}`,
  );
}

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

for (const doc of [deploymentDoc, nasPlan]) {
  assert.ok(
    doc.includes("Skill Store") && doc.includes("Memory Store"),
    "NAS docs must require per-workspace Skill Store and Memory Store binding",
  );
  assert.ok(
    doc.includes("workspace_root_not_private") || doc.includes("not_private") || doc.includes("NAS file-system isolation"),
    "NAS docs must include workspace filesystem isolation preflight language",
  );
  assert.ok(
    doc.includes("workspace-local") && doc.includes("MCP"),
    "NAS docs must require workspace-local plugin MCP registration",
  );
}

console.log("nas-deploy-harness ok");
