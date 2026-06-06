"use strict";

function createMobileRuntimeFileHelperService(options = {}) {
  const fs = options.fs || require("node:fs");
  const path = options.path || require("node:path");
  const httpRuntimeService = options.httpRuntimeService;
  const documentPreviewService = options.documentPreviewService;
  const bootTrace = typeof options.bootTrace === "function" ? options.bootTrace : () => {};
  const isUncPath = typeof options.isUncPath === "function" ? options.isUncPath : (value) => /^\\\\/.test(String(value || ""));

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

  return {
    contentDisposition,
    extractDocxText,
    mimeFor,
    readJsonFirst,
    serveStatic,
    textBufferPreview,
    textFilePreview,
  };
}

module.exports = {
  createMobileRuntimeFileHelperService,
};
