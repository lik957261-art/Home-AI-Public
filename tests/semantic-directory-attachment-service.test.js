"use strict";

const assert = require("node:assert/strict");

const { createSemanticDirectoryAttachmentService, defaultComparablePath } = require("../adapters/semantic-directory-attachment-service");

const projects = [
  {
    id: "alpha",
    workspaceId: "owner",
    label: "Alpha",
    aliases: ["Alpha Files"],
    root: "C:/Data/Alpha",
    children: [
      { id: "reports", label: "Reports", aliases: ["Monthly"], root: "C:/Data/Alpha/Reports" },
    ],
  },
  {
    id: "owner-general",
    workspaceId: "owner",
    label: "Owner General",
    aliases: ["Generic"],
    root: "C:/Data/OwnerGeneral",
  },
  {
    id: "owner-alpha-drop",
    workspaceId: "owner",
    label: "Alpha Drop",
    aliases: ["Drop"],
    root: "C:/Data/Alpha/Drop",
  },
  {
    id: "single-window",
    workspaceId: "owner",
    label: "Single Window",
    root: "C:/Data/Single",
  },
  {
    id: "default",
    workspaceId: "owner",
    label: "Default",
    root: "C:/Data/Default",
    source: "workspace-default",
  },
  {
    id: "secret",
    workspaceId: "owner",
    label: "Secret",
    root: "D:/Secret",
  },
  {
    id: "hidden",
    workspaceId: "owner",
    label: "Hidden",
    root: "C:/Data/Hidden",
    hidden: true,
  },
  {
    id: "other",
    workspaceId: "child",
    label: "Other",
    root: "C:/Data/Other",
  },
];

function pathInsideAnyRoot(candidatePath, roots) {
  const candidate = defaultComparablePath(candidatePath);
  return (roots || []).some((root) => {
    const base = defaultComparablePath(root);
    return candidate === base || candidate.startsWith(`${base}/`);
  });
}

function createService(overrides = {}) {
  return createSemanticDirectoryAttachmentService(Object.assign({
    allProjectsForWorkspaceSync: (workspaceId) => projects.filter((project) => project.workspaceId === workspaceId),
    comparablePath: defaultComparablePath,
    directoryRouteDisplayLabel(project, child = null) {
      return child ? `${project.label} / ${child.label}` : project.label;
    },
    effectiveProjectForThread: (thread) => ({ id: thread.projectId || "fallback", root: "C:/Data/Fallback" }),
    findProject: (workspaceId, projectId) => projects.find((project) => project.workspaceId === workspaceId && project.id === projectId) || null,
    findSubproject: (project, subprojectId) => (project?.children || []).find((child) => child.id === subprojectId) || null,
    genericOwnerTopicProjectIds: ["hermes-sync-folder"],
    genericOwnerTopicProjectPrefixes: ["owner-"],
    isDirectoryBrowserPathAllowedForThread(_thread, _localPath, displayPath) {
      return pathInsideAnyRoot(displayPath, ["C:/Data"]);
    },
    isSingleWindowConversationTaskGroupId: (value) => ["chat", "group-chat"].includes(String(value || "")),
    loadCatalog: () => ({ projects }),
    logicalDirectoryDisplayPath: (_thread, rawPath, fallbackLabel) => `logical:${fallbackLabel || rawPath}`,
    normalizeLocalPath: (value) => String(value || ""),
    singleWindowProjectId: "single-window",
  }, overrides));
}

function testSemanticProjectMatchesUseAliasesSpecificityAndGenericSuppression() {
  const service = createService();
  const thread = { workspaceId: "owner", singleWindow: true };

  const childMatches = service.semanticProjectMatches(thread, "Open Alpha Reports Monthly files");
  assert.equal(childMatches[0].projectId, "alpha");
  assert.equal(childMatches[0].subprojectId, "reports");
  assert.equal(childMatches[0].alias, "AlphaReports");
  assert.equal(childMatches.some((match) => match.projectId === "hidden"), false);
  assert.equal(childMatches.some((match) => match.projectId === "other"), false);

  const suppressed = service.semanticProjectMatches(thread, "Alpha Owner General");
  assert.equal(suppressed.some((match) => match.projectId === "owner-general"), false);

  const nestedGeneric = service.semanticProjectMatches(thread, "Alpha Drop");
  assert.equal(nestedGeneric.some((match) => match.projectId === "owner-alpha-drop"), true);

  const genericOnly = service.semanticProjectMatches(thread, "Owner General");
  assert.equal(genericOnly[0].projectId, "owner-general");
}

