"use strict";

const assert = require("node:assert/strict");
const {
  FILE_ARTIFACT_API_ROUTE_SPECS,
  createFileArtifactApiRoutes,
} = require("../server-routes/file-artifact-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    artifacts: [],
    contentDisposition: [],
    files: [],
    preview: [],
    streams: [],
  };
  const files = {
    "/readme.md": {
      localPath: "/safe/readme.md",
      name: "readme.md",
      mime: "text/markdown",
      size: 42,
      updatedAt: "2026-05-14T00:00:00.000Z",
      displayPath: "Project/readme.md",
    },
    "/image.png": {
      localPath: "/safe/image.png",
      name: "image.png",
      mime: "image/png",
      size: 12,
      updatedAt: "2026-05-14T00:00:00.000Z",
      displayPath: "Project/image.png",
    },
  };
  const artifacts = {
    "artifact-1": {
      localPath: "/safe/artifact.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    },
  };
  const deps = Object.assign({
    contentDisposition(disposition, name) {
      calls.contentDisposition.push({ disposition, name });
      return `${disposition}; filename="${name}"`;
    },
    createReadStream(localPath) {
      calls.streams.push(localPath);
      return {
        pipe(res) {
          res.end(`stream:${localPath}`);
        },
      };
    },
    extractDocxText(localPath) {
      calls.preview.push({ type: "docx", localPath });
      return { text: "docx text", totalChars: 9, truncated: false };
    },
    mimeFor(localPath) {
      return localPath.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
    },
    resolveArtifactForRequest(artifactId, auth) {
      calls.artifacts.push({ artifactId, auth });
      if (artifactId === "denied") return { status: 404, error: "Artifact not found" };
      return { artifact: artifacts[artifactId] || null, status: artifacts[artifactId] ? 200 : 404 };
    },
    resolveFileForBrowserRequest(searchParams, auth) {
      const source = searchParams.get("path") || searchParams.get("source") || "";
      calls.files.push({ source, auth });
      if (source === "denied") return { status: 403, error: "File not allowed" };
      return { file: files[source] || null, status: files[source] ? 200 : 404 };
    },
    sendJson,
    statSync(localPath) {
      return { size: localPath.endsWith(".pdf") ? 128 : 64 };
    },
    textFilePreview(localPath) {
      calls.preview.push({ type: "text", localPath });
      return { text: "markdown text", totalChars: 13, truncated: false };
    },
  }, overrides);
  return { routes: createFileArtifactApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const context = Object.hasOwn(options, "auth") ? { auth: options.auth } : undefined;
  const result = await routes.handle(
    { method, url: path },
    res,
    makeUrl(path),
    context,
  );
  const contentType = String(res.headers["Content-Type"] || "");
  const body = contentType.startsWith("application/json") && res.body ? parseBody(res) : null;
  return { result, res, body };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(FILE_ARTIFACT_API_ROUTE_SPECS.map((route) => route.id), [
    "files-preview",
    "files-read",
    "artifact-read",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/files/preview" }).id, "files-preview");
  assert.equal(routes.match({ method: "GET", path: "/api/files" }).id, "files-read");
  assert.equal(routes.match({ method: "GET", path: "/api/artifacts/artifact-1" }).id, "artifact-read");
  assert.equal(routes.match({ method: "POST", path: "/api/files" }), null);
  assert.equal(routes.summary({ public: true }).byModule.file, 2);
  assert.equal(routes.summary({ public: true }).byModule.artifact, 1);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testFilePreviewUsesResolverAndPreviewers() {
  const { routes, calls } = makeRoutes();
  const auth = { ok: true, workspaceId: "owner" };
  const got = await request(routes, "GET", "/api/files/preview?path=%2Freadme.md", { auth });

  assert.equal(got.result.handled, true);
  assert.deepEqual(got.result.auth, auth);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.files, [{ source: "/readme.md", auth }]);
  assert.deepEqual(calls.preview, [{ type: "text", localPath: "/safe/readme.md" }]);
  assert.deepEqual(got.body, {
    name: "readme.md",
    mime: "text/markdown",
    size: 42,
    updatedAt: "2026-05-14T00:00:00.000Z",
    path: "Project/readme.md",
    text: "markdown text",
    totalChars: 13,
    truncated: false,
  });
}

async function testFilePreviewDenialAndUnsupportedType() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "GET", "/api/files/preview?path=denied");
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "File not allowed" });

  const unsupported = await request(routes, "GET", "/api/files/preview?path=%2Fimage.png");
  assert.equal(unsupported.res.statusCode, 415);
  assert.deepEqual(unsupported.body, {
    error: "Preview is not supported for this file type",
    name: "image.png",
    mime: "image/png",
  });
}

async function testFileReadStreamsAuthorizedFile() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/files?path=%2Freadme.md&download=1");

  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.res.body, "stream:/safe/readme.md");
  assert.deepEqual(calls.streams, ["/safe/readme.md"]);
  assert.deepEqual(calls.contentDisposition, [{ disposition: "attachment", name: "readme.md" }]);
  assert.equal(got.res.headers["Content-Type"], "text/markdown");
  assert.equal(got.res.headers["Content-Length"], 42);
}

async function testArtifactReadUsesArtifactResolver() {
  const { routes, calls } = makeRoutes();
  const auth = { ok: true, workspaceId: "child" };
  const got = await request(routes, "GET", "/api/artifacts/artifact-1", { auth });

  assert.equal(got.result.handled, true);
  assert.deepEqual(calls.artifacts, [{ artifactId: "artifact-1", auth }]);
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.res.body, "stream:/safe/artifact.pdf");
  assert.equal(got.res.headers["Content-Length"], 128);
  assert.deepEqual(calls.contentDisposition, [{ disposition: "inline", name: "report.pdf" }]);

  const denied = await request(routes, "GET", "/api/artifacts/denied");
  assert.equal(denied.res.statusCode, 404);
  assert.deepEqual(denied.body, { error: "Artifact not found" });
}

async function testDependencyValidation() {
  assert.throws(
    () => createFileArtifactApiRoutes({}),
    /file artifact api routes require contentDisposition/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testFilePreviewUsesResolverAndPreviewers();
  await testFilePreviewDenialAndUnsupportedType();
  await testFileReadStreamsAuthorizedFile();
  await testArtifactReadUsesArtifactResolver();
  await testDependencyValidation();
  console.log("file artifact api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
