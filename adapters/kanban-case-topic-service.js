"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  cleanString,
  dedupe,
  safeDirectoryName,
  safeStorageSegment,
} = require("./kanban-study-plan-service");

const DEFAULT_SHARED_FOLDER_NAME = "\u5b66\u4e60\u8ba1\u5212";
const DEFAULT_TOPIC_KIND = "case-topic";

function compactText(value, maxChars = 1000) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function defaultComparablePath(value) {
  let p = String(value || "").trim().replaceAll("\\", "/");
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  p = p.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  p = p.replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  if (/^[a-z]:\//i.test(p)) {
    p = path.win32.normalize(p).replaceAll("\\", "/").replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  } else {
    p = path.posix.normalize(p);
  }
  return p.replace(/\/+$/, "").toLowerCase();
}

function defaultPathInsideAnyRoot(candidate, roots) {
  const normalized = defaultComparablePath(candidate);
  return (roots || []).some((root) => {
    const r = defaultComparablePath(root);
    return Boolean(normalized && r && (normalized === r || normalized.startsWith(`${r}/`)));
  });
}

function defaultNormalizeChatGroup(value = {}, ownerWorkspaceId = "owner") {
  const group = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.assign({}, group, {
    enabled: Boolean(group.enabled),
    kind: cleanString(group.kind || group.type),
    topicKey: cleanString(group.topicKey || group.topic_key),
    memberWorkspaceIds: dedupe([ownerWorkspaceId, ...(Array.isArray(group.memberWorkspaceIds) ? group.memberWorkspaceIds : [])]),
    createdAt: cleanString(group.createdAt || group.created_at),
    updatedAt: cleanString(group.updatedAt || group.updated_at),
  });
}

function defaultNormalizeTaskGroupMeta(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : {};
}

function messageChronologyRank(message) {
  if (message?.role === "user") return 0;
  if (message?.role === "assistant") return 1;
  return 2;
}

