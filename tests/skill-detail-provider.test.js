"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createDirectSkillResolver,
  createSkillDetailProvider,
  defaultSkillRoots,
} = require("../adapters/skill-detail-provider");

async function run() {
  const calls = [];
  const provider = createSkillDetailProvider({
    async runBridge(payload) {
      calls.push(payload);
      if (payload.skill === "missing/skill") {
        return { ok: false, status: 404, error: "not found", skill: payload.skill };
      }
      return {
        ok: true,
        skill: {
          id: "demo",
          label: "demo",
          namespace: "productivity",
          path: payload.skill,
          content: "# Demo\n",
          totalChars: 7,
          truncated: false,
        },
      };
    },
  });

  const detail = await provider.detail("productivity/demo");
  assert.deepEqual(calls.at(-1), { skill: "productivity/demo" });
  assert.equal(detail.id, "demo");
  assert.equal(detail.path, "productivity/demo");
  assert.equal(detail.content, "# Demo\n");

  await assert.rejects(
    () => provider.detail(""),
    (err) => err.status === 400 && /required/i.test(err.message),
  );

  await assert.rejects(
    () => provider.detail("missing/skill"),
    (err) => err.status === 404 && err.skill === "missing/skill" && /not found/i.test(err.message),
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-detail-provider-"));
  try {
    const skillDir = path.join(root, "study-templates", "demo-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---
creatorWorkspaceId: owner
---

# Demo Skill

Body`, "utf8");
    const direct = createDirectSkillResolver({ skillRoots: [root] });
    const directDetail = direct.detail("study-templates/demo-skill", { auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true } });
    assert.equal(directDetail.path, "study-templates/demo-skill");
    assert.equal(directDetail.namespace, "study-templates");
    assert.match(directDetail.content, /# Demo Skill\n\nBody/);
    assert.equal(directDetail.access.canWrite, true);
    assert.equal(directDetail.access.ownership.creatorWorkspaceId, "owner");

    const fallbackProvider = createSkillDetailProvider({
      skillRoots: [root],
      async runBridge() {
        throw new Error("bridge invalid JSON");
      },
    });
    const fallbackDetail = await fallbackProvider.detail("demo-skill");
    assert.equal(fallbackDetail.path, "study-templates/demo-skill");

    let bridgeCalls = 0;
    const directFirstProvider = createSkillDetailProvider({
      skillRoots: [root],
      async runBridge() {
        bridgeCalls += 1;
        throw new Error("bridge should not run when direct lookup resolves");
      },
    });
    const directFirstDetail = await directFirstProvider.detail("demo-skill");
    assert.equal(directFirstDetail.path, "study-templates/demo-skill");
    assert.equal(bridgeCalls, 0);

    const providerAnalysis = await directFirstProvider.analyze("demo-skill");
    assert.equal(providerAnalysis.skill.path, "study-templates/demo-skill");
    assert.match(providerAnalysis.summary, /Demo Skill/);
    assert.equal(bridgeCalls, 0);

    const xSkillDir = path.join(root, "social-media", "x-social-monitoring-and-briefs");
    fs.mkdirSync(xSkillDir, { recursive: true });
    fs.writeFileSync(path.join(xSkillDir, "SKILL.md"), `---
name: x-social-monitoring-and-briefs
description: Use when a task needs social-media briefs.
creatorWorkspaceId: owner
---

# X Social
`, "utf8");
    const fixed = await directFirstProvider.applyFix("x-social-monitoring-and-briefs", "narrow-x-search-invocation", {
      auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
    });
    assert.equal(fixed.changed, true);
    assert.equal(fixed.detail.path, "social-media/x-social-monitoring-and-briefs");
    assert(fixed.analysis.fixes.some((item) => item.id === "narrow-x-search-invocation"));
    assert.match(fs.readFileSync(path.join(xSkillDir, "SKILL.md"), "utf8"), /Use only when the user explicitly asks to search X\/Twitter/);
    assert.equal(bridgeCalls, 0);

    let postApplyAnalyzeCalls = 0;
    const modelRewriteProvider = createSkillDetailProvider({
      skillRoots: [root],
      skillAnalysisService: {
        async analyze() {
          postApplyAnalyzeCalls += 1;
          throw new Error("post-apply model analysis should not block applyFix when analysis is returned");
        },
        async applyFix() {
          return {
            changed: true,
            fix: { id: "model-suggested-skill-rewrite" },
            content: "# X Social\n\nUpdated body.\n",
            analysis: { skill: { path: "social-media/x-social-monitoring-and-briefs" }, fixes: [] },
          };
        },
      },
      async runBridge() {
        throw new Error("bridge should not run for direct local skill modification");
      },
    });
    const modelFixed = await modelRewriteProvider.applyFix("x-social-monitoring-and-briefs", "model-suggested-skill-rewrite", {
      auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
    });
    assert.equal(modelFixed.changed, true);
    assert.equal(postApplyAnalyzeCalls, 0);
    assert.match(fs.readFileSync(path.join(xSkillDir, "SKILL.md"), "utf8"), /Updated body/);

    const childRoot = path.join(root, "data", "skill-profiles", "child", "skills");
    const childSkillDir = path.join(childRoot, "custom", "owned-skill");
    fs.mkdirSync(childSkillDir, { recursive: true });
    fs.writeFileSync(path.join(childSkillDir, "SKILL.md"), `---
name: owned-skill
creatorWorkspaceId: child
---

# Owned Skill
`, "utf8");
    const childProvider = createSkillDetailProvider({
      skillRoots: [childRoot],
      skillAnalysisService: {
        async analyze(detail) {
          return { skill: { path: detail.path }, fixes: [] };
        },
        async applyFix(detail) {
          return { changed: true, fix: { id: "model-suggested-skill-rewrite" }, content: `${detail.content}\nUpdated.\n`, analysis: { skill: { path: detail.path }, fixes: [] } };
        },
      },
      async runBridge() {
        throw new Error("bridge should not run");
      },
    });
    const childDetail = await childProvider.detail("owned-skill", {
      auth: { ok: true, workspaceId: "child", principalId: "child" },
    });
    assert.equal(childDetail.access.canWrite, true);
    const sharedReadOnlyDetail = await childProvider.detail("owned-skill", {
      auth: { ok: true, workspaceId: "other", principalId: "other" },
    });
    assert.equal(sharedReadOnlyDetail.access.canWrite, false);
    await assert.rejects(
      () => childProvider.applyFix("owned-skill", "model-suggested-skill-rewrite", {
        auth: { ok: true, workspaceId: "other", principalId: "other" },
      }),
      (err) => err.status === 403 && /Skill write access/.test(err.message),
    );

    const boundedRoot = path.join(root, "bounded");
    const boundedSkillDir = path.join(boundedRoot, "level-a", "level-b", "bounded-skill");
    fs.mkdirSync(boundedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(boundedSkillDir, "SKILL.md"), "# Bounded Skill\n", "utf8");
    const boundedResolver = createDirectSkillResolver({
      skillRoots: [boundedRoot],
      maxNamedSkillScanDirs: 1,
      maxNamedSkillScanMs: 1000,
    });
    assert.equal(boundedResolver.detail("bounded-skill"), null);

    const profileRoot = path.join(root, "data", "skill-profiles", "owner-full", "skills");
    const profileSkillDir = path.join(profileRoot, "social-media", "x-social-monitoring-and-briefs");
    fs.mkdirSync(profileSkillDir, { recursive: true });
    fs.writeFileSync(path.join(profileSkillDir, "SKILL.md"), "# X Social\n", "utf8");
    const roots = defaultSkillRoots({
      env: { HERMES_WEB_DATA_DIR: path.join(root, "data") },
      repoRoot: path.join(root, "repo"),
    });
    assert(roots.some((item) => item === profileRoot));

    const scopedDataRoot = path.join(root, "scoped-data");
    const scopedOwnerSkillDir = path.join(scopedDataRoot, "skill-profiles", "owner-full", "skills", "private", "owner-only");
    const scopedChildSkillDir = path.join(scopedDataRoot, "skill-profiles", "child", "skills", "custom", "child-only");
    const scopedOtherSkillDir = path.join(scopedDataRoot, "skill-profiles", "other", "skills", "custom", "other-only");
    const scopedSharedSkillDir = path.join(scopedDataRoot, "skill-profiles", "shared-global", "skills", "shared", "read-only");
    fs.mkdirSync(scopedOwnerSkillDir, { recursive: true });
    fs.mkdirSync(scopedChildSkillDir, { recursive: true });
    fs.mkdirSync(scopedOtherSkillDir, { recursive: true });
    fs.mkdirSync(scopedSharedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(scopedOwnerSkillDir, "SKILL.md"), "# Owner Only\n", "utf8");
    fs.writeFileSync(path.join(scopedChildSkillDir, "SKILL.md"), "# Child Only\n", "utf8");
    fs.writeFileSync(path.join(scopedOtherSkillDir, "SKILL.md"), "# Other Only\n", "utf8");
    fs.writeFileSync(path.join(scopedSharedSkillDir, "SKILL.md"), "# Shared\n", "utf8");

    const childScopedRoots = defaultSkillRoots({
      env: { HERMES_WEB_DATA_DIR: scopedDataRoot },
      repoRoot: path.join(root, "empty-repo"),
    }, {
      auth: { ok: true, workspaceId: "child", principalId: "child" },
      skillWorkspaceId: "child",
    });
    assert(childScopedRoots.some((item) => item.endsWith(path.join("skill-profiles", "child", "skills"))));
    assert(childScopedRoots.some((item) => item.endsWith(path.join("skill-profiles", "shared-global", "skills"))));
    assert.equal(childScopedRoots.some((item) => item.endsWith(path.join("skill-profiles", "owner-full", "skills"))), false);
    assert.equal(childScopedRoots.some((item) => item.endsWith(path.join("skill-profiles", "other", "skills"))), false);

    let scopedBridgeCalls = 0;
    const scopedProvider = createSkillDetailProvider({
      env: { HERMES_WEB_DATA_DIR: scopedDataRoot },
      repoRoot: path.join(root, "empty-repo"),
      async runBridge() {
        scopedBridgeCalls += 1;
        return { ok: true, skill: { path: "bridge/global", content: "# Global\n" } };
      },
    });
    const childScopedDetail = await scopedProvider.detail("child-only", {
      auth: { ok: true, workspaceId: "child", principalId: "child" },
      skillWorkspaceId: "child",
    });
    assert.equal(childScopedDetail.path, "custom/child-only");
    assert.equal(childScopedDetail.access.canWrite, true);
    const sharedScopedDetail = await scopedProvider.detail("read-only", {
      auth: { ok: true, workspaceId: "child", principalId: "child" },
      skillWorkspaceId: "child",
    });
    assert.equal(sharedScopedDetail.access.canWrite, false);
    await assert.rejects(
      () => scopedProvider.detail("owner-only", {
        auth: { ok: true, workspaceId: "child", principalId: "child" },
        skillWorkspaceId: "child",
      }),
      (err) => err.status === 404 && /this workspace Skill Store/.test(err.message),
    );
    await assert.rejects(
      () => scopedProvider.detail("other-only", {
        auth: { ok: true, workspaceId: "child", principalId: "child" },
        skillWorkspaceId: "child",
      }),
      (err) => err.status === 404,
    );
    assert.equal(scopedBridgeCalls, 0);

    const ownerScopedDetail = await scopedProvider.detail("owner-only", {
      auth: { ok: true, workspaceId: "owner", principalId: "owner", role: "owner", isOwner: true },
      skillWorkspaceId: "owner",
    });
    assert.equal(ownerScopedDetail.path, "private/owner-only");
    assert.equal(ownerScopedDetail.access.canWrite, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
