"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesTaskArtifactHelpers = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TASK_ARTIFACT_HELPER_MODEL_ESM_PATH = "/vite-islands/task-artifact-helper-model/task-artifact-helper-model.js";
  let taskArtifactHelperModel = null;
  let taskArtifactHelperModelPromise = null;

  function importTaskArtifactHelperModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
    if (taskArtifactHelperModel) return Promise.resolve(taskArtifactHelperModel);
    if (!taskArtifactHelperModelPromise) {
      const importer = typeof rootRef.__homeAiImportTaskArtifactHelperModel === "function"
        ? rootRef.__homeAiImportTaskArtifactHelperModel
        : (path) => import(path);
      taskArtifactHelperModelPromise = Promise.resolve()
        .then(() => importer(TASK_ARTIFACT_HELPER_MODEL_ESM_PATH))
        .then((model) => {
          taskArtifactHelperModel = model || null;
          return taskArtifactHelperModel;
        })
        .catch((error) => {
          taskArtifactHelperModelPromise = null;
          throw error;
        });
    }
    return taskArtifactHelperModelPromise;
  }

  function currentTaskArtifactHelperModel() {
    return taskArtifactHelperModel;
  }

  if (typeof window !== "undefined") {
    importTaskArtifactHelperModel().catch(() => null);
  }

  function messageTimelineTimestamp(message) {
    if (!message) return "";
    if (message.completedAt) return message.completedAt;
    if (message.failedAt) return message.failedAt;
    if (message.cancelledAt) return message.cancelledAt;
    return message.submittedAt || message.updatedAt || message.createdAt || "";
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function compactDisplayText(value, max = 180, options = {}) {
    const rewriteDirectoryPathsForDisplay = typeof options.rewriteDirectoryPathsForDisplay === "function"
      ? options.rewriteDirectoryPathsForDisplay
      : (text) => text;
    const cleaned = rewriteDirectoryPathsForDisplay(String(value || ""))
      .split(/\r?\n/)
      .filter((line) => !/^MEDIA:/i.test(line.trim()))
      .join(" ")
      .replace(/Task ID:\s*\S+/gi, " ")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";
    return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}...`;
  }

  function stripReceiptMetadataComments(text = "") {
    return String(text || "").replace(/<!--\s*homeai-note(?:-[a-z]+)?[\s\S]*?-->/gi, "").trim();
  }

  function receiptTitleMetadata(text = "", max = 96) {
    const source = String(text || "");
    const single = source.match(/<!--\s*homeai-note-title\s*[:\uff1a]\s*([\s\S]*?)-->/i);
    if (single) return compactDisplayText(single[1], max);
    const blockRe = /<!--\s*homeai-note\b([\s\S]*?)-->/gi;
    let match;
    while ((match = blockRe.exec(source))) {
      const body = String(match[1] || "");
      for (const line of body.split(/\r?\n/)) {
        const title = String(line || "").trim().match(/^title\s*[:\uff1a]\s*(.+)$/i);
        if (title) return compactDisplayText(title[1], max);
      }
    }
    return "";
  }

  function cleanReceiptTitleLine(line = "") {
    let text = String(line || "").trim();
    text = text.replace(/^#{1,4}\s+/, "");
    text = text.replace(/^[-*+\u2022\u00b7]\s+/, "");
    text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "");
    text = text.replace(/\[[^\]]*]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""));
    text = text.replace(/[`*_~>#]/g, "");
    text = text.replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (/^(attachments?|source|conversation|time|error|\u9644\u4ef6|\u6765\u6e90|\u4f1a\u8bdd|\u65f6\u95f4)[:\uff1a]?/i.test(text)) return "";
    if (/^(按现在的状态|我的判断是|结论先说|先说结论|我查了一下|我看了一下|简单说|整体看|总体看|目前看)[\s\uff1a:，,。.!！?？]*$/i.test(text)) return "";
    return text;
  }

  function receiptTitleLooksLikeFragment(value = "") {
    const text = String(value || "").replace(/[^\p{L}\p{N}]+/gu, "").trim();
    return text.length > 0 && text.length < 3;
  }

  function receiptSummaryTitleFromText(text = "", max = 96) {
    const metadataTitle = receiptTitleMetadata(text, max);
    if (metadataTitle && !receiptTitleLooksLikeFragment(metadataTitle)) return metadataTitle;
    const clean = stripReceiptMetadataComments(text);
    const heading = clean.split(/\r?\n/)
      .map((line) => String(line || "").trim().match(/^#{1,4}\s+(.+)$/))
      .find(Boolean)?.[1] || "";
    const candidate = cleanReceiptTitleLine(heading)
      || clean.split(/\r?\n/).map(cleanReceiptTitleLine).find(Boolean)
      || "";
    if (receiptTitleLooksLikeFragment(candidate)) return "";
    return compactDisplayText(candidate, max);
  }

  function stripTopicTitleNoise(value) {
    let text = String(value || "").trim();
    if (!text) return "";
    const prefixPatterns = [
      /^(请|麻烦|辛苦|帮我|帮忙|我们|我想|我要|你先|你再|现在|然后|另外|就是|这个|那个|关于)[，,。:：\s]*/u,
      /^(讨论一个问题|确认一个问题|看一个问题|有个问题|还有一个问题)(啊)?[，,。:：\s]*/u,
      /^(看一下|查一下|分析一下|整理一下|讨论一下|做一下|写一下|生成一下|继续|先|再)[，,。:：\s]*/u,
      /^(请|麻烦)?(帮我|帮忙)?(看|查|分析|整理|讨论|做|写|生成|检查|确认)(一下)?[，,。:：\s]*/u,
    ];
    let changed = true;
    while (changed) {
      changed = false;
      for (const pattern of prefixPatterns) {
        const next = text.replace(pattern, "").trim();
        if (next !== text) {
          text = next;
          changed = true;
        }
      }
    }
    return text.replace(/^[“”"'`]+|[“”"'`]+$/g, "").trim();
  }

  function compactTopicTitle(value, max = 14, options = {}) {
    const base = compactDisplayText(value, 90, options);
    if (!base) return "";
    const clause = base
      .split(/[。！？!?；;，,：:]/u)
      .map(stripTopicTitleNoise)
      .find(Boolean) || stripTopicTitleNoise(base) || base;
    const cleaned = clause
      .replace(/\s+/g, " ")
      .replace(/^(这个|那个|现在|就是|关于)[\s，,。:：]*/u, "")
      .trim();
    if (!cleaned) return "";
    const limit = Number(max) > 0 ? Number(max) : 14;
    return cleaned.length <= limit ? cleaned : cleaned.slice(0, limit);
  }

  function taskGroupsForThread(thread) {
    const groups = new Map();
    let currentTaskGroupId = "";
    const groupMeta = thread?.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta : {};
    for (const projected of Array.isArray(thread?.taskGroups) ? thread.taskGroups : []) {
      const groupId = String(projected?.id || "").trim();
      if (!groupId || groups.has(groupId)) continue;
      const meta = groupMeta[groupId] && typeof groupMeta[groupId] === "object" ? groupMeta[groupId] : {};
      const pluginTopicGroup = groupId.startsWith("plugin:");
      groups.set(groupId, Object.assign({}, projected, {
        title: String(projected.title || "").trim(),
        lastReceiptTitle: String(projected.lastReceiptTitle || meta.lastReceiptTitle || "").trim(),
        lastUserPromptTitle: String(projected.lastUserPromptTitle || meta.lastUserPromptTitle || "").trim(),
        lastMessageId: String(projected.lastMessageId || meta.lastMessageId || "").trim(),
        pluginTopic: Boolean(projected.pluginTopic || meta.pluginTopic || pluginTopicGroup),
        directoryRoute: pluginTopicGroup ? null : (projected.directoryRoute || meta.directoryRoute || null),
        messages: Array.isArray(projected.messages) ? projected.messages.slice() : [],
        ownerWorkspaceId: String(projected.ownerWorkspaceId || "").trim(),
      }));
    }
    for (const message of thread?.messages || []) {
      let groupId = message.taskGroupId || "";
      if (!groupId && message.role === "user") groupId = `task_${message.id}`;
      if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
      currentTaskGroupId = groupId;
      const pluginTopicGroup = String(groupId || "").startsWith("plugin:");
      if (!groups.has(groupId)) {
        const timestamp = messageTimelineTimestamp(message);
        const meta = groupMeta[groupId] && typeof groupMeta[groupId] === "object" ? groupMeta[groupId] : {};
        groups.set(groupId, {
          id: groupId,
          title: String(meta.title || "").trim(),
          lastReceiptTitle: String(meta.lastReceiptTitle || "").trim(),
          lastUserPromptTitle: String(meta.lastUserPromptTitle || "").trim(),
          lastMessageId: String(meta.lastMessageId || "").trim(),
          sharedTopic: Boolean(meta.sharedTopic),
          kanbanCaseId: String(meta.kanbanCaseId || "").trim(),
          kanbanCaseMode: String(meta.kanbanCaseMode || "").trim(),
          performerWorkspaceIds: Array.isArray(meta.performerWorkspaceIds) ? meta.performerWorkspaceIds : [],
          viewerWorkspaceIds: Array.isArray(meta.viewerWorkspaceIds) ? meta.viewerWorkspaceIds : [],
          directoryRoute: !pluginTopicGroup && meta.directoryRoute && typeof meta.directoryRoute === "object" ? meta.directoryRoute : null,
          pluginTopic: Boolean(meta.pluginTopic || pluginTopicGroup),
          messages: [],
          createdAt: message.createdAt,
          updatedAt: meta.updatedAt || timestamp || message.updatedAt || message.createdAt,
        });
      }
      const group = groups.get(groupId);
      if (!group.messages.some((item) => item?.id && item.id === message.id)) group.messages.push(message);
      const timestamp = messageTimelineTimestamp(message);
      const messageCanRefreshMeta = !group.updatedAt || String(timestamp || "") >= String(group.updatedAt || "");
      if (message.role === "assistant" && message.content && (!group.lastReceiptTitle || messageCanRefreshMeta)) {
        group.lastReceiptTitle = receiptSummaryTitleFromText(message.content || "", 96);
      } else if (message.role === "user" && message.content && (!group.lastUserPromptTitle || messageCanRefreshMeta)) {
        group.lastUserPromptTitle = compactDisplayText(message.content || "", 160);
      }
      if (message.id && messageCanRefreshMeta) group.lastMessageId = String(message.id || "").trim();
      if (!group.pluginTopic && !group.directoryRoute && message.directoryRoute && typeof message.directoryRoute === "object") {
        group.directoryRoute = message.directoryRoute;
      }
      if (!group.ownerWorkspaceId) group.ownerWorkspaceId = messageOwnerWorkspaceId(message, thread?.workspaceId || "");
      if (String(timestamp || "") > String(group.updatedAt || "")) {
        group.updatedAt = timestamp;
      }
    }
    return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function messageOwnerWorkspaceId(message, fallback = "") {
    return String(
      message?.actorWorkspaceId
      || message?.senderWorkspaceId
      || message?.workspaceId
      || fallback
      || "",
    ).trim();
  }

  function taskGroupOwnerWorkspaceId(group, fallback = "") {
    if (group?.ownerWorkspaceId) return String(group.ownerWorkspaceId || "").trim();
    const messages = group?.messages || [];
    const user = messages.find((message) => message.role === "user");
    return messageOwnerWorkspaceId(user || messages[0], fallback);
  }

  function taskListGroupsForThread(thread, options = {}) {
    const selectedWorkspaceId = String(options.selectedWorkspaceId || "").trim();
    const isConversationTaskGroupId = typeof options.isConversationTaskGroupId === "function"
      ? options.isConversationTaskGroupId
      : () => false;
    return taskGroupsForThread(thread)
      .filter((group) => !isConversationTaskGroupId(group.id))
      .filter((group) => {
        if (group.sharedTopic) return true;
        const ownerWorkspaceId = taskGroupOwnerWorkspaceId(group, thread?.workspaceId || "");
        return !selectedWorkspaceId || !ownerWorkspaceId || ownerWorkspaceId === selectedWorkspaceId;
      });
  }

  function taskStatus(group) {
    const messages = group?.messages || [];
    if (messages.some((message) => message.status === "failed")) return "failed";
    if (messages.some((message) => message.status === "running" || message.status === "queued")) return "running";
    if (messages.some((message) => message.status === "cancelled")) return "cancelled";
    return "done";
  }

  function taskDisplayId(group) {
    const assistant = (group?.messages || []).find((message) => message.role === "assistant" && (message.taskId || message.runId));
    return assistant?.taskId || assistant?.runId || group?.id || "task";
  }

  function shortTaskDisplayId(value) {
    const raw = String(value || "task").trim();
    const parts = raw.split("_").filter(Boolean);
    if (parts.length >= 3 && /^(web|fg|bg)$/i.test(parts[0])) {
      return parts.slice(-2).join("_");
    }
    if (raw.length <= 18) return raw;
    return raw.slice(-18);
  }

  function taskPrompt(group, options = {}) {
    const user = (group?.messages || []).find((message) => message.role === "user");
    return compactDisplayText(user?.content || "", 180, options);
  }

  function taskSummary(group, options = {}) {
    const assistant = [...(group?.messages || [])].reverse().find((message) => message.role === "assistant" && message.content);
    return compactDisplayText(assistant?.content || "", 220, options) || taskPrompt(group, options) || "No summary yet";
  }

  function taskTitle(group, options = {}) {
    return String(group?.title || "").trim() || taskPrompt(group, options) || taskSummary(group, options) || taskDisplayId(group);
  }

  function taskShortTitle(group, options = {}) {
    const explicit = String(group?.title || "").trim();
    if (explicit) return compactTopicTitle(explicit, options.max || 14, options);
    const user = (group?.messages || []).find((message) => message.role === "user");
    return compactTopicTitle(user?.content || "", options.max || 14, options);
  }

  function taskArtifacts(group) {
    const byId = new Map();
    for (const message of group?.messages || []) {
      for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
        if (!artifact?.id) continue;
        const id = String(artifact.id);
        if (byId.has(id)) byId.delete(id);
        byId.set(id, artifact);
      }
    }
    return [...byId.values()];
  }

  function isTaskListPrimaryDocument(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.isTaskListPrimaryDocument === "function") {
      return model.isTaskListPrimaryDocument(artifact);
    }
    const kind = artifactKind(artifact);
    if (kind === "pdf" || kind === "word" || kind === "spreadsheet" || kind === "presentation") return true;
    const name = String(artifact?.name || artifact?.id || "").toLowerCase();
    return name.endsWith(".md") || name.endsWith(".txt");
  }

  function isMarkdownArtifact(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.isMarkdownArtifact === "function") {
      return model.isMarkdownArtifact(artifact);
    }
    const name = String(artifact?.name || artifact?.id || "").toLowerCase();
    const mime = String(artifact?.mime || "").toLowerCase();
    return mime.includes("markdown") || name.endsWith(".md");
  }

  function latestTaskListDocument(group) {
    const artifacts = taskArtifacts(group);
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.latestTaskListDocumentPlan === "function") {
      return model.latestTaskListDocumentPlan(artifacts);
    }
    const markdownDocuments = artifacts.filter(isMarkdownArtifact);
    const candidates = markdownDocuments.length ? markdownDocuments : artifacts.filter(isTaskListPrimaryDocument);
    return candidates[candidates.length - 1] || null;
  }

  function normalizeSkillPath(value) {
    let text = String(value || "")
      .trim()
      .replace(/^`+|`+$/g, "")
      .replaceAll("\\", "/")
      .replace(/[,\.;\uFF0C\u3002\uFF1B\u3001\)\]\s]+$/g, "")
      .trim();
    if (!text) return "";
    let lower = text.toLowerCase();
    for (const skillRoot of [".hermes/skills/", "/skills/", "skills/"]) {
      const rootIndex = lower.lastIndexOf(skillRoot);
      if (rootIndex >= 0) {
        text = text.slice(rootIndex + skillRoot.length);
        lower = text.toLowerCase();
        break;
      }
    }
    text = text.replace(/^\/+|\/+$/g, "");
    if (text.toLowerCase().endsWith("/skill.md")) text = text.slice(0, -"/SKILL.md".length);
    text = text.replace(/^\/+|\/+$/g, "");
    if (!text || text.toLowerCase() === "skill.md" || text.toLowerCase() === "skills") return "";
    return text;
  }

  function skillEntryFromText(value) {
    const pathValue = normalizeSkillPath(value);
    if (!pathValue) return null;
    const parts = pathValue.split("/").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    const id = parts[parts.length - 1].replace(/\.md$/i, "");
    if (!id || id.toLowerCase() === "skill") return null;
    return {
      id,
      label: id,
      path: parts.join("/"),
      namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
    };
  }

  function taskSkills(group) {
    const byId = new Map();
    const addSkill = (value) => {
      const entry = skillEntryFromText(value);
      if (!entry) return;
      const key = entry.id.toLowerCase();
      const existing = byId.get(key);
      if (!existing || entry.path.split("/").length > existing.path.split("/").length) byId.set(key, entry);
    };
    const text = (group?.messages || []).map((message) => message.content || "").join("\n").replaceAll("\\", "/");
    if (!text) return [];
    const skillRootPattern = /\.hermes\/skills\/([^\s`<>"'\],;\uFF0C\u3002\uFF1B\u3001\)]+)/gi;
    let match = null;
    while ((match = skillRootPattern.exec(text))) addSkill(match[1]);
    const sharedSkillRootPattern = /(?:^|[\s`"'\(\[\uFF08])((?:[A-Za-z]:)?\/?[^\s`<>"'\],;\uFF0C\u3002\uFF1B\u3001\)]+\/skills\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\/SKILL\.md)?)/gi;
    while ((match = sharedSkillRootPattern.exec(text))) addSkill(match[1]);
    const skillFilePattern = /`?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)\/SKILL\.md`?/gi;
    while ((match = skillFilePattern.exec(text))) addSkill(match[1]);
    const labeledSkillPattern = /(?:Skill|\u6280\u80fd)\s*[:\uFF1A]\s*`?([A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.-]+)+)`?/gi;
    while ((match = labeledSkillPattern.exec(text))) addSkill(match[1]);
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function shortArtifactName(name) {
    const cleaned = String(name || "document").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return cleaned.length <= 18 ? cleaned : `${cleaned.slice(0, 17)}...`;
  }

  function artifactKind(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.artifactKind === "function") {
      return model.artifactKind(artifact);
    }
    const name = String(artifact?.name || artifact?.id || "").toLowerCase();
    const mime = String(artifact?.mime || "").toLowerCase();
    if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
    if (mime.includes("html") || name.endsWith(".html") || name.endsWith(".htm")) return "html";
    if (
      mime.includes("word") ||
      mime.includes("officedocument.wordprocessingml") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx")
    ) {
      return "word";
    }
    if (
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      mime.includes("vnd.ms-excel") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx")
    ) {
      return "spreadsheet";
    }
    if (
      mime.includes("presentation") ||
      mime.includes("powerpoint") ||
      name.endsWith(".ppt") ||
      name.endsWith(".pptx")
    ) {
      return "presentation";
    }
    if (mime.includes("markdown") || name.endsWith(".md")) return "markdown";
    if (
      mime.startsWith("text/") ||
      name.endsWith(".txt") ||
      name.endsWith(".csv") ||
      name.endsWith(".json")
    ) {
      return "text";
    }
    return "file";
  }

  function artifactDisplayName(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.artifactDisplayName === "function") {
      return model.artifactDisplayName(artifact);
    }
    return String(artifact?.displayName || artifact?.title || artifact?.label || artifact?.name || artifact?.id || "document").trim();
  }

  function artifactStem(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.artifactStem === "function") {
      return model.artifactStem(artifact);
    }
    return artifactDisplayName(artifact).replace(/\.[^.]+$/, "").toLowerCase();
  }

  function artifactDisplayRank(artifact) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.artifactDisplayRank === "function") {
      return model.artifactDisplayRank(artifact);
    }
    const kind = artifactKind(artifact);
    if (kind === "markdown") return 0;
    if (kind === "text") return 1;
    if (kind === "pdf" || kind === "word" || kind === "spreadsheet" || kind === "presentation") return 2;
    return 3;
  }

  function displayArtifacts(artifacts) {
    const model = currentTaskArtifactHelperModel();
    if (typeof model?.displayArtifacts === "function") {
      return Array.from(model.displayArtifacts(artifacts));
    }
    const items = Array.isArray(artifacts) ? artifacts.filter(Boolean) : [];
    const markdownStems = new Set(items.filter(isMarkdownArtifact).map(artifactStem).filter(Boolean));
    return items
      .filter((artifact) => {
        const kind = artifactKind(artifact);
        if ((kind === "pdf" || kind === "word" || kind === "spreadsheet") && markdownStems.has(artifactStem(artifact))) return false;
        return true;
      })
      .sort((a, b) => (
        artifactDisplayRank(a) - artifactDisplayRank(b)
        || artifactDisplayName(a).localeCompare(artifactDisplayName(b))
      ));
  }

  return Object.freeze({
    TASK_ARTIFACT_HELPER_MODEL_ESM_PATH,
    importTaskArtifactHelperModel,
    currentTaskArtifactHelperModel,
    formatBytes,
    compactDisplayText,
    compactTopicTitle,
    receiptSummaryTitleFromText,
    taskGroupsForThread,
    messageOwnerWorkspaceId,
    taskGroupOwnerWorkspaceId,
    taskListGroupsForThread,
    taskStatus,
    taskDisplayId,
    shortTaskDisplayId,
    taskPrompt,
    taskSummary,
    taskTitle,
    taskShortTitle,
    taskArtifacts,
    isTaskListPrimaryDocument,
    isMarkdownArtifact,
    latestTaskListDocument,
    normalizeSkillPath,
    skillEntryFromText,
    taskSkills,
    shortArtifactName,
    artifactKind,
    artifactDisplayName,
    artifactStem,
    artifactDisplayRank,
    displayArtifacts,
  });
}));
