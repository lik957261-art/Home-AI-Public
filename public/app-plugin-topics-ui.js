"use strict";

const PLUGIN_TOPIC_DEFS = Object.freeze([
  Object.freeze({
    id: "directory",
    builtinKind: "directory",
    viewMode: "projects",
    label: "\u76ee\u5f55",
    subtitle: "\u6587\u4ef6\u3001\u8d44\u6599\u548c\u76ee\u5f55\u8bdd\u9898",
    iconClass: "nav-directory-icon",
    appIconClass: "directory",
    appIconGlyph: "\u76ee",
    toolset: "",
    deliveryHints: ["directory", "\u76ee\u5f55", "\u6587\u4ef6", "\u8d44\u6599"],
  }),
  Object.freeze({
    id: "wardrobe",
    viewMode: "wardrobe",
    label: "\u8863\u6a71",
    subtitle: "\u642d\u914d\u3001\u5165\u5e93\u548c\u98ce\u683c\u5206\u6790",
    iconClass: "nav-wardrobe-icon",
    appIconClass: "wardrobe",
    appIconGlyph: "\u8863",
    toolset: "wardrobe",
    deliveryHints: ["wardrobe", "\u8863\u6a71", "\u642d\u914d", "\u7a7f\u642d"],
  }),
  Object.freeze({
    id: "finance",
    viewMode: "finance",
    label: "\u8bb0\u8d26",
    subtitle: "\u8d26\u672c\u3001\u6d41\u6c34\u548c\u7edf\u8ba1\u62a5\u544a",
    iconClass: "nav-finance-icon",
    appIconClass: "finance",
    appIconGlyph: "\u00a5",
    toolset: "finance",
    deliveryHints: ["finance", "\u8bb0\u8d26", "\u8d22\u52a1", "\u8d26\u672c"],
  }),
  Object.freeze({
    id: "email",
    viewMode: "email",
    label: "\u90ae\u7bb1",
    subtitle: "\u90ae\u4ef6\u6e05\u6d17\u3001\u641c\u7d22\u548c\u6458\u8981",
    iconClass: "nav-email-icon",
    appIconClass: "outlook",
    appIconGlyph: "O",
    toolset: "email",
    deliveryHints: ["email", "\u90ae\u7bb1", "\u90ae\u4ef6", "\u6536\u4ef6"],
  }),
]);

function pluginTopicId(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function pluginTopicGroupId(pluginId = "") {
  const id = pluginTopicId(pluginId);
  return id ? `plugin:${id}` : "";
}

function pluginTopicDefById(pluginId = "") {
  const id = pluginTopicId(pluginId);
  return PLUGIN_TOPIC_DEFS.find((item) => item.id === id) || null;
}

function pluginTopicDefForGroupId(taskGroupId = "") {
  const text = String(taskGroupId || "").trim();
  if (!text.startsWith("plugin:")) return null;
  return pluginTopicDefById(text.slice("plugin:".length));
}

function pluginTopicNavigationAvailable(def) {
  if (!def?.id) return false;
  if (def.builtinKind === "directory") return true;
  if (def.id === "wardrobe") {
    return typeof wardrobePluginNavigationAvailable === "function" && wardrobePluginNavigationAvailable();
  }
  const embeddedDef = typeof EMBEDDED_PLUGIN_DEFS !== "undefined" ? EMBEDDED_PLUGIN_DEFS[def.id] : null;
  return Boolean(embeddedDef && typeof embeddedPluginNavigationAvailable === "function" && embeddedPluginNavigationAvailable(embeddedDef));
}

function availablePluginTopicDefs() {
  return PLUGIN_TOPIC_DEFS.filter(pluginTopicNavigationAvailable);
}

function pluginTopicSearchText(def) {
  return [
    def?.id,
    def?.label,
    def?.subtitle,
    def?.toolset,
    ...(Array.isArray(def?.deliveryHints) ? def.deliveryHints : []),
  ].filter(Boolean).join("\n").toLowerCase();
}

function pluginTopicDirectoryProjectText(project) {
  return [
    project?.id,
    project?.label,
    project?.root,
    project?.source,
    ...(Array.isArray(project?.aliases) ? project.aliases : []),
  ].filter(Boolean).join("\n").toLowerCase();
}

function pluginTopicDirectoryBasePath() {
  const workspace = typeof currentWorkspace === "function" ? currentWorkspace() : null;
  return String(workspace?.defaultWorkspace || "").trim()
    || (typeof directoryRootCreateBasePath === "function" ? directoryRootCreateBasePath() : "")
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget()?.root || "" : "");
}

