"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createDirectSkillResolver,
  createSkillDetailProvider,
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
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Demo Skill\n\nBody", "utf8");
    const direct = createDirectSkillResolver({ skillRoots: [root] });
    const directDetail = direct.detail("study-templates/demo-skill");
    assert.equal(directDetail.path, "study-templates/demo-skill");
    assert.equal(directDetail.namespace, "study-templates");
    assert.equal(directDetail.content, "# Demo Skill\n\nBody");

    const fallbackProvider = createSkillDetailProvider({
      skillRoots: [root],
      async runBridge() {
        throw new Error("bridge invalid JSON");
      },
    });
    const fallbackDetail = await fallbackProvider.detail("demo-skill");
    assert.equal(fallbackDetail.path, "study-templates/demo-skill");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
