"use strict";

function createRuntimeOperationErrorResponseService(options = {}) {
  const sendJson = typeof options.sendJson === "function" ? options.sendJson : null;
  if (!sendJson) throw new Error("RuntimeOperationErrorResponseService requires sendJson");

  function todoErrorResponse(res, result, fallbackStatus = 400) {
    sendJson(res, fallbackStatus, { error: result?.error || "Todo operation failed", result });
  }

  function kanbanErrorResponse(res, result, fallbackStatus = 400) {
    sendJson(res, fallbackStatus, { error: result?.error || "Kanban operation failed", result });
  }

  return Object.freeze({
    kanbanErrorResponse,
    todoErrorResponse,
  });
}

module.exports = {
  createRuntimeOperationErrorResponseService,
};
