"use strict";

const { extractArtifactPaths: defaultExtractArtifactPaths } = require("./file-resource-service");

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function defaultDateStringFromTaskLike(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return defaultDateStringFromTaskLike(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function createKanbanOutputProjectionService(options = {}) {
  const resolveKanbanOutputFile = typeof options.resolveKanbanOutputFile === "function"
    ? options.resolveKanbanOutputFile
    : () => ({ status: 404, error: "File not found" });
  const extractArtifactPaths = typeof options.extractArtifactPaths === "function"
    ? options.extractArtifactPaths
    : defaultExtractArtifactPaths;
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const dateStringFromTaskLike = typeof options.dateStringFromTaskLike === "function"
    ? options.dateStringFromTaskLike
    : defaultDateStringFromTaskLike;

  function publicKanbanOutputFile(workspaceId, rawPath) {
    const resolved = resolveKanbanOutputFile(workspaceId, rawPath, null);
    if (!resolved.file) return null;
    const params = new URLSearchParams({ workspaceId: String(workspaceId || "owner"), path: String(rawPath || "") });
    return {
      name: resolved.file.name,
      path: String(rawPath || ""),
      displayPath: resolved.file.displayPath,
      mime: resolved.file.mime,
      size: resolved.file.size,
      updatedAt: resolved.file.updatedAt,
      url: `/api/kanban/cards/output?${params.toString()}`,
    };
  }

  function publicKanbanCoverFile(workspaceId, rawCover) {
    const cover = rawCover && typeof rawCover === "object" && !Array.isArray(rawCover)
      ? rawCover
      : { path: String(rawCover || "") };
    const coverPath = String(cover.path || "").trim();
    if (!coverPath) return null;
    const file = publicKanbanOutputFile(workspaceId, coverPath);
    if (!file) return null;
    return Object.assign({}, file, {
      role: "cover",
      name: cover.name || file.name,
      mime: cover.mime || file.mime,
      size: Number(cover.size || file.size || 0) || 0,
    });
  }

  function publicKanbanOutputsFromText(workspaceId, text) {
    const workspace = String(workspaceId || "").trim();
    if (!workspace) return [];
    return extractArtifactPaths(text)
      .map((item) => publicKanbanOutputFile(workspace, item))
      .filter(Boolean)
      .slice(0, 12);
  }

  function eventPreviewText(event) {
    if (!event || typeof event !== "object") return "";
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    return compactText(payload.note || payload.summary || payload.error || event.message || event.kind || "", 360);
  }

  function publicKanbanCardDetail(workspaceId, detail = {}) {
    const runs = Array.isArray(detail.runs) ? detail.runs : [];
    const events = Array.isArray(detail.events) ? detail.events : [];
    const comments = Array.isArray(detail.comments) ? detail.comments : [];
    const latestRun = [...runs].reverse().find((run) => run && (run.summary || run.metadata));
    const summary = compactText(
      detail.latest_summary
      || detail.latestSummary
      || detail.task?.result
      || latestRun?.summary
      || "",
      4000,
    );
    const outputPaths = new Set();
    for (const run of runs) {
      const outputs = run?.metadata?.outputs;
      if (Array.isArray(outputs)) outputs.forEach((item) => outputPaths.add(String(item || "")));
    }
    for (const comment of comments) {
      const commentText = [comment?.text, comment?.body, comment?.comment].filter(Boolean).join("\n");
      for (const pathText of extractArtifactPaths(commentText)) outputPaths.add(pathText);
    }
    for (const pathText of extractArtifactPaths(summary)) outputPaths.add(pathText);
    for (const pathText of extractArtifactPaths(detail.log || "")) outputPaths.add(pathText);
    const outputs = [...outputPaths].map((item) => publicKanbanOutputFile(workspaceId, item)).filter(Boolean);
    return {
      summary,
      outputs,
      comments: comments.slice(-12).map((comment) => ({
        author: String(comment.author || comment.created_by || ""),
        text: compactText(comment.text || comment.body || comment.comment || "", 800),
        createdAt: dateStringFromTaskLike(comment.created_at || comment.createdAt || ""),
      })),
      events: events.slice(-20).map((event) => ({
        kind: String(event.kind || ""),
        preview: eventPreviewText(event),
        createdAt: dateStringFromTaskLike(event.created_at || event.createdAt || ""),
      })).filter((event) => event.kind || event.preview),
      runs: runs.slice(-8).map((run) => ({
        id: String(run.id || ""),
        profile: String(run.profile || ""),
        status: String(run.status || ""),
        outcome: String(run.outcome || ""),
        summary: compactText(run.summary || "", 1200),
        startedAt: dateStringFromTaskLike(run.started_at || run.startedAt || ""),
        endedAt: dateStringFromTaskLike(run.ended_at || run.endedAt || ""),
      })),
      logTail: compactText(detail.log || "", 4000),
    };
  }

  return Object.freeze({
    eventPreviewText,
    publicKanbanCardDetail,
    publicKanbanCoverFile,
    publicKanbanOutputFile,
    publicKanbanOutputsFromText,
  });
}

module.exports = {
  createKanbanOutputProjectionService,
  defaultCompactText,
  defaultDateStringFromTaskLike,
};