function testDirectoryAttachmentResolutionHonorsCandidatesAndPathBoundary() {
  const service = createService();
  const thread = { workspaceId: "owner" };

  const candidates = service.directoryAttachmentCandidatesForThread(thread);
  assert.deepEqual(candidates.map((item) => `${item.projectId}:${item.subprojectId}`), [
    "alpha:reports",
    "owner-general:",
    "owner-alpha-drop:",
    "alpha:",
    "secret:",
  ]);

  const byProject = service.resolveTaskDirectoryAttachment(thread, {
    projectId: "alpha",
    subprojectId: "reports",
    path: "C:/Data/Alpha/Reports/Q1",
  });
  assert.deepEqual(byProject, {
    projectId: "alpha",
    subprojectId: "reports",
    label: "Alpha / Reports",
    path: "C:/Data/Alpha/Reports/Q1",
    root: "C:/Data/Alpha/Reports",
  });

  const outsideRequestedPath = service.resolveTaskDirectoryAttachment(thread, {
    projectId: "alpha",
    path: "D:/Secret",
  });
  assert.equal(outsideRequestedPath.path, "C:/Data/Alpha");

  const customAllowed = service.resolveTaskDirectoryAttachment(thread, {
    label: "",
    root: "C:/Data/Loose",
    path: "C:/Data/Loose/Sub",
  });
  assert.equal(customAllowed.label, "logical:Directory");
  assert.equal(customAllowed.path, "C:/Data/Loose/Sub");

  const deniedByProject = service.resolveTaskDirectoryAttachment(thread, { projectId: "secret" });
  assert.equal(deniedByProject, null);

  const deniedCustom = service.resolveTaskDirectoryAttachment(thread, { root: "D:/Secret" });
  assert.equal(deniedCustom, null);
}

function testSemanticTaskAttachmentAndRoutingInstructions() {
  const service = createService();
  const singleWindowThread = { workspaceId: "owner", singleWindow: true };
  const ordinaryThread = { workspaceId: "owner", singleWindow: false };

  assert.equal(service.semanticTaskDirectoryAttachment(ordinaryThread, "Alpha"), null);
  const attachment = service.semanticTaskDirectoryAttachment(singleWindowThread, "Alpha Owner General");
  assert.equal(attachment.projectId, "alpha");
  assert.equal(attachment.path, "C:/Data/Alpha");

  const instructions = service.semanticProjectRoutingInstructions(singleWindowThread, "Alpha Reports");
  assert.match(instructions, /Semantic project-directory matches/);
  assert.match(instructions, /Alpha \/ Reports/);
  assert.match(instructions, /C:\/Data\/Alpha\/Reports/);
  assert.match(instructions, /do not emit a generic directory alias/);
}

function testMessageAndGroupDirectoryAttachmentDiscovery() {
  const service = createService();
  const thread = {
    workspaceId: "owner",
    singleWindow: true,
    messages: [
      {
        id: "m1",
        role: "user",
        taskGroupId: "task-1",
        content: "Please process C:/Data/Alpha/Reports/input.csv",
        directoryAliases: [
          { projectId: "alpha", subprojectId: "reports", label: "Reports", root: "C:/Data/Alpha/Reports" },
          { projectId: "alpha", subprojectId: "reports", label: "Reports duplicate", root: "C:/Data/Alpha/Reports" },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        taskGroupId: "delivery-only",
        directoryRoute: { projectId: "owner-general", label: "Owner General", root: "C:/Data/OwnerGeneral" },
      },
    ],
  };

  const candidates = service.taskDirectoryAttachmentCandidatesForMessage(thread, thread.messages[0]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].subprojectId, "reports");
  assert.equal(candidates[1].projectId, "alpha");
  assert.equal(candidates[1].subprojectId, "");

  assert.equal(service.taskDirectoryAttachmentForGroup(thread, "task-1").path, "C:/Data/Alpha/Reports");
  assert.equal(service.taskDirectoryAttachmentForGroup(thread, "delivery-only"), null);
  assert.equal(service.taskDirectoryAttachmentForMessage(thread, { taskGroupId: "chat" }), null);

  const direct = service.taskDirectoryAttachmentForMessage(thread, {
    taskGroupId: "chat",
    directoryRoute: { label: "Direct", root: "C:/Data/Loose", path: "C:/Data/Loose/Input" },
  });
  assert.equal(direct.label, "Direct");
  assert.equal(direct.path, "C:/Data/Loose/Input");
}

function testProjectForTaskDirectoryAttachmentUsesSubprojectAndFallback() {
  const service = createService();
  const thread = { workspaceId: "owner", projectId: "fallback" };

  assert.deepEqual(service.projectForTaskDirectoryAttachment(thread, null), {
    id: "fallback",
    root: "C:/Data/Fallback",
  });

  const project = service.projectForTaskDirectoryAttachment(thread, {
    projectId: "alpha",
    subprojectId: "reports",
    label: "Attached Reports",
    path: "C:/Data/Alpha/Reports/Q1",
    root: "C:/Data/Alpha/Reports",
  });
  assert.equal(project.id, "reports");
  assert.equal(project.parentProjectId, "alpha");
  assert.equal(project.parentLabel, "Alpha");
  assert.equal(project.label, "Attached Reports");
  assert.equal(project.root, "C:/Data/Alpha/Reports/Q1");
}

function testServiceRequiresBoundaryDependencies() {
  assert.throws(
    () => createSemanticDirectoryAttachmentService({}),
    /semantic directory attachment service requires allProjectsForWorkspaceSync/,
  );
}

testSemanticProjectMatchesUseAliasesSpecificityAndGenericSuppression();
testDirectoryAttachmentResolutionHonorsCandidatesAndPathBoundary();
testSemanticTaskAttachmentAndRoutingInstructions();
testMessageAndGroupDirectoryAttachmentDiscovery();
testProjectForTaskDirectoryAttachmentUsesSubprojectAndFallback();
testServiceRequiresBoundaryDependencies();

console.log("semantic-directory-attachment-service tests passed");
