"use strict";

const assert = require("node:assert/strict");
const { createSkillDetailProvider } = require("../adapters/skill-detail-provider");

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
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
