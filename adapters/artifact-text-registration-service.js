"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function defaultState() {
  return { artifacts: [], threads: [] };
}

function dedupeStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function createArtifactTextRegistrationService(options = {}) {
  const deps = Object.assign({
    crypto,
    fs,
    path,
    state: defaultState,
    sourceMarkdownSearchCache: new Map(),
    sourceMarkdownSearchLimit: 2000,
    extractArtifactPaths: () => [],
    normalizeLocalPath: (value) => String(value || ""),
    isPathAllowedForThread: () => false,
    findProject: () => null,
    findSubproject: () => null,
    effectiveProjectForThread: () => null,
    dedupe: dedupeStrings,
    mimeFor: () => "application/octet-stream",
    makeId: (prefix) => `${prefix}-${Date.now()}`,
    nowIso: () => new Date().toISOString(),
  }, options);

  function currentState() {
    return typeof deps.state === "function" ? deps.state() : deps.state;
  }

  function samePath(a, b) {
    return deps.path.resolve(String(a || "")).toLowerCase() === deps.path.resolve(String(b || "")).toLowerCase();
  }

  function compactArtifactForMessage(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.id || "");
    const stored = id ? (currentState().artifacts || []).find((item) => item.id === id) : null;
    return {
      id: id || stored?.id || "",
      name: value.name || stored?.name || id || "document",
      mime: value.mime || stored?.mime || "",
      size: value.size || stored?.size || 0,
      url: value.url || (stored?.id ? `/api/artifacts/${encodeURIComponent(stored.id)}` : ""),
      path: value.path || stored?.path || "",
    };
  }

  function compactArtifactPathKey(value) {
    const localPath = deps.normalizeLocalPath(value);
    if (!localPath) return "";
    return deps.path.resolve(localPath).toLowerCase();
  }

  function compactArtifactStemKey(value) {
    return deps.path.basename(String(value || "")).replace(/\.[^.]+$/, "").toLowerCase();
  }

  function publicMarkdownPreviewArtifact(thread, rawPath, baseId = "") {
    if (!thread) return null;
    const displayPath = String(rawPath || "").trim();
    const localPath = deps.normalizeLocalPath(displayPath);
    if (!localPath || deps.path.extname(localPath).toLowerCase() !== ".md") return null;
    let stat;
    try {
      stat = deps.fs.statSync(localPath);
    } catch (_) {
      return null;
    }
    if (!stat.isFile() || !deps.isPathAllowedForThread(thread, localPath, displayPath || localPath)) return null;
    const name = deps.path.basename(localPath);
    const params = new URLSearchParams({ threadId: thread.id, path: displayPath || localPath });
    return {
      id: `source_md_${deps.crypto.createHash("sha1").update(`${baseId}\0${localPath}`).digest("hex").slice(0, 16)}`,
      name,
      mime: deps.mimeFor(localPath),
      size: stat.size,
      url: `/api/files?${params.toString()}`,
      path: localPath,
      source: "source-markdown",
    };
  }

  function sourceMarkdownSearchRoots(thread) {
    if (!thread) return [];
    const roots = [];
    const project = deps.findProject(thread.workspaceId, thread.projectId);
    const subproject = deps.findSubproject(project, thread.subprojectId);
    if (subproject?.root) roots.push(subproject.root);
    if (project?.root) roots.push(project.root);
    const effectiveProject = deps.effectiveProjectForThread(thread);
    if (effectiveProject?.root) roots.push(effectiveProject.root);
    return deps.dedupe(roots.map(deps.normalizeLocalPath).filter((root) => root && deps.fs.existsSync(root)));
  }

  function findMarkdownByStemUnderRoot(root, stem) {
    const target = String(stem || "").toLowerCase();
    if (!target || !root || !deps.fs.existsSync(root)) return "";
    const queue = [root];
    let scanned = 0;
    let best = null;
    while (queue.length && scanned < deps.sourceMarkdownSearchLimit) {
      const dir = queue.shift();
      let entries;
      try {
        entries = deps.fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        continue;
      }
      for (const entry of entries) {
        if (scanned >= deps.sourceMarkdownSearchLimit) break;
        if (!entry.name || entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const entryPath = deps.path.join(dir, entry.name);
        scanned += 1;
        if (entry.isDirectory()) {
          queue.push(entryPath);
          continue;
        }
        if (!entry.isFile() || deps.path.extname(entry.name).toLowerCase() !== ".md") continue;
        if (compactArtifactStemKey(entry.name) !== target) continue;
        let stat;
        try {
          stat = deps.fs.statSync(entryPath);
        } catch (_) {
          continue;
        }
        if (!best || stat.mtimeMs > best.mtimeMs) best = { path: entryPath, mtimeMs: stat.mtimeMs };
      }
    }
    return best?.path || "";
  }

  function findSourceMarkdownForArtifact(thread, value) {
    const stem = compactArtifactStemKey(value?.name || value?.path || "");
    if (!thread || !stem) return "";
    const key = [thread.workspaceId, thread.projectId, thread.subprojectId || "", stem].join("\0");
    if (deps.sourceMarkdownSearchCache.has(key)) return deps.sourceMarkdownSearchCache.get(key) || "";
    let found = "";
    for (const root of sourceMarkdownSearchRoots(thread)) {
      found = findMarkdownByStemUnderRoot(root, stem);
      if (found) break;
    }
    if (found) deps.sourceMarkdownSearchCache.set(key, found);
    return found || "";
  }

  function companionMarkdownPathForArtifact(thread, value) {
    if (!value || typeof value !== "object") return "";
    const kind = deps.mimeFor(value.path || value.name || "");
    const name = String(value.name || value.path || "");
    const ext = deps.path.extname(name).toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(ext) && !/(pdf|word|officedocument)/i.test(kind)) return "";
    const localPath = deps.normalizeLocalPath(value.path || "");
    if (!localPath) return "";
    const parsed = deps.path.parse(localPath);
    const candidate = deps.path.join(parsed.dir, `${parsed.name}.md`);
    if (deps.fs.existsSync(candidate)) return candidate;
    return findSourceMarkdownForArtifact(thread, value);
  }

  function findThreadForMessage(message) {
    const messageId = String(message?.id || "");
    if (!messageId) return null;
    return (currentState().threads || []).find((thread) => (thread.messages || []).some((item) => item?.id === messageId)) || null;
  }

  function compactArtifactsForMessage(message, thread = null) {
    const baseArtifacts = Array.isArray(message?.artifacts) ? message.artifacts.map(compactArtifactForMessage).filter(Boolean) : [];
    const resolvedThread = thread || findThreadForMessage(message);
    if (!resolvedThread) return baseArtifacts;

    const seenPaths = new Set(baseArtifacts.map((artifact) => compactArtifactPathKey(artifact.path)).filter(Boolean));
    const seenMarkdownStems = new Set(baseArtifacts
      .filter((artifact) => deps.path.extname(artifact.name || artifact.path || "").toLowerCase() === ".md")
      .map((artifact) => compactArtifactStemKey(artifact.name || artifact.path))
      .filter(Boolean));
    const markdownArtifacts = [];
    const addMarkdown = (rawPath, baseId = "") => {
      const artifact = publicMarkdownPreviewArtifact(resolvedThread, rawPath, baseId);
      if (!artifact) return;
      const pathKey = compactArtifactPathKey(artifact.path);
      const stemKey = compactArtifactStemKey(artifact.name || artifact.path);
      if ((pathKey && seenPaths.has(pathKey)) || (stemKey && seenMarkdownStems.has(stemKey))) return;
      if (pathKey) seenPaths.add(pathKey);
      if (stemKey) seenMarkdownStems.add(stemKey);
      markdownArtifacts.push(artifact);
    };

    for (const rawPath of deps.extractArtifactPaths(message?.content || "")) {
      if (deps.path.extname(deps.normalizeLocalPath(rawPath) || rawPath).toLowerCase() === ".md") {
        addMarkdown(rawPath, message.id || "");
      }
    }
    for (const artifact of baseArtifacts) {
      const candidate = companionMarkdownPathForArtifact(resolvedThread, artifact);
      if (candidate) addMarkdown(candidate, artifact.id || message.id || "");
    }
    return [...markdownArtifacts, ...baseArtifacts];
  }

  function registerArtifactsFromText(thread, message, text) {
    const paths = deps.extractArtifactPaths(text);
    const artifacts = [];
    for (const rawPath of paths) {
      const localPath = deps.normalizeLocalPath(rawPath);
      if (!localPath || !deps.fs.existsSync(localPath) || !deps.isPathAllowedForThread(thread, localPath, rawPath)) continue;
      const state = currentState();
      const existing = (state.artifacts || []).find((item) => samePath(item.path, localPath) || samePath(item.displayPath, rawPath));
      const stat = deps.fs.statSync(localPath);
      const artifact = existing || {
        id: deps.makeId("artifact"),
        path: localPath,
        displayPath: String(rawPath || localPath),
        name: deps.path.basename(localPath),
        mime: deps.mimeFor(localPath),
        size: stat.size,
        createdAt: deps.nowIso(),
        workspaceId: thread.workspaceId,
        projectId: thread.projectId,
        subprojectId: thread.subprojectId || "",
        threadId: thread.id,
        messageId: message.id,
      };
      artifact.size = stat.size;
      artifact.threadId = thread.id;
      artifact.messageId = message.id;
      artifact.updatedAt = deps.nowIso();
      if (!existing) state.artifacts.push(artifact);
      artifacts.push({
        id: artifact.id,
        name: artifact.name,
        mime: artifact.mime,
        size: artifact.size,
        url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
      });
    }
    return artifacts;
  }

  return Object.freeze({
    samePath,
    compactArtifactForMessage,
    compactArtifactPathKey,
    compactArtifactStemKey,
    publicMarkdownPreviewArtifact,
    sourceMarkdownSearchRoots,
    findMarkdownByStemUnderRoot,
    findSourceMarkdownForArtifact,
    companionMarkdownPathForArtifact,
    findThreadForMessage,
    compactArtifactsForMessage,
    registerArtifactsFromText,
  });
}

module.exports = {
  createArtifactTextRegistrationService,
};
