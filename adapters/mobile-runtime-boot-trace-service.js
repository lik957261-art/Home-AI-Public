"use strict";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`MobileRuntimeBootTraceService requires ${name}`);
  }
  return value;
}

function createMobileRuntimeBootTraceService(options = {}) {
  const tracePath = String(options.tracePath || "");
  const mkdirSync = requireFunction(options.fs && options.fs.mkdirSync, "fs.mkdirSync");
  const appendFileSync = requireFunction(options.fs && options.fs.appendFileSync, "fs.appendFileSync");
  const dirname = requireFunction(options.path && options.path.dirname, "path.dirname");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const processInfo = options.process || {};

  function bootTrace(label) {
    if (!tracePath) return;
    try {
      mkdirSync(dirname(tracePath), { recursive: true });
      appendFileSync(tracePath, `${nowIso()} pid=${processInfo.pid || ""} ${label}\n`, "utf8");
    } catch (_) {}
  }

  return Object.freeze({
    bootTrace,
  });
}

module.exports = {
  createMobileRuntimeBootTraceService,
};