function pluginTopicJoinPath(base, ...segments) {
  const root = String(base || "").trim().replace(/[\\/]+$/g, "");
  if (!root) return "";
  const separator = root.includes("\\") ? "\\" : "/";
  const tail = segments
    .map((item) => String(item || "").trim().replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
    .join(separator);
  return tail ? `${root}${separator}${tail}` : root;
}

function pluginTopicFolderName(def) {
  return String(def?.label || def?.id || "").trim();
}

function pluginTopicDirectoryPath(def) {
  const base = pluginTopicDirectoryBasePath();
  const folder = pluginTopicFolderName(def);
  return base && folder ? pluginTopicJoinPath(base, "\u63d2\u4ef6", folder) : "";
}

function pluginTopicDirectoryRoute(def) {
  const path = pluginTopicDirectoryPath(def);
  if (!path) return null;
  const project = (typeof matchingDirectoryProject === "function" ? matchingDirectoryProject(path) : null)
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget() : null);
  if (!project?.id || !project?.root || typeof directoryAttachmentFromRoute !== "function") return null;
  return directoryAttachmentFromRoute(project.id, "", path, `${def.label} \u8d44\u6599`);
}

function pluginTopicDeliveryAttachment(def) {
  return pluginTopicDirectoryRoute(def);
}

async function pluginTopicCreateDirectory(path, name) {
  const safeName = String(name || "").trim();
  if (!path || !safeName) return;
  const threadId = await ensureDirectoryThread();
  try {
    await api("/api/directories/create", {
      method: "POST",
      body: JSON.stringify({ threadId, path, name: safeName }),
    });
  } catch (err) {
    if (err?.status !== 409 && !/already exists/i.test(err?.message || "")) throw err;
  }
}

async function ensurePluginTopicDirectory(def) {
  const base = pluginTopicDirectoryBasePath();
  const folder = pluginTopicFolderName(def);
  if (!base || !folder) throw new Error("\u63d2\u4ef6\u76ee\u5f55\u6839\u8def\u5f84\u4e0d\u53ef\u7528\u3002");
  await pluginTopicCreateDirectory(base, "\u63d2\u4ef6");
  const pluginRoot = pluginTopicJoinPath(base, "\u63d2\u4ef6");
  await pluginTopicCreateDirectory(pluginRoot, folder);
  await loadProjects();
  return pluginTopicDirectoryRoute(def) || {
    projectId: currentProject()?.id || "",
    subprojectId: "",
    label: `${def.label} \u8d44\u6599`,
    path: pluginTopicJoinPath(pluginRoot, folder),
    root: directoryRootForPath(pluginTopicJoinPath(pluginRoot, folder), base),
  };
}

function pluginTopicMessages(thread, taskGroupId) {
  return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === taskGroupId);
}

function pluginTopicGroupsForTaskList(thread) {
  return availablePluginTopicDefs().filter((def) => !def.builtinKind).map((def) => {
    const id = pluginTopicGroupId(def.id);
    const messages = pluginTopicMessages(thread, id);
    const latest = messages[messages.length - 1] || null;
    const delivery = pluginTopicDeliveryAttachment(def);
    return {
      id,
      pluginTopic: true,
      pluginId: def.id,
      title: def.label,
      prompt: def.subtitle,
      summary: def.toolset ? `MCP: ${def.toolset}` : "",
      updatedAt: latest?.updatedAt || latest?.createdAt || "0000-00-00T00:00:00.000Z",
      messages,
      directoryRoute: delivery || null,
    };
  });
}

