"use strict";

const assert = require("node:assert/strict");
const {
  cardIdsFromTaskCardResult,
  exceptionTaskCardResult,
  normalizeTaskCardDispatchResult,
  taskCardDispatchFailure,
} = require("../adapters/task-card-dispatch-result-service");

function run() {
  assert.deepEqual(cardIdsFromTaskCardResult({ cardIds: ["ttc_a", "", " ttc_b "] }), ["ttc_a", "ttc_b"]);
  assert.deepEqual(cardIdsFromTaskCardResult({ taskCardIds: ["ttc_c"] }), ["ttc_c"]);
  assert.deepEqual(cardIdsFromTaskCardResult({ cardId: "ttc_d" }), ["ttc_d"]);

  const ok = normalizeTaskCardDispatchResult({ ok: true, cardIds: ["ttc_ok"] }, { targetWorkspaceId: "home-ai" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.cardIds, ["ttc_ok"]);
  assert.equal(ok.failure, null);

  const missing = normalizeTaskCardDispatchResult({ ok: true }, {
    targetWorkspaceId: "note",
    targetWorkspace: "/Users/example/path",
    targetThreadTitle: "Note",
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.cardIds, []);
  assert.equal(missing.failure.code, "task_card_dispatch_card_id_missing");
  assert.equal(missing.failure.targetWorkspaceId, "note");
  assert.equal(missing.failure.targetThreadTitle, "Note");

  const failed = taskCardDispatchFailure({ ok: false, status: 404, error: "target_thread_not_visible" }, {
    targetThreadId: "thread-1",
  });
  assert.equal(failed.code, "target_thread_not_visible");
  assert.equal(failed.status, 404);
  assert.equal(failed.targetThreadId, "thread-1");

  const exception = exceptionTaskCardResult(new Error("transport unavailable"));
  assert.equal(exception.ok, false);
  assert.equal(exception.error, "transport unavailable");

  console.log("task card dispatch result service tests passed");
}

run();
