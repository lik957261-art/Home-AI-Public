"use strict";

const assert = require("node:assert/strict");
const { bridgeFileBuffer, createFileResponseService } = require("../adapters/file-response-service");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const service = createFileResponseService({
  fs: {
    createReadStream(filePath) {
      return {
        pipe(res) {
          res.end(`stream:${filePath}`);
        },
      };
    },
  },
  mimeFor(filePath) {
    return filePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/octet-stream";
  },
  contentDisposition(disposition, filename) {
    return `${disposition}; filename="${filename}"`;
  },
  extractDocxText(filePath) {
    return { text: `docx:${filePath}`, totalChars: 9, truncated: false };
  },
  textFilePreview(filePath) {
    return { text: `text:${filePath}`, totalChars: 8, truncated: false };
  },
  textBufferPreview(buffer) {
    return { text: buffer.toString("utf8"), totalChars: buffer.length, truncated: false };
  },
  sendJson,
});

{
  assert.equal(bridgeFileBuffer({ contentBase64: Buffer.from("hello").toString("base64") }).toString("utf8"), "hello");
}

{
  const res = makeResponse();
  service.sendResolvedFile(res, {
    localPath: "C:\\tmp\\report.md",
    mime: "",
    name: "report.md",
    size: 42,
  }, new URLSearchParams({ download: "1" }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/markdown; charset=utf-8");
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="report.md"');
  assert.equal(res.body, "stream:C:\\tmp\\report.md");
}

{
  const res = makeResponse();
  service.sendResolvedBridgeFile(res, {
    contentBase64: Buffer.from("bridge").toString("base64"),
    mime: "text/plain; charset=utf-8",
    name: "out.txt",
  }, new URLSearchParams());
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Length"], 6);
  assert.equal(res.body.toString("utf8"), "bridge");
}

{
  const res = makeResponse();
  service.sendResolvedFilePreview(res, {
    localPath: "C:\\tmp\\report.md",
    mime: "text/markdown; charset=utf-8",
    name: "report.md",
    size: 42,
    updatedAt: "now",
    displayPath: "report.md",
  });
  assert.deepEqual(JSON.parse(res.body), {
    name: "report.md",
    mime: "text/markdown; charset=utf-8",
    size: 42,
    updatedAt: "now",
    path: "report.md",
    text: "text:C:\\tmp\\report.md",
    totalChars: 8,
    truncated: false,
  });
}

{
  const res = makeResponse();
  service.sendResolvedBridgeFilePreview(res, {
    contentBase64: Buffer.from("preview").toString("base64"),
    mime: "text/plain; charset=utf-8",
    name: "out.txt",
    displayPath: "out.txt",
  });
  assert.equal(JSON.parse(res.body).text, "preview");
}

console.log("file-response-service tests passed");
