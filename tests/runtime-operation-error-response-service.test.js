"use strict";

const assert = require("node:assert/strict");

const {
  createRuntimeOperationErrorResponseService,
} = require("../adapters/runtime-operation-error-response-service");

const calls = [];
const service = createRuntimeOperationErrorResponseService({
  sendJson(res, status, data) {
    calls.push({ res, status, data });
  },
});

const todoResult = { error: "todo_failed", detail: 1 };
service.todoErrorResponse("todo-res", todoResult, 409);
assert.deepEqual(calls.pop(), {
  res: "todo-res",
  status: 409,
  data: { error: "todo_failed", result: todoResult },
});

const kanbanResult = { ok: false };
service.kanbanErrorResponse("kanban-res", kanbanResult);
assert.deepEqual(calls.pop(), {
  res: "kanban-res",
  status: 400,
  data: { error: "Kanban operation failed", result: kanbanResult },
});

assert.throws(() => createRuntimeOperationErrorResponseService({}), /requires sendJson/);

console.log("runtime operation error response service tests passed");
