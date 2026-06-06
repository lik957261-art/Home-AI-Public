"use strict";

function createMobileRuntimeFileHelperService(options = {}) {
  const fs = options.fs || require("node:fs");
  const path = options.path || require("node:path");
  const httpRuntimeService = options.httpRuntimeService;
  const documentPreviewService = options.documentPreviewService;
  const bootTrace = typeof options.bootTrace === "function" ? options.bootTrace : () => {};
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : () => {};
  const isUncPath = typeof options.isUncPath === "function" ? options.isUncPath : (value) => /^\\\\/.test(String(value || ""));
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const processId = Number.isFinite(Number(options.processId)) ? Number(options.processId) : process.pid;

  if (!httpRuntimeService) throw new Error("mobile runtime file helper service requires httpRuntimeService");
  if (!documentPreviewService) throw new Error("mobile runtime file helper service requires documentPreviewService");

  function mimeFor(file) {
    return httpRuntimeService.mimeFor(file);
  }

  function contentDisposition(disposition, filename) {
    return httpRuntimeService.contentDisposition(disposition, filename);
  }

  function extractDocxText(filePath) {
    return documentPreviewService.extractDocxText(filePath);
  }

  function textFilePreview(filePath) {
    return documentPreviewService.textFilePreview(filePath);
  }

  function textBufferPreview(buffer) {
    return documentPreviewService.textBufferPreview(buffer);
  }

  function serveStatic(req, res) {
    return httpRuntimeService.serveStatic(req, res);
  }

  function readJsonFirst(paths, fallback = {}) {
    for (const candidate of paths || []) {
      const p = String(candidate || "").trim();
      if (!p) continue;
      try {
        bootTrace(`readJsonFirst candidate ${isUncPath(p) ? "unc" : "local"} ${path.basename(p) || "root"}`);
        if (!fs.existsSync(p)) continue;
        bootTrace(`readJsonFirst exists ${path.basename(p) || "root"}`);
        const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
        bootTrace(`readJsonFirst parsed ${path.basename(p) || "root"}`);
        return { data: parsed, path: p };
      } catch (_) {
        // Try the next candidate. Recovery copies can be stale or damaged.
      }
    }
    return { data: fallback, path: "" };
  }

  function readJsonStore(filePath, fallback) {
    ensureDataDir();
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStore(filePath, value) {
    ensureDataDir();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${processId}.${nowMs()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, filePath);
  }

  return {
    contentDisposition,
    extractDocxText,
    mimeFor,
    readJsonFirst,
    readJsonStore,
    serveStatic,
    textBufferPreview,
    textFilePreview,
    writeJsonStore,
  };
}

module.exports = {
  createMobileRuntimeFileHelperService,
};