function defaultSortMessagesChronologically(messages) {
  return [...(messages || [])].sort((a, b) => (
    String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    || messageChronologyRank(a) - messageChronologyRank(b)
    || String(a?.submittedAt || a?.queuedAt || "").localeCompare(String(b?.submittedAt || b?.queuedAt || ""))
    || String(a?.id || "").localeCompare(String(b?.id || ""))
  ));
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createKanbanCaseTopicService(deps = {}) {
  const sharedFolderName = cleanString(deps.sharedFolderName || DEFAULT_SHARED_FOLDER_NAME) || DEFAULT_SHARED_FOLDER_NAME;
  const topicKind = cleanString(deps.topicKind || DEFAULT_TOPIC_KIND) || DEFAULT_TOPIC_KIND;
  const compact = typeof deps.compactText === "function" ? deps.compactText : compactText;
  const normalizeLocalPath = typeof deps.normalizeLocalPath === "function" ? deps.normalizeLocalPath : (value) => cleanString(value);
  const comparablePath = typeof deps.comparablePath === "function" ? deps.comparablePath : defaultComparablePath;
  const pathInsideAnyRoot = typeof deps.pathInsideAnyRoot === "function" ? deps.pathInsideAnyRoot : defaultPathInsideAnyRoot;
  const pathExists = typeof deps.pathExists === "function" ? deps.pathExists : (value) => fs.existsSync(value);
  const mkdirp = typeof deps.mkdirp === "function" ? deps.mkdirp : (value) => fs.mkdirSync(value, { recursive: true });
  const sharedDirectoriesForWorkspace = typeof deps.sharedDirectoriesForWorkspace === "function"
    ? deps.sharedDirectoriesForWorkspace
    : () => [];
  const readKanbanCaseShare = typeof deps.readKanbanCaseShare === "function"
    ? deps.readKanbanCaseShare
    : () => null;
  const workspaceDefaultRoot = typeof deps.workspaceDefaultRoot === "function" ? deps.workspaceDefaultRoot : () => "";
  const upsertSharedDirectory = typeof deps.upsertSharedDirectory === "function" ? deps.upsertSharedDirectory : () => null;
  const assertChildPathInside = typeof deps.assertChildPathInside === "function"
    ? deps.assertChildPathInside
    : (parentPath, childPath) => {
      if (!pathInsideAnyRoot(childPath, [parentPath])) {
        throw new Error(`Path is outside parent: ${childPath}`);
      }
    };
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const workspacePrincipal = typeof deps.workspacePrincipal === "function" ? deps.workspacePrincipal : (workspaceId) => cleanString(workspaceId);
  const makeId = typeof deps.makeId === "function" ? deps.makeId : defaultMakeId;
  const getState = typeof deps.getState === "function" ? deps.getState : () => deps.state || { threads: [] };
  const isKanbanCaseTopicThread = typeof deps.isKanbanCaseTopicThread === "function"
    ? deps.isKanbanCaseTopicThread
    : (thread) => {
      const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
      return Boolean(thread?.singleWindow && group.enabled && group.kind === topicKind);
    };
  const normalizeChatGroup = typeof deps.normalizeChatGroup === "function" ? deps.normalizeChatGroup : defaultNormalizeChatGroup;
  const createSingleWindowThread = typeof deps.createSingleWindowThread === "function"
    ? deps.createSingleWindowThread
    : (workspaceId, overrides = {}) => Object.assign({
      id: makeId("thread"),
      workspaceId,
      singleWindow: true,
      messages: [],
      events: [],
    }, overrides);
  const normalizeTaskGroupMeta = typeof deps.normalizeTaskGroupMeta === "function" ? deps.normalizeTaskGroupMeta : defaultNormalizeTaskGroupMeta;
  const senderInfoForWorkspace = typeof deps.senderInfoForWorkspace === "function"
    ? deps.senderInfoForWorkspace
    : (workspaceId) => ({
      senderWorkspaceId: cleanString(workspaceId) || "owner",
      senderPrincipalId: "",
      senderLabel: cleanString(workspaceId) || "owner",
    });
  const sortMessagesChronologically = typeof deps.sortMessagesChronologically === "function"
    ? deps.sortMessagesChronologically
    : defaultSortMessagesChronologically;
  const saveState = typeof deps.saveState === "function" ? deps.saveState : () => {};
  const broadcast = typeof deps.broadcast === "function" ? deps.broadcast : () => {};
  const threadSummary = typeof deps.threadSummary === "function" ? deps.threadSummary : (thread) => thread;

  function planLearnerLabel(plan = {}) {
    return compact(
      plan.learnerName
      || plan.readerName
      || plan.targetName
      || plan.target_name
      || "learner",
      60,
    ) || "learner";
  }

  function caseTopicTitle(plan = {}) {
    return compact(
      plan.contentTitle
      || plan.bookTitle
      || plan.title
      || plan.subject
      || plan.summary
      || plan.id
      || "\u5b66\u4e60\u8ba1\u5212",
      120,
    ) || "\u5b66\u4e60\u8ba1\u5212";
  }

  function learnerSharedFolderName(plan = {}) {
    const learner = planLearnerLabel(plan);
    return safeDirectoryName(learner) || `learner-${safeStorageSegment(learner, "learner")}`;
  }

  function stableTextKey(value, fallback = "item") {
    const text = compact(value || fallback, 120) || fallback;
    const slug = safeStorageSegment(text, "");
    const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
    return slug ? `${slug}-${hash}` : `${fallback}-${hash}`;
  }

  function learnerRootDirectory(ownerWorkspaceId, ownerRoot, plan = {}) {
    const learner = planLearnerLabel(plan);
    const expectedName = learnerSharedFolderName(plan);
    const directoryRecords = sharedDirectoriesForWorkspace(ownerWorkspaceId) || [];
    const explicit = directoryRecords
      .filter((record) => cleanString(record?.source) !== "hermes-mobile-study-plan")
      .map((record) => normalizeLocalPath(record?.path || "") || record?.path || "")
      .filter(Boolean)
      .filter((recordPath) => pathInsideAnyRoot(recordPath, [ownerRoot]))
      .find((recordPath) => {
        const labels = [
          path.basename(normalizeLocalPath(recordPath) || recordPath),
          ...directoryRecords
            .filter((record) => comparablePath(normalizeLocalPath(record?.path || "") || record?.path || "") === comparablePath(recordPath))
            .flatMap((record) => [record.label, ...(record.aliases || [])]),
        ].filter(Boolean);
        return labels.some((label) => cleanString(label) === learner);
      });
    if (explicit) return normalizeLocalPath(explicit) || explicit;
    return path.join(ownerRoot, expectedName);
  }

  function caseDirectoryName(plan = {}) {
    const readable = safeDirectoryName(compact(caseTopicTitle(plan), 96));
    return readable || safeStorageSegment(plan.id || "case", "case");
  }

  function caseDirectoryPath(ownerWorkspaceId, sharedRoot, plan = {}) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const existingShare = readKanbanCaseShare(owner, plan.id || "");
    const existingPath = normalizeLocalPath(existingShare?.caseDirectoryPath || "") || existingShare?.caseDirectoryPath || "";
    if (existingPath && pathInsideAnyRoot(existingPath, [sharedRoot])) return existingPath;
    const baseName = caseDirectoryName(plan);
    let candidate = path.join(sharedRoot, baseName);
    if (!pathExists(candidate)) return candidate;
    const suffix = crypto.createHash("sha1").update(String(plan.id || baseName)).digest("hex").slice(0, 6);
    const suffixedBase = safeDirectoryName(`${baseName}-${suffix}`) || safeStorageSegment(plan.id || "case", "case");
    candidate = path.join(sharedRoot, suffixedBase);
    let index = 2;
    while (pathExists(candidate)) {
      candidate = path.join(sharedRoot, safeDirectoryName(`${suffixedBase}-${index}`) || `${suffixedBase}-${index}`);
      index += 1;
    }
    return candidate;
  }

  function memberWorkspaceIds(plan = {}, ownerWorkspaceId = "owner") {
    return dedupe([
      cleanString(ownerWorkspaceId) || "owner",
      ...(Array.isArray(plan.performerWorkspaceIds) ? plan.performerWorkspaceIds : []),
      ...(Array.isArray(plan.viewerWorkspaceIds) ? plan.viewerWorkspaceIds : []),
    ]);
  }

  function ensureSharedDirectory(ownerWorkspaceId, plan = {}) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const ownerRoot = workspaceDefaultRoot(owner);
    const targets = memberWorkspaceIds(plan, owner).filter((workspaceId) => workspaceId !== owner);
    if (!ownerRoot || !targets.length) return null;
    const learner = planLearnerLabel(plan);
    const learnerRoot = learnerRootDirectory(owner, ownerRoot, plan);
    const sharedRoot = path.join(learnerRoot, sharedFolderName);
    const caseDirectory = caseDirectoryPath(owner, sharedRoot, plan);
    assertChildPathInside(ownerRoot, learnerRoot);
    assertChildPathInside(learnerRoot, sharedRoot);
    assertChildPathInside(sharedRoot, caseDirectory);
    mkdirp(caseDirectory);
    const share = upsertSharedDirectory({
      path: sharedRoot,
      label: `${learner}${sharedFolderName}`,
      createdAt: nowIso(),
      createdBy: owner,
      createdByPrincipalId: workspacePrincipal(owner),
      permission: "read_only",
      scope: "selected_workspaces",
      targetWorkspaceIds: targets,
      aliases: [learner, sharedFolderName, `${learner}${sharedFolderName}`],
      source: "hermes-mobile-study-plan",
    });
    return {
      sharedDirectoryPath: sharedRoot,
      caseDirectoryPath: caseDirectory,
      share,
      directoryRoute: {
        label: `${learner} / ${sharedFolderName} / ${caseTopicTitle(plan)}`,
        root: caseDirectory,
        path: caseDirectory,
      },
    };
  }

  function caseTopicKey(ownerWorkspaceId, plan = {}) {
    return `study:${safeStorageSegment(ownerWorkspaceId || "owner", "owner")}:${stableTextKey(planLearnerLabel(plan), "learner").toLowerCase()}`;
  }

  function findTopicThread(ownerWorkspaceId, topicKey) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const key = cleanString(topicKey);
    const state = getState();
    return (state.threads || []).find((thread) => (
      thread?.singleWindow
      && thread.workspaceId === owner
      && isKanbanCaseTopicThread(thread)
      && normalizeChatGroup(thread.chatGroup || {}, owner).topicKey === key
    )) || null;
  }

  function ensureTopicThread(ownerWorkspaceId, plan = {}, directoryInfo = null) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const members = memberWorkspaceIds(plan, owner);
    const now = nowIso();
    const topicKey = caseTopicKey(owner, plan);
    const state = getState();
    if (!Array.isArray(state.threads)) state.threads = [];
    let thread = findTopicThread(owner, topicKey);
    if (!thread) {
      thread = createSingleWindowThread(owner, {
        title: `${planLearnerLabel(plan)}${sharedFolderName}`,
        chatGroup: {
          enabled: true,
          kind: topicKind,
          topicKey,
          memberWorkspaceIds: members,
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      });
      state.threads.unshift(thread);
    } else {
      const group = normalizeChatGroup(thread.chatGroup || {}, owner);
      thread.chatGroup = Object.assign({}, group, {
        enabled: true,
        kind: topicKind,
        topicKey,
        memberWorkspaceIds: dedupe([...(group.memberWorkspaceIds || []), ...members]),
        createdAt: group.createdAt || now,
        updatedAt: now,
      });
    }
    const taskGroupId = `case_${safeStorageSegment(plan.id || makeId("case"), "case")}`;
    thread.taskGroupMeta = normalizeTaskGroupMeta(thread.taskGroupMeta);
    thread.taskGroupMeta[taskGroupId] = Object.assign({}, thread.taskGroupMeta[taskGroupId] || {}, {
      title: caseTopicTitle(plan),
      updatedAt: now,
      sharedTopic: true,
      kanbanCaseId: plan.id || "",
      kanbanCaseMode: plan.mode || "",
      kanbanCaseOwnerWorkspaceId: owner,
      performerWorkspaceIds: plan.performerWorkspaceIds || [],
      viewerWorkspaceIds: plan.viewerWorkspaceIds || [],
      directoryRoute: directoryInfo?.directoryRoute || null,
      sharedDirectoryPath: directoryInfo?.sharedDirectoryPath || "",
      caseDirectoryPath: directoryInfo?.caseDirectoryPath || "",
    });
    if (!(thread.messages || []).some((message) => message.taskGroupId === taskGroupId)) {
      const sender = senderInfoForWorkspace(owner);
      thread.messages = sortMessagesChronologically([...(thread.messages || []), {
        id: makeId("msg"),
        role: "user",
        content: [
          `${sharedFolderName}\u8bdd\u9898\uff1a${caseTopicTitle(plan)}`,
          directoryInfo?.caseDirectoryPath ? `Directory: ${directoryInfo.caseDirectoryPath}` : "",
        ].filter(Boolean).join("\n"),
        status: "done",
        taskGroupId,
        messageKind: "plain",
        singleWindowMode: "task",
        actorWorkspaceId: owner,
        senderWorkspaceId: sender.senderWorkspaceId,
        senderPrincipalId: sender.senderPrincipalId,
        senderLabel: sender.senderLabel,
        directoryRoute: directoryInfo?.directoryRoute || null,
        directoryAliases: directoryInfo?.directoryRoute ? [directoryInfo.directoryRoute] : [],
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
      }]);
    }
    thread.updatedAt = now;
    saveState(state, { reason: "kanban-case-topic", forceBackup: true });
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    return { thread, taskGroupId };
  }

  return Object.freeze({
    planLearnerLabel,
    caseTopicTitle,
    learnerSharedFolderName,
    stableTextKey,
    learnerRootDirectory,
    caseDirectoryName,
    caseDirectoryPath,
    memberWorkspaceIds,
    ensureSharedDirectory,
    caseTopicKey,
    findTopicThread,
    ensureTopicThread,
  });
}

module.exports = {
  DEFAULT_SHARED_FOLDER_NAME,
  DEFAULT_TOPIC_KIND,
  compactText,
  defaultComparablePath,
  defaultPathInsideAnyRoot,
  createKanbanCaseTopicService,
};
