"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  canonicalNoteWorkspaceId,
  noteWorkspaceConfigPath,
  noteWorkspaceKeyPath,
} = require("./note-plugin-provisioning-service");

const MAX_NOTE_RECEIPT_ATTACHMENTS = 8;
const MAX_NOTE_RECEIPT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const DEFAULT_NOTE_RECEIPT_TIMEOUT_MS = 30000;
const DEFAULT_NOTE_RECEIPT_TAG = "hermes-receipt";
const NOTE_RECEIPT_DEDUPE_VERSION = 1;
const MAX_NOTE_RECEIPT_QUESTION_CHARS = 4000;
const PLUGIN_NOTE_RECEIPT_TAGS = Object.freeze({
  wardrobe: "\u8863\u6a71",
  finance: "\u8bb0\u8d26",
  email: "\u90ae\u7bb1",
  health: "\u5065\u5eb7",
  note: "\u7b14\u8bb0",
  "codex-mobile": "Codex",
});
const NOTE_RECEIPT_METADATA_COMMENT_RE = /<!--\s*homeai-note(?:-[a-z]+)?[\s\S]*?-->/gi;

function stringValue(value) {
  return String(value || "").trim();
}

function sha256Hex(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function boundedError(value, fallback = "note_receipt_save_failed") {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function normalizePluginId(value) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function pluginIdFromTaskGroupId(taskGroupId = "") {
  const match = stringValue(taskGroupId).match(/^plugin:([a-z0-9_-]+)$/i);
  return match ? normalizePluginId(match[1]) : "";
}

function pluginReceiptTagForId(pluginId = "") {
  return PLUGIN_NOTE_RECEIPT_TAGS[normalizePluginId(pluginId)] || "";
}

function receiptPluginId(message = {}, thread = {}, input = {}) {
  const direct = normalizePluginId(input.pluginId || input.plugin_id || message.pluginId || message.plugin_id || thread.pluginId || thread.plugin_id);
  if (direct) return direct;

  const taskGroupCandidates = [
    message.taskGroupId,
    message.task_group_id,
    message.run?.taskGroupId,
    message.run?.task_group_id,
    thread.currentTaskGroupId,
    thread.current_task_group_id,
    thread.taskGroupId,
    thread.task_group_id,
  ];
  for (const candidate of taskGroupCandidates) {
    const pluginId = pluginIdFromTaskGroupId(candidate);
    if (pluginId) return pluginId;
  }

  const groupId = stringValue(message.taskGroupId || message.task_group_id);
  const meta = groupId && thread.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta[groupId] : null;
  return normalizePluginId(meta?.pluginId || meta?.plugin_id);
}

function receiptNoteTags(message = {}, thread = {}, input = {}) {
  const pluginTag = pluginReceiptTagForId(receiptPluginId(message, thread, input));
  return [pluginTag || DEFAULT_NOTE_RECEIPT_TAG];
}

function serviceError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function stripMarkdownForTitle(value = "") {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[`*_#>\[\]()+|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNoteReceiptTags(value = "") {
  const seen = new Set();
  return String(value || "")
    .split(/[,\uff0c\u3001;\uff1b\n]+/g)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 12);
}

function compactMetadataTitle(value = "") {
  const clean = stripMarkdownForTitle(value);
  if (!clean) return "";
  return compactReceiptTitle(clean, {
    maxCjkChars: 48,
    maxWords: 12,
    maxLatinChars: 96,
  });
}

function parseNoteReceiptMetadataLine(line = "", out = {}) {
  const match = String(line || "").trim().match(/^(title|tags?)\s*[:\uff1a]\s*(.+)$/i);
  if (!match) return out;
  const key = match[1].toLowerCase();
  const value = match[2].trim();
  if (key === "title" && !out.title) out.title = compactMetadataTitle(value);
  if ((key === "tag" || key === "tags") && !out.tags.length) out.tags = splitNoteReceiptTags(value);
  return out;
}

function extractNoteReceiptMetadata(text = "") {
  const source = String(text || "");
  const out = { title: "", tags: [] };
  const singleTitle = source.match(/<!--\s*homeai-note-title\s*[:\uff1a]\s*([\s\S]*?)-->/i);
  if (singleTitle) out.title = compactMetadataTitle(singleTitle[1]);
  const singleTags = source.match(/<!--\s*homeai-note-tags\s*[:\uff1a]\s*([\s\S]*?)-->/i);
  if (singleTags) out.tags = splitNoteReceiptTags(singleTags[1]);

  const blockRe = /<!--\s*homeai-note\b([\s\S]*?)-->/gi;
  let match;
  while ((match = blockRe.exec(source))) {
    const body = String(match[1] || "").trim();
    for (const line of body.split(/\r?\n/)) parseNoteReceiptMetadataLine(line, out);
  }
  return out;
}

function stripNoteReceiptMetadataComments(text = "") {
  return String(text || "").replace(NOTE_RECEIPT_METADATA_COMMENT_RE, "").trim();
}

function boundedNoteReceiptQuestionText(text = "") {
  const clean = stripNoteReceiptMetadataComments(text).trim();
  if (!clean) return "";
  const chars = Array.from(clean);
  if (chars.length <= MAX_NOTE_RECEIPT_QUESTION_CHARS) return clean;
  return `${chars.slice(0, MAX_NOTE_RECEIPT_QUESTION_CHARS).join("").trim()}\n\n[问题内容已截断]`;
}

function precedingUserMessageForReceipt(thread = {}, assistantMessage = {}) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const assistantId = stringValue(assistantMessage?.id);
  const assistantIndex = assistantId
    ? messages.findIndex((message) => stringValue(message?.id) === assistantId)
    : messages.indexOf(assistantMessage);
  const before = (assistantIndex >= 0 ? messages.slice(0, assistantIndex) : messages)
    .filter((message) => String(message?.role || "").trim() === "user");
  if (!before.length) return null;
  const taskGroupId = stringValue(assistantMessage?.taskGroupId || assistantMessage?.task_group_id);
  if (taskGroupId) {
    const sameGroup = [...before].reverse().find((message) => stringValue(message?.taskGroupId || message?.task_group_id) === taskGroupId);
    if (sameGroup) return sameGroup;
  }
  return before[before.length - 1] || null;
}

function summarizeReceiptTitleLegacy(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((raw) => ({ raw: String(raw || "").trim(), clean: stripMarkdownForTitle(raw) }))
    .filter(({ raw, clean }) => (
      clean
      && !/^[-•]/.test(raw)
      && !/^(attachments?|附件|来源|会话|时间)[:：]?/i.test(clean)
    ));
  const source = lines[0]?.clean || "Hermes 回执";
  const compact = source.replace(/\s+/g, "");
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(compact)) {
    const cjkTitle = Array.from(compact.replace(/[^\u3400-\u9fff\uf900-\ufaffA-Za-z0-9]/g, "")).slice(0, 10).join("");
    return cjkTitle || "Hermes回执";
  }
  const words = source.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return (words || "Hermes Receipt").slice(0, 40);
}

function receiptTitlePrefix(pluginId = "") {
  return pluginReceiptTagForId(pluginId);
}

function receiptTitleCandidateLines(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((raw) => ({ raw: String(raw || "").trim(), clean: stripMarkdownForTitle(raw) }))
    .filter(({ raw, clean }) => (
      clean
      && !/^[-*+\u2022\u00b7]\s*$/.test(raw)
      && !/^(attachments?|source|conversation|time|error|\u9644\u4ef6|\u6765\u6e90|\u4f1a\u8bdd|\u65f6\u95f4)[:\uff1a]?/i.test(clean)
      && !isLowSignalReceiptTitleLine(raw, clean)
    ));
}

function isLowSignalReceiptTitleLine(raw = "", clean = "") {
  const original = String(raw || "").trim();
  const text = String(clean || "").trim();
  if (!text) return true;
  if (/[\uff1a:]$/.test(original) && text.length <= 36) return true;
  return /^(按现在的状态|我的判断是|结论先说|先说结论|我查了一下|我看了一下|简单说|整体看|总体看|目前看|从现在的情况看)[\s\uff1a:，,。.!！?？]*$/i.test(text);
}

function compactReceiptTitle(value = "", options = {}) {
  const maxCjkChars = Math.max(8, Number(options.maxCjkChars || 34) || 34);
  const maxWords = Math.max(3, Number(options.maxWords || 9) || 9);
  const maxLatinChars = Math.max(24, Number(options.maxLatinChars || 80) || 80);
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(text)) {
    return Array.from(text).slice(0, maxCjkChars).join("").trim();
  }
  return text.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ").slice(0, maxLatinChars).trim();
}

function receiptTitleDate(value = "") {
  const raw = stringValue(value);
  if (!raw) return "";
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readableReceiptTitle(parts = {}) {
  const label = compactReceiptTitle(parts.label || "\u56de\u6267", {
    maxCjkChars: 8,
    maxWords: 3,
    maxLatinChars: 24,
  }) || "\u56de\u6267";
  const date = receiptTitleDate(parts.createdAt || parts.created_at || "");
  const summary = compactReceiptTitle(parts.summary || "", {
    maxCjkChars: 34,
    maxWords: 9,
    maxLatinChars: 80,
  }) || "Hermes Receipt";
  const values = [label, date, summary]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const deduped = [];
  for (const value of values) {
    if (deduped.some((existing) => value === existing || value.startsWith(`${existing} `))) continue;
    deduped.push(value);
  }
  return deduped.join(" | ");
}

function summarizeReceiptTitle(text = "", options = {}) {
  const metadataTitle = compactMetadataTitle(options.noteTitle || options.note_title || "");
  if (metadataTitle) return metadataTitle;
  const heading = String(text || "")
    .split(/\r?\n/)
    .map((raw) => String(raw || "").trim().match(/^#{1,4}\s+(.+)$/))
    .find(Boolean);
  const candidates = receiptTitleCandidateLines(text);
  const source = stripMarkdownForTitle(heading?.[1] || "")
    || candidates[0]?.clean
    || stripMarkdownForTitle(options.threadTitle || "")
    || "Hermes Receipt";
  return readableReceiptTitle({
    label: receiptTitlePrefix(options.pluginId || "") || "\u56de\u6267",
    createdAt: options.createdAt || options.created_at || "",
    summary: source,
  });
}

function messageNoteBody(message = {}, thread = {}) {
  const content = stripNoteReceiptMetadataComments(message.content || "");
  const question = boundedNoteReceiptQuestionText(precedingUserMessageForReceipt(thread, message)?.content || "");
  const error = message.error ? `Error: ${message.error}` : "";
  const artifactNames = Array.isArray(message.artifacts)
    ? message.artifacts
      .map((artifact) => stringValue(artifact?.name || artifact?.id))
      .filter(Boolean)
    : [];
  const attachments = artifactNames.length
    ? `附件:\n${artifactNames.map((name) => `- ${name}`).join("\n")}`
    : "";
  const meta = [
    "来源: Hermes Mobile 回执",
    thread?.title ? `会话: ${thread.title}` : "",
    message?.createdAt ? `时间: ${message.createdAt}` : "",
  ].filter(Boolean).join("\n");
  const questionBlock = question ? `问题:\n${question}` : "";
  const receiptBlock = content ? `回执:\n${content}` : "";
  return [questionBlock, receiptBlock, error, attachments, meta].filter(Boolean).join("\n\n").trim();
}

function receiptNoteTagsWithMetadata(message = {}, thread = {}, input = {}) {
  const baseTags = receiptNoteTags(message, thread, input);
  const metadata = extractNoteReceiptMetadata(message.content || "");
  const seen = new Set();
  return baseTags.concat(metadata.tags || [])
    .map((tag) => stringValue(tag).slice(0, 60))
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, 16);
}

function basenameFromArtifact(artifact = {}) {
  const rawName = stringValue(artifact.name || artifact.filename || artifact.id || "attachment");
  const name = path.basename(rawName).replace(/[<>:"\\|?*\x00-\x1f]/g, "_").slice(0, 180);
  return name || "attachment";
}

function kindForMime(mime = "") {
  const value = String(mime || "").toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("audio/")) return "audio";
  if (value.startsWith("video/")) return "video";
  if (value.includes("pdf") || value.includes("document") || value.startsWith("text/")) return "document";
  return "file";
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw serviceError("note_workspace_config_invalid", `Note workspace config is invalid: ${boundedError(err?.message)}`, 500);
  }
}

function readOptionalJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function noteReceiptDedupeStorePath(dataDir = "", workspaceId = "") {
  const root = stringValue(dataDir);
  if (!root) return "";
  return path.join(root, "note-receipts", "dedupe", `${sha256Hex(workspaceId || "owner").slice(0, 24)}.json`);
}

function noteReceiptDedupeKey(input = {}) {
  const workspaceId = stringValue(input.workspaceId) || "owner";
  const threadId = stringValue(input.threadId || input.thread?.id || input.thread_id);
  const messageId = stringValue(input.messageId || input.message?.id || input.message_id);
  if (!threadId || !messageId) return "";
  return sha256Hex([workspaceId, threadId, messageId].join("\n"));
}

function noteReceiptDedupeLookup(dataDir = "", input = {}) {
  const key = noteReceiptDedupeKey(input);
  const storePath = noteReceiptDedupeStorePath(dataDir, input.workspaceId);
  if (!key || !storePath) return null;
  const store = readOptionalJsonFile(storePath);
  const record = store?.receipts && typeof store.receipts === "object" ? store.receipts[key] : null;
  if (!record?.noteId) return null;
  return {
    ok: true,
    duplicate: true,
    note: {
      id: stringValue(record.noteId),
      title: stringValue(record.title),
      attachmentCount: Number(record.attachmentCount || 0) || 0,
    },
  };
}

function noteReceiptDedupeRemember(dataDir = "", input = {}, note = {}) {
  const key = noteReceiptDedupeKey(input);
  const storePath = noteReceiptDedupeStorePath(dataDir, input.workspaceId);
  const noteId = stringValue(note.id);
  if (!key || !storePath || !noteId) return;
  const store = readOptionalJsonFile(storePath);
  const now = new Date().toISOString();
  const next = {
    schemaVersion: NOTE_RECEIPT_DEDUPE_VERSION,
    updatedAt: now,
    receipts: store?.receipts && typeof store.receipts === "object" ? store.receipts : {},
  };
  next.receipts[key] = {
    noteId,
    title: stringValue(note.title),
    attachmentCount: Number(note.attachmentCount || 0) || 0,
    workspaceId: stringValue(input.workspaceId) || "owner",
    threadId: stringValue(input.threadId || input.thread?.id || input.thread_id),
    messageId: stringValue(input.messageId || input.message?.id || input.message_id),
    savedAt: next.receipts[key]?.savedAt || now,
    updatedAt: now,
  };
  writeJsonFileAtomic(storePath, next);
}

function noteAccessKeyFile(configPath, config = {}, dataDir = "", env = process.env, workspaceId = "") {
  const configured = stringValue(config.access_key_file);
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(path.dirname(configPath), configured);
  }
  return noteWorkspaceKeyPath({ dataDir, env, workspaceId });
}

function loadNoteWorkspaceBinding(input = {}) {
  const { dataDir, env = process.env, workspaceId } = input;
  const configPath = noteWorkspaceConfigPath({ dataDir, env, workspaceId });
  if (!configPath || !fs.existsSync(configPath)) {
    throw serviceError("note_workspace_not_configured", "Note workspace is not configured for this Hermes workspace", 409);
  }
  const config = readJsonFile(configPath);
  const apiBaseUrl = stringValue(config.api_base_url || config.apiBaseUrl);
  if (!apiBaseUrl) {
    throw serviceError("note_workspace_api_base_missing", "Note workspace API base URL is missing", 409);
  }
  const accessKeyPath = noteAccessKeyFile(configPath, config, dataDir, env, workspaceId);
  let accessKey = "";
  try {
    accessKey = fs.readFileSync(accessKeyPath, "utf8").trim();
  } catch (_) {
    throw serviceError("note_workspace_key_missing", "Note workspace access key is missing", 409);
  }
  if (!accessKey) {
    throw serviceError("note_workspace_key_empty", "Note workspace access key is empty", 409);
  }
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/g, ""),
    workspaceId: stringValue(config.workspace_id || config.workspaceId) || canonicalNoteWorkspaceId(workspaceId),
    accessKey,
  };
}

function responseBodyText(response) {
  if (typeof response.text === "function") return response.text();
  return Promise.resolve("");
}

async function parseNoteResponse(response) {
  if (typeof response.json === "function") {
    try {
      return await response.json();
    } catch (_) {
      return {};
    }
  }
  const text = await responseBodyText(response);
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return {};
  }
}

function createNoteReceiptSaveService(options = {}) {
  const dataDir = options.dataDir;
  const env = options.env || process.env;
  const fetchImpl = options.fetch || global.fetch;
  const resolveArtifactForRequest = options.resolveArtifactForRequest;
  const mimeFor = options.mimeFor || (() => "application/octet-stream");
  const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_NOTE_RECEIPT_TIMEOUT_MS) || DEFAULT_NOTE_RECEIPT_TIMEOUT_MS);
  const pendingReceiptSaves = new Map();

  function statAttachmentFile(localPath) {
    try {
      return fs.statSync(localPath);
    } catch (_) {
      throw serviceError("note_receipt_attachment_missing", "Message attachment file is missing", 404);
    }
  }

  function materializeAttachment(artifactRef = {}, auth = null) {
    if (typeof resolveArtifactForRequest !== "function") {
      throw serviceError("note_receipt_artifact_resolver_missing", "Artifact resolver is not available", 500);
    }
    const artifactId = stringValue(artifactRef.id || artifactRef.artifactId);
    if (!artifactId) {
      throw serviceError("note_receipt_attachment_id_missing", "Message attachment id is missing", 400);
    }
    const resolved = resolveArtifactForRequest(artifactId, auth);
    if (!resolved?.artifact) {
      throw serviceError(
        resolved?.error || "note_receipt_attachment_not_found",
        resolved?.error || "Message attachment is not accessible",
        resolved?.status || 404,
      );
    }
    const artifact = resolved.artifact;
    const localPath = stringValue(artifact.localPath || artifact.path);
    if (!localPath) {
      throw serviceError("note_receipt_attachment_path_missing", "Message attachment cannot be read", 404);
    }
    const stat = statAttachmentFile(localPath);
    if (!stat.isFile()) {
      throw serviceError("note_receipt_attachment_not_file", "Message attachment is not a file", 400);
    }
    if (stat.size > MAX_NOTE_RECEIPT_ATTACHMENT_BYTES) {
      throw serviceError("note_receipt_attachment_too_large", "Note attachments are limited to 8 MiB each", 413);
    }
    const mime = stringValue(artifact.mime) || mimeFor(localPath);
    return {
      name: basenameFromArtifact(artifact),
      kind: kindForMime(mime),
      mime,
      size: stat.size,
      data_base64: fs.readFileSync(localPath).toString("base64"),
    };
  }

  function materializeAttachments(message = {}, auth = null) {
    const refs = Array.isArray(message.artifacts) ? message.artifacts : [];
    if (refs.length > MAX_NOTE_RECEIPT_ATTACHMENTS) {
      throw serviceError("note_receipt_too_many_attachments", "Note supports up to 8 attachments per save", 413);
    }
    return refs.map((artifact) => materializeAttachment(artifact, auth));
  }

  async function postNote(binding, payload) {
    if (typeof fetchImpl !== "function") {
      throw serviceError("note_receipt_fetch_unavailable", "Fetch is not available for Note save", 500);
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetchImpl(`${binding.apiBaseUrl}/api/v1/notes`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${binding.accessKey}`,
          "Content-Type": "application/json; charset=utf-8",
          "x-note-workspace-id": binding.workspaceId,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      const responseBody = await parseNoteResponse(response);
      if (!response?.ok) {
        const errorMessage = responseBody?.error || responseBody?.message || response?.statusText || "Note save failed";
        throw serviceError("note_receipt_remote_failed", boundedError(errorMessage), response?.status || 502);
      }
      return responseBody;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw serviceError("note_receipt_remote_timeout", "Note save timed out", 504);
      }
      if (err?.code) throw err;
      throw serviceError("note_receipt_remote_failed", boundedError(err?.message), 502);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function saveReceipt(input = {}) {
    const workspaceId = stringValue(input.workspaceId) || "owner";
    const message = input.message || {};
    const thread = input.thread || {};
    const auth = input.auth || null;
    if (message.role && message.role !== "assistant") {
      throw serviceError("note_receipt_message_not_saveable", "Only assistant receipts can be saved to Note", 400);
    }
    if (message.revokedAt) {
      throw serviceError("note_receipt_message_revoked", "Revoked receipts cannot be saved to Note", 400);
    }
    const dedupeInput = {
      workspaceId,
      threadId: input.threadId || input.thread_id || thread.id,
      messageId: input.messageId || input.message_id || message.id,
      thread,
      message,
    };
    const existing = noteReceiptDedupeLookup(dataDir, dedupeInput);
    if (existing) return existing;
    const dedupeKey = noteReceiptDedupeKey(dedupeInput);
    if (dedupeKey && pendingReceiptSaves.has(dedupeKey)) {
      const pending = await pendingReceiptSaves.get(dedupeKey);
      return Object.assign({}, pending, { duplicate: true });
    }
    const savePromise = (async () => {
    const body = messageNoteBody(message, thread);
    const attachments = materializeAttachments(message, auth);
    if (!body && !attachments.length) {
      throw serviceError("note_receipt_empty", "Receipt has no content to save", 400);
    }
    const pluginId = receiptPluginId(message, thread, input);
    const metadata = extractNoteReceiptMetadata(message.content || "");
    const title = summarizeReceiptTitle(stripNoteReceiptMetadataComments(message.content || ""), {
      pluginId,
      threadTitle: thread.title,
      createdAt: message.createdAt,
      noteTitle: metadata.title,
    });
    const binding = loadNoteWorkspaceBinding({ dataDir, env, workspaceId });
    const payload = {
      title,
      body,
      tags: receiptNoteTagsWithMetadata(message, thread, input),
      notebookId: "hermes",
      attachments,
    };
    const result = await postNote(binding, payload);
    const saved = {
      ok: true,
      note: {
        id: result?.note?.id || result?.id || "",
        title: result?.note?.title || title,
        attachmentCount: attachments.length,
      },
    };
    noteReceiptDedupeRemember(dataDir, dedupeInput, saved.note);
    return saved;
    })();
    if (dedupeKey) pendingReceiptSaves.set(dedupeKey, savePromise);
    try {
      return await savePromise;
    } finally {
      if (dedupeKey) pendingReceiptSaves.delete(dedupeKey);
    }
  }

  return {
    loadNoteWorkspaceBinding,
    materializeAttachments,
    messageNoteBody,
    saveReceipt,
    summarizeReceiptTitle,
    extractNoteReceiptMetadata,
    stripNoteReceiptMetadataComments,
  };
}

module.exports = {
  MAX_NOTE_RECEIPT_ATTACHMENT_BYTES,
  MAX_NOTE_RECEIPT_ATTACHMENTS,
  createNoteReceiptSaveService,
  extractNoteReceiptMetadata,
  messageNoteBody,
  noteReceiptDedupeKey,
  noteReceiptDedupeLookup,
  receiptNoteTags,
  stripNoteReceiptMetadataComments,
  summarizeReceiptTitle,
};
