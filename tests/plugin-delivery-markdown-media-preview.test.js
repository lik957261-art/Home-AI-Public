"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArtifactTextRegistrationService } = require("../adapters/artifact-text-registration-service");
const { createFileArtifactResolverService } = require("../adapters/file-artifact-resolver-service");
const { mimeFor } = require("../adapters/file-resource-service");
const { createPathPolicyProvider } = require("../adapters/path-policy-provider");
const { createFileArtifactApiRoutes } = require("../server-routes/file-artifact-api-routes");

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

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

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

async function request(routes, targetPath, auth = { workspaceId: "owner" }) {
  const res = makeResponse();
  const url = new URL(targetPath, "http://localhost");
  await routes.handle({ method: "GET", url: targetPath }, res, url, { auth });
  return { res, body: parseBody(res) };
}

function parseMediaPaths(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("MEDIA:"))
    .map((line) => line.slice("MEDIA:".length).trim())
    .filter(Boolean);
}

function contentDisposition(disposition, name) {
  return `${disposition}; filename="${String(name || "file").replace(/"/g, "_")}"`;
}

async function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-delivery-media-"));
  try {
    const workspaceRoot = path.join(tmpRoot, "drive", "owner");
    const projectRoot = path.join(workspaceRoot, "ordinary-project");
    const deliveryRoot = path.join(workspaceRoot, "plugins", "wardrobe-delivery");
    const adjacentRoot = path.join(workspaceRoot, "plugins");
    const asciiPath = path.join(deliveryRoot, "wardrobe-receipt.md");
    const chinesePath = path.join(deliveryRoot, "穿搭回执.md");
    const outsidePath = path.join(tmpRoot, "outside.md");
    const traversalPath = path.join(adjacentRoot, "blocked.md");
    for (const filePath of [asciiPath, chinesePath, outsidePath, traversalPath]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(asciiPath, "# Wardrobe Receipt\n\nok\n", "utf8");
    fs.writeFileSync(chinesePath, "# 穿搭回执\n\nok\n", "utf8");
    fs.writeFileSync(outsidePath, "# Outside\n", "utf8");
    fs.writeFileSync(traversalPath, "# Blocked\n", "utf8");

    const state = {
      artifacts: [],
      threads: [{
        id: "thread-wardrobe",
        workspaceId: "owner",
        projectId: "owner-root",
        subprojectId: "",
        policy: {
          principal_id: "owner-workspace",
          allowed_roots: [projectRoot],
          delivery_roots: [deliveryRoot],
          cache_roots: [],
        },
        messages: [{ id: "assistant-1" }],
      }],
    };
    const thread = state.threads[0];
    const pathPolicyProvider = createPathPolicyProvider({
      normalizeLocalPath: (value) => path.resolve(String(value || "")),
      isProtectedPath: (value) => String(value || "").includes("secret"),
      isGloballyAllowedPath: () => false,
      uploadRootsForThread: () => [],
      policyForThread: (item) => item?.policy || {},
      ownerRootsForThread: () => [],
    });
    const isPathAllowedForThread = (item, localPath, originalPath = "") => (
      pathPolicyProvider.canReadForThread(item, localPath, originalPath).allowed
    );
    let idCounter = 0;
    const registration = createArtifactTextRegistrationService({
      state: () => state,
      extractArtifactPaths: parseMediaPaths,
      normalizeLocalPath: (value) => path.resolve(String(value || "")),
      isPathAllowedForThread,
      mimeFor,
      makeId(prefix) {
        idCounter += 1;
        return `${prefix}_${idCounter}`;
      },
      nowIso: () => "2026-07-09T02:00:00.000Z",
    });
    const registered = registration.registerArtifactsFromText(
      thread,
      { id: "assistant-1" },
      `done\nMEDIA:${asciiPath}\nMEDIA:${chinesePath}\nMEDIA:${outsidePath}`,
    );
    assert.deepEqual(registered.map((artifact) => artifact.name), [
      "wardrobe-receipt.md",
      "穿搭回执.md",
    ]);
    assert.equal(state.artifacts.length, 2);

    state.artifacts.push({
      id: "outside",
      path: outsidePath,
      displayPath: outsidePath,
      name: "outside.md",
      mime: "text/markdown; charset=utf-8",
      threadId: thread.id,
      messageId: "assistant-1",
      workspaceId: "owner",
    }, {
      id: "traversal",
      path: path.join(deliveryRoot, "..", "blocked.md"),
      displayPath: path.join(deliveryRoot, "..", "blocked.md"),
      name: "blocked.md",
      mime: "text/markdown; charset=utf-8",
      threadId: thread.id,
      messageId: "assistant-1",
      workspaceId: "owner",
    });

    const resolver = createFileArtifactResolverService({
      state: () => state,
      fs,
      path,
      normalizeLocalPath: (value) => path.resolve(String(value || "")),
      resolveBrowserPath(item, query) {
        const rawPath = String(query.get("path") || "");
        if (!rawPath) return null;
        const localPath = path.resolve(rawPath);
        if (!fs.existsSync(localPath)) return null;
        if (!isPathAllowedForThread(item, localPath, rawPath)) return null;
        return { localPath, displayPath: rawPath, workspacePath: `Wardrobe/${path.basename(localPath)}` };
      },
      logicalUserPathFallback: (_value, label) => `Wardrobe/${label}`,
      logicalDirectoryDisplayPath: (_thread, _value, label) => `Wardrobe/${label}`,
      mimeFor,
      authCanAccessWorkspace: (auth, workspaceId) => auth?.workspaceId === workspaceId,
      artifactAccessibleToAuth: (auth, item) => auth?.workspaceId === item.workspaceId,
      isPathAllowedForThread,
      isPathAllowed: () => false,
      isOwnerAuth: (auth) => auth?.workspaceId === "owner",
    });
    const routes = createFileArtifactApiRoutes({
      contentDisposition,
      extractDocxText: () => ({ text: "", totalChars: 0, truncated: false }),
      mimeFor,
      resolveArtifactForRequest: (...args) => resolver.resolveArtifactForRequest(...args),
      resolveFileForBrowserRequest: (...args) => resolver.resolveFileForBrowserRequest(...args),
      sendJson,
      textFilePreview(filePath) {
        const text = fs.readFileSync(filePath, "utf8");
        return { text, totalChars: text.length, truncated: false };
      },
    });

    const ascii = await request(routes, `/api/files/preview?artifactId=${encodeURIComponent(registered[0].id)}`);
    assert.equal(ascii.res.statusCode, 200);
    assert.equal(ascii.body.name, "wardrobe-receipt.md");
    assert.match(ascii.body.text, /Wardrobe Receipt/);
    assert.doesNotMatch(ascii.body.path, new RegExp(tmpRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const chinese = await request(routes, `/api/files/preview?artifactId=${encodeURIComponent(registered[1].id)}`);
    assert.equal(chinese.res.statusCode, 200);
    assert.equal(chinese.body.name, "穿搭回执.md");
    assert.match(chinese.body.text, /穿搭回执/);

    const direct = await request(routes, `/api/files/preview?threadId=${encodeURIComponent(thread.id)}&path=${encodeURIComponent(chinesePath)}`);
    assert.equal(direct.res.statusCode, 200);
    assert.equal(direct.body.path, "Wardrobe/穿搭回执.md");

    const unauthorized = await request(routes, `/api/files/preview?artifactId=${encodeURIComponent(registered[0].id)}`, { workspaceId: "guest" });
    assert.equal(unauthorized.res.statusCode, 404);
    assert.equal(unauthorized.body.error, "Artifact not found");

    const outside = await request(routes, "/api/files/preview?artifactId=outside");
    assert.equal(outside.res.statusCode, 404);
    assert.equal(outside.body.error, "Artifact not found");

    const traversal = await request(routes, "/api/files/preview?artifactId=traversal");
    assert.equal(traversal.res.statusCode, 404);
    assert.equal(traversal.body.error, "Artifact not found");
  } finally {
    if (tmpRoot.startsWith(os.tmpdir())) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

run()
  .then(() => {
    console.log("plugin delivery markdown media preview tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
