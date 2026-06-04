"use strict";

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
const PLUGIN_NOTE_RECEIPT_TAGS = Object.freeze({
  wardrobe: "\u8863\u6a71",
  finance: "\u8bb0\u8d26",
  email: "\u90ae\u7bb1",
  health: "\u5065\u5eb7",
  note: "\u7b14\u8bb0",
  "codex-mobile": "Codex",
});

function stringValue(value) {
  return String(value || "").trim();
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

function summarizeReceiptTitle(text = "") {
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

function messageNoteBody(message = {}, thread = {}) {
  const content = String(message.content || "").trim();
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
  return [content, error, attachments, meta].filter(Boolean).join("\n\n").trim();
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
    const body = messageNoteBody(message, thread);
    const attachments = materializeAttachments(message, auth);
    if (!body && !attachments.length) {
      throw serviceError("note_receipt_empty", "Receipt has no content to save", 400);
    }
    const title = summarizeReceiptTitle(body);
    const binding = loadNoteWorkspaceBinding({ dataDir, env, workspaceId });
    const payload = {
      title,
      body,
      tags: receiptNoteTags(message, thread, input),
      notebookId: "hermes",
      attachments,
    };
    const result = await postNote(binding, payload);
    return {
      ok: true,
      note: {
        id: result?.note?.id || result?.id || "",
        title: result?.note?.title || title,
        attachmentCount: attachments.length,
      },
    };
  }

  return {
    loadNoteWorkspaceBinding,
    materializeAttachments,
    messageNoteBody,
    saveReceipt,
    summarizeReceiptTitle,
  };
}

module.exports = {
  MAX_NOTE_RECEIPT_ATTACHMENT_BYTES,
  MAX_NOTE_RECEIPT_ATTACHMENTS,
  createNoteReceiptSaveService,
  messageNoteBody,
  receiptNoteTags,
  summarizeReceiptTitle,
};
