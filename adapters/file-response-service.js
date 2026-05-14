"use strict";

const fs = require("node:fs");
const path = require("node:path");

function downloadDisposition(query) {
  return /^(1|true|yes|on)$/i.test(String(query?.get?.("download") || ""))
    ? "attachment"
    : "inline";
}

function bridgeFileBuffer(file) {
  return Buffer.from(String(file?.contentBase64 || ""), "base64");
}

function createFileResponseService(options = {}) {
  const deps = Object.assign({
    fs,
    path,
    mimeFor: () => "application/octet-stream",
    contentDisposition: (disposition, filename) => `${disposition}; filename="${filename}"`,
    extractDocxText: () => ({ text: "", totalChars: 0, truncated: false }),
    textFilePreview: () => ({ text: "", totalChars: 0, truncated: false }),
    textBufferPreview: () => ({ text: "", totalChars: 0, truncated: false }),
    sendJson: (res, status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
  }, options);

  function sendResolvedFile(res, file, query) {
    const localPath = file.localPath || file.path;
    const disposition = downloadDisposition(query);
    res.writeHead(200, {
      "Content-Type": file.mime || deps.mimeFor(localPath),
      "Content-Length": file.size,
      "Content-Disposition": deps.contentDisposition(disposition, file.name || deps.path.basename(localPath)),
      "Cache-Control": "private, max-age=60",
    });
    deps.fs.createReadStream(localPath).pipe(res);
  }

  function sendResolvedBridgeFile(res, file, query) {
    const buffer = bridgeFileBuffer(file);
    const disposition = downloadDisposition(query);
    res.writeHead(200, {
      "Content-Type": file.mime || deps.mimeFor(file.name || file.displayPath || ""),
      "Content-Length": buffer.length,
      "Content-Disposition": deps.contentDisposition(disposition, file.name || deps.path.basename(file.displayPath || "automation-deliverable")),
      "Cache-Control": "private, max-age=60",
    });
    res.end(buffer);
  }

  function sendResolvedFilePreview(res, file) {
    const ext = deps.path.extname(file.localPath).toLowerCase();
    try {
      let preview;
      if (ext === ".docx") preview = deps.extractDocxText(file.localPath);
      else if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime)) preview = deps.textFilePreview(file.localPath);
      else {
        deps.sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
        return;
      }
      deps.sendJson(res, 200, {
        name: file.name,
        mime: file.mime,
        size: file.size,
        updatedAt: file.updatedAt,
        path: file.displayPath,
        text: preview.text,
        totalChars: preview.totalChars,
        truncated: preview.truncated,
      });
    } catch (err) {
      deps.sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
    }
  }

  function sendResolvedBridgeFilePreview(res, file) {
    const ext = deps.path.extname(file.name || file.displayPath || "").toLowerCase();
    try {
      const buffer = bridgeFileBuffer(file);
      let preview;
      if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime || "")) {
        preview = deps.textBufferPreview(buffer);
      } else {
        deps.sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
        return;
      }
      deps.sendJson(res, 200, {
        name: file.name,
        mime: file.mime,
        size: file.size || buffer.length,
        updatedAt: file.updatedAt,
        path: file.displayPath,
        text: preview.text,
        totalChars: preview.totalChars,
        truncated: preview.truncated,
      });
    } catch (err) {
      deps.sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
    }
  }

  return Object.freeze({
    bridgeFileBuffer,
    sendResolvedFile,
    sendResolvedBridgeFile,
    sendResolvedFilePreview,
    sendResolvedBridgeFilePreview,
  });
}

module.exports = {
  bridgeFileBuffer,
  createFileResponseService,
};