function renderPluginTopicCards() {
  const defs = availablePluginTopicDefs();
  if (!defs.length) return "";
  return `<section class="plugin-topic-launcher" aria-label="\u63d2\u4ef6\u4e3b\u9898">
    <div class="plugin-topic-grid">
      ${defs.map((def) => `
        <article class="plugin-topic-card" data-plugin-topic-card="${escapeHtml(def.id)}">
          <button class="plugin-topic-card-main" type="button" data-plugin-topic-open-app="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u63d2\u4ef6`)}">
            <span class="plugin-topic-app-icon ${escapeHtml(def.appIconClass || def.id)}" data-plugin-icon="${escapeHtml(def.appIconGlyph || "")}" aria-hidden="true"></span>
            <span class="plugin-topic-text">
              <span class="plugin-topic-title">${escapeHtml(def.label)}</span>
              <span class="plugin-topic-subtitle">${escapeHtml(def.subtitle)}</span>
            </span>
          </button>
          <div class="plugin-topic-actions" aria-label="${escapeHtml(`${def.label}\u5feb\u6377\u64cd\u4f5c`)}">
            <button class="plugin-topic-action" type="button" data-plugin-topic-open-topic="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u8bdd\u9898`)}" title="\u8bdd\u9898">
              <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
            </button>
            <button class="plugin-topic-action" type="button" data-plugin-topic-open-delivery="${escapeHtml(def.id)}" aria-label="${escapeHtml(`\u6253\u5f00${def.label}\u8d44\u6599\u76ee\u5f55`)}" title="\u8d44\u6599\u76ee\u5f55">
              <span class="plugin-topic-action-icon folder" aria-hidden="true"></span>
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  </section>`;
}

async function openBuiltInDirectoryPlugin() {
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  if (typeof openCurrentDirectoryEntry === "function") {
    await openCurrentDirectoryEntry();
    return;
  }
  state.directoryReturnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : null;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  if (typeof resetDirectoryPath === "function") resetDirectoryPath();
  await loadSelectedView();
}

async function openBuiltInDirectoryTopicList() {
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  await loadSelectedView({ forceTaskListReload: true });
}

async function openPluginTopicApp(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryPlugin();
    return;
  }
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  if (def.id === "wardrobe" && typeof rememberWardrobePluginReturnRoute === "function") rememberWardrobePluginReturnRoute();
  if (def.id === "finance" && typeof rememberFinancePluginReturnRoute === "function") rememberFinancePluginReturnRoute();
  if (def.id === "email" && typeof rememberEmailPluginReturnRoute === "function") rememberEmailPluginReturnRoute();
  state.viewMode = def.viewMode;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  await loadSelectedView();
}

async function openPluginTopicChat(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryTopicList();
    return;
  }
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = pluginTopicGroupId(def.id);
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = pluginTopicDeliveryAttachment(def);
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  if (typeof applyViewMode === "function") applyViewMode();
  await loadSingleWindow();
  ensurePluginTopicDirectory(def)
    .then((directory) => {
      if (state.viewMode === "tasks" && state.currentTaskGroupId === pluginTopicGroupId(def.id)) {
        state.pendingTaskDirectory = directory;
      }
    })
    .catch((err) => {
      const message = err?.message || String(err || "");
      if (message) showPushToast(`插件目录暂时不可用：${message}`, "warning");
    });
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function openPluginTopicDelivery(pluginId) {
  const def = pluginTopicDefById(pluginId);
  if (!def || !pluginTopicNavigationAvailable(def)) return;
  if (def.builtinKind === "directory") {
    await openBuiltInDirectoryPlugin();
    return;
  }
  if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
  else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  clearQuotedReply({ render: false });
  const returnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : null;
  if (returnRoute) {
    returnRoute.viewMode = "tasks";
    returnRoute.currentTaskGroupId = "";
  }
  const directory = await ensurePluginTopicDirectory(def);
  const project = (state.projects || []).find((item) => item.id === directory?.projectId)
    || (typeof matchingDirectoryProject === "function" ? matchingDirectoryProject(directory?.path) : null)
    || (typeof currentDirectoryTarget === "function" ? currentDirectoryTarget() : null);
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  state.directoryReturnRoute = returnRoute;
  if (project?.root && directory?.path) {
    state.selectedProjectId = project.id;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
    if (typeof persistSelectedSubproject === "function") persistSelectedSubproject("");
    if (typeof renderSubprojects === "function") renderSubprojects();
    state.directoryPath = directory.path;
    state.directoryRootPath = directory.root || project.root;
    state.sharedDirectoryManagerOpen = false;
    await loadDirectoryView({ preserveScroll: false });
    return;
  }
  if (typeof resetDirectoryPath === "function") resetDirectoryPath();
  if (typeof showPushToast === "function") showPushToast("\u672a\u627e\u5230\u63d2\u4ef6\u8d44\u6599\u76ee\u5f55\uff0c\u5df2\u6253\u5f00\u76ee\u5f55\u9996\u9875\u3002", "info");
  await loadDirectoryView({ resetPath: true });
}

function pluginTopicInstruction(def) {
  if (!def?.id) return "";
  return [
    `This is the Hermes Mobile plugin-bound topic for ${def.label}.`,
    `Use the ${def.toolset || def.id} plugin MCP as the primary structured data source only if that toolset is actually available in this workspace.`,
    "Use the plugin file directory only for cleaned user-facing outputs and supporting context; do not mirror private plugin databases into the topic.",
  ].join(" ");
}

function wirePluginTopicCards(root) {
  root?.querySelectorAll?.("[data-plugin-topic-open-app]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicApp(button.dataset.pluginTopicOpenApp).catch(showError));
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-topic]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicChat(button.dataset.pluginTopicOpenTopic).catch(showError));
  });
  root?.querySelectorAll?.("[data-plugin-topic-open-delivery]").forEach((button) => {
    button.addEventListener("click", () => openPluginTopicDelivery(button.dataset.pluginTopicOpenDelivery).catch(showError));
  });
}
