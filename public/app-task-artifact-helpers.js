"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesTaskArtifactHelpers = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  function taskGroupsForThread(thread) {
    const groups = new Map();
    let currentTaskGroupId = "";
    const groupMeta = thread?.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta : {};
    for (const message of thread?.messages || []) {
      let groupId = message.taskGroupId || "";
      if (!groupId && message.role === "user") groupId = `task_${message.id}`;
      if (!groupId) groupId = currentTaskGroupId || message.taskId || `task_${message.id}`;
      currentTaskGroupId = groupId;
      if (!groups.has(groupId)) {
        const timestamp = messageTimelineTimestamp(message);
        const meta = groupMeta[groupId] && typeof groupMeta[groupId] === "object" ? groupMeta[groupId] : {};
        groups.set(groupId, {
          id: groupId,
          title: String(meta.title || "").trim(),
          sharedTopic: Boolean(meta.sharedTopic),
          kanbanCaseId: String(meta.kanbanCaseId || "").trim(),
          kanbanCaseMode: String(meta.kanbanCaseMode || "").trim(),
          performerWorkspaceIds: Array.isArray(meta.performerWorkspaceIds) ? meta.performerWorkspaceIds : [],
          viewerWorkspaceIds: Array.isArray(meta.viewerWorkspaceIds) ? meta.viewerWorkspaceIds : [],
          directoryRoute: meta.directoryRoute && typeof meta.directoryRoute === "object" ? meta.directoryRoute : null,
          messages: [],
          createdAt: message.createdAt,
          updatedAt: meta.updatedAt || timestamp || message.updatedAt || message.createdAt,
        });
      }
      const group = groups.get(groupId);
      group.messages.push(message);
      const timestamp = messageTimelineTimestamp(message);
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
    const kind = artifactKind(artifact);
    if (kind === "pdf" || kind === "word" || kind === "spreadsheet") return true;
    const name = String(artifact?.name || artifact?.id || "").toLowerCase();
    return name.endsWith(".md") || name.endsWith(".txt");
  }

  function isMarkdownArtifact(artifact) {
    const name = String(artifact?.name || artifact?.id || "").toLowerCase();
    const mime = String(artifact?.mime || "").toLowerCase();
    return mime.includes("markdown") || name.endsWith(".md");
  }

  function latestTaskListDocument(group) {
    const artifacts = taskArtifacts(group);
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
    return String(artifact?.displayName || artifact?.title || artifact?.label || artifact?.name || artifact?.id || "document").trim();
  }

  function artifactStem(artifact) {
    return artifactDisplayName(artifact).replace(/\.[^.]+$/, "").toLowerCase();
  }

  function artifactDisplayRank(artifact) {
    const kind = artifactKind(artifact);
    if (kind === "markdown") return 0;
    if (kind === "text") return 1;
    if (kind === "pdf" || kind === "word" || kind === "spreadsheet") return 2;
    return 3;
  }

  function displayArtifacts(artifacts) {
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
    formatBytes,
    compactDisplayText,
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
