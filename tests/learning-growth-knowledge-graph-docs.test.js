"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const requiredDocs = [
  "docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md",
  "docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md",
  "docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md",
  "docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md",
];

for (const docPath of requiredDocs) {
  assert.ok(fs.existsSync(path.join(repoRoot, docPath)), `${docPath} should exist`);
  const text = read(docPath);
  assert.match(text, /learningGraphPlan/);
  assert.match(text, /prerequisite/i);
  assert.match(text, /stage_assessment|stage assessment/i);
  assert.match(text, /summary-only|summary_only/);
  assert.doesNotMatch(text, /raw prompt.*allowed/i);
}

const requirements = read("docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md");
assert.match(requirements, /Every new formal Growth learning card must be generated from a\s+`learningGraphPlan`/);
assert.match(requirements, /The graph model must not be hard-coded to K12/);
assert.match(requirements, /External knowledge structures can be used as seed packs only after conversion/);
assert.match(requirements, /Graph-guided Growth work is H1/);

const architecture = read("docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md");
assert.match(architecture, /learning-graph-node-service/);
assert.match(architecture, /learning-graph-plan-service/);
assert.match(architecture, /learning_card_graph_bindings/);
assert.match(architecture, /Graph records must not store/);

const design = read("docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md");
assert.match(design, /Temporary Nodes/);
assert.match(design, /External Seed Mapping/);
assert.match(design, /public curriculum foundation seed/);
assert.match(design, /stage assessment without `assessmentCoverageNodeIds`/);
assert.match(design, /These signals do not directly become formal mastery failures/);

const implementation = read("docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md");
assert.match(implementation, /Phase 0: Pre-Coding Contract/);
assert.match(implementation, /learning-growth-knowledge-graph-docs\.test\.js/);
assert.match(implementation, /reject graph plan with prerequisite cycle/);
assert.match(implementation, /public_curriculum_foundation/);
assert.match(implementation, /Current Engineering Rule/);

const docsIndex = read("docs/DOCS_INDEX.md");
for (const docPath of requiredDocs) {
  assert.match(docsIndex, new RegExp(docPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\/")));
}

const productRequirements = read("docs/PRODUCT_REQUIREMENTS.md");
assert.match(productRequirements, /validated `learningGraphPlan`/);
assert.match(productRequirements, /not a replacement for card workflow state/);
assert.match(productRequirements, /must support K12 seed packs without being hard-coded to K12/);

const growthModule = read("docs/MODULES/growth-learning.md");
assert.match(growthModule, /learning-graph-node-service/);
assert.match(growthModule, /learning_graph_nodes/);
assert.match(growthModule, /validated `learningGraphPlan`/);

const harnessMatrix = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");
assert.match(harnessMatrix, /validated `learningGraphPlan`/);
assert.match(harnessMatrix, /Graph prerequisites must exist/);
assert.match(harnessMatrix, /Imported external seed nodes must be converted to native Hermes graph records/);
assert.match(harnessMatrix, /Public curriculum foundation imports must be manifest-driven/);

const testMatrix = read("docs/TEST_MATRIX.md");
assert.match(testMatrix, /Planned Growth Knowledge Graph Gate/);
assert.match(testMatrix, /learning-growth-knowledge-graph-docs\.test\.js/);
assert.match(testMatrix, /learning-graph-plan-service\.test\.js/);
assert.match(testMatrix, /URL\/status\/hash provenance/);

const skill = read("skills/study-templates/learning-growth-card-creation/SKILL.md");
assert.match(skill, /Graph-Guided Planning Requirement/);
assert.match(skill, /learningGraphPlanId/);
assert.match(skill, /validated temporary graph node/);
assert.match(skill, /must not bypass the\s+Hermes Mobile Growth workflow services/);

console.log("learning growth knowledge graph docs test passed");
