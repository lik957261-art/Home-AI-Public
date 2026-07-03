"use strict";

const DEV_PREVIEW_API_MOCK_VERSION = "20260702-vite-dev-preview-api-mock-v1";
const NAVIGATION_SHELL_PREVIEW_THREAD_ID = "thread_vite_navigation_preview";
const MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID = "thread_vite_message_action_preview";
const CHAT_RUNTIME_PREVIEW_THREAD_ID = "thread_vite_chat_runtime_preview";
const CHAT_RUNTIME_PREVIEW_CLIENT_VERSION = "20260702-vite-chat-runtime-dev-v1";
const WARDROBE_OUTFIT_WEAR_ACTION_PATH = "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent";
const PLUGIN_HOST_PREVIEW_PLUGIN_IDS = Object.freeze(["finance", "codex-mobile", "movie"]);

function isoNow(clock = new Date()) {
  const date = clock instanceof Date ? clock : new Date(clock);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function ownerConsoleOverview({ now = new Date() } = {}) {
  const timestamp = isoNow(now);
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    console: {
      ok: true,
      consoleVersion: "vite-dev-owner-console-preview",
      generatedAt: timestamp,
      overallStatus: "ok",
      policy: {
        readOnlyMvp: true,
        actionExecutionEnabled: false,
        source: "vite_dev_preview_mock",
      },
      dimensions: [
        {
          signalId: "dev_availability",
          category: "availability",
          label: "可用性",
          status: "ok",
          severity: "H3",
          summary: "Vite dev preview fixture is reachable.",
          lastCheckedAt: timestamp,
          recommendedAction: "继续开发环境验证",
        },
        {
          signalId: "dev_accuracy",
          category: "accuracy",
          label: "准确性",
          status: "ok",
          severity: "H3",
          summary: "Mock payload shape matches the Owner console read-only contract.",
          lastCheckedAt: timestamp,
          recommendedAction: "使用生产 API 读回前不要切生产",
        },
        {
          signalId: "dev_autonomy",
          category: "autonomy",
          label: "自主性",
          status: "warning",
          severity: "H3",
          summary: "Actions are intentionally disabled in the dev preview mock.",
          lastCheckedAt: timestamp,
          recommendedAction: "保持只读",
        },
      ],
      criticalSignals: [],
      pages: [
        { id: "overview", label: "概览", status: "ok" },
        { id: "system-status", label: "系统状态", status: "ok" },
        { id: "gateway-runtime", label: "Gateway Runtime", status: "unknown" },
      ],
    },
  };
}

function ownerConsoleSystemStatus({ now = new Date() } = {}) {
  const timestamp = isoNow(now);
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    systemStatus: {
      ok: true,
      overallStatus: "ok",
      collectedAt: timestamp,
      cpu: {
        status: "ok",
        overallPercent: 18,
        coreCount: 8,
        loadAverage: [1.2, 1.1, 1.0],
        loadPerCore: { oneMinute: 0.15 },
        pressure: "normal",
      },
      memory: {
        status: "ok",
        totalBytes: 32 * 1024 ** 3,
        usedBytes: 14 * 1024 ** 3,
        freeBytes: 18 * 1024 ** 3,
        percentUsed: 44,
        swap: { active: false, usedBytes: 0 },
      },
      disks: [
        {
          label: "Home AI data",
          status: "ok",
          totalBytes: 1024 * 1024 ** 3,
          usedBytes: 420 * 1024 ** 3,
          freeBytes: 604 * 1024 ** 3,
          percentUsed: 41,
        },
      ],
      host: {
        uptimeSeconds: 86400,
        uptimeText: "24 小时",
      },
      signals: [
        {
          signalId: "dev_listener",
          category: "service",
          label: "Home AI Listener",
          status: "ok",
          severity: "H3",
          summary: "Dev preview mock is serving the Owner console API shape.",
          boundedEvidence: ["HTTP 200", "metadata-only fixture"],
          lastCheckedAt: timestamp,
          source: "vite_dev_preview_mock",
          recommendedAction: "继续开发环境验证",
          actionRequiresOwnerConfirmation: false,
        },
        {
          signalId: "dev_gateway",
          category: "gateway",
          label: "Gateway",
          status: "unknown",
          severity: "H3",
          summary: "Gateway runtime is not probed by this dev-only mock.",
          boundedEvidence: ["probe skipped"],
          lastCheckedAt: timestamp,
          source: "vite_dev_preview_mock",
          recommendedAction: "生产切换前使用真实 API 读回",
          actionRequiresOwnerConfirmation: false,
        },
      ],
    },
  };
}

function navigationShellThreadReadPayload({ now = new Date(), taskGroupId = "" } = {}) {
  const timestamp = isoNow(now);
  const selectedTaskGroupId = String(taskGroupId || "");
  const scopedMessages = selectedTaskGroupId ? [
    {
      id: `msg_${selectedTaskGroupId}_user_preview`,
      role: "user",
      status: "sent",
      taskGroupId: selectedTaskGroupId,
      content: "查看 Vite 改造文档进展",
      attachments: [],
      artifacts: [],
    },
    {
      id: `msg_${selectedTaskGroupId}_assistant_preview`,
      role: "assistant",
      status: "completed",
      taskGroupId: selectedTaskGroupId,
      content: "已读回任务话题的开发预览状态。",
      attachments: [],
      artifacts: [{ id: "artifact_vite_preview_note", type: "markdown" }],
    },
  ] : [];
  const thread = {
    id: NAVIGATION_SHELL_PREVIEW_THREAD_ID,
    singleWindow: true,
    updatedAt: timestamp,
    messagesPage: {
      mode: "tasks",
      taskGroupId: selectedTaskGroupId,
      total: scopedMessages.length,
      loaded: scopedMessages.length,
      limit: 30,
      hasMore: false,
      hasMoreBefore: false,
      oldestMessageId: scopedMessages[0]?.id || "",
      newestMessageId: scopedMessages[scopedMessages.length - 1]?.id || "",
      items: scopedMessages,
    },
    taskGroups: [
      {
        id: "topic_daily_ops",
        title: "日常运维",
        summary: "检查 Gateway 与插件状态",
        status: "open",
        updatedAt: timestamp,
      },
      {
        id: "topic_directory_docs",
        title: "Vite 改造文档",
        summary: "目录绑定话题",
        status: "open",
        updatedAt: timestamp,
        directoryRoute: {
          workspaceId: "owner",
          projectId: "home-ai-docs",
          root: "/home-ai-dev/docs",
          label: "Home AI / docs",
        },
      },
    ],
    pluginTopicGroups: [
      {
        id: "plugin_wardrobe_topic",
        pluginId: "wardrobe",
        pluginTopic: true,
        title: "衣橱",
        updatedAt: timestamp,
      },
    ],
  };
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    thread,
  };
}

function wardrobePreviewIntent() {
  return {
    type: "outfit_wear_intent",
    schema_version: 1,
    plugin_id: "wardrobe",
    principal_id: "owner",
    workspace_id: "owner",
    wear_date: "2026-07-02",
    timezone: "Asia/Shanghai",
    items: [
      { role: "Outer", code: "OUT-001" },
      { role: "Footwear", code: "SHOE-001" },
    ],
    source_message: {
      message_id: "assistant_ready",
      thread_id: MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
    },
    idempotency_key: "wardrobe:outfit_wear_intent:vite-dev-preview",
    expires_at: "2099-07-02T00:00:00.000Z",
  };
}

function messageActionPanelWardrobeExecutePayload({ body = {}, now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const messageId = String(body.messageId || body.message_id || "").trim();
  const threadId = String(body.threadId || body.thread_id || "").trim();
  const workspaceId = String(body.workspaceId || body.workspace_id || "owner").trim() || "owner";
  if (!threadId || !messageId) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "thread_and_message_required",
    };
  }
  if (threadId !== MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID || workspaceId !== "owner") {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_action_scope_mismatch",
    };
  }
  const confirmReplace = Boolean(body.confirmReplace || body.confirm_replace || body.mode === "replace");
  const actionState = confirmReplace
    ? {
      kind: "outfit_wear_intent",
      pluginId: "wardrobe",
      status: "stored",
      executable: false,
      intent: wardrobePreviewIntent(),
      updatedAt: timestamp,
      outfitId: "vite-dev-777",
      readbackVerified: true,
    }
    : {
      kind: "outfit_wear_intent",
      pluginId: "wardrobe",
      status: "needs_confirmation",
      executable: true,
      intent: wardrobePreviewIntent(),
      updatedAt: timestamp,
      confirmMode: "replace",
      existingOutfitId: "vite-dev-existing",
    };
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    actionState,
    message: {
      id: messageId,
      role: "assistant",
      pluginActions: {
        wardrobeOutfitWearIntent: actionState,
      },
    },
    thread: {
      id: threadId,
      workspaceId,
      updatedAt: timestamp,
    },
    requestEcho: {
      mode: confirmReplace ? "replace" : "create_only",
      confirmReplace,
    },
  };
}

function chatRuntimeComposerSendPayload({ threadId = "", body = {}, now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedThreadId = String(threadId || "").trim();
  const text = String(body.text || "").trim();
  const workspaceId = String(body.workspaceId || body.workspace_id || "owner").trim() || "owner";
  if (normalizedThreadId !== CHAT_RUNTIME_PREVIEW_THREAD_ID || workspaceId !== "owner") {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_composer_scope_mismatch",
    };
  }
  if (!text && !Array.isArray(body.artifacts)) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "message_body_empty",
    };
  }
  const taskGroupId = String(body.taskGroupId || "").trim();
  const userMessage = {
    id: "msg_vite_composer_user",
    role: "user",
    status: "done",
    content: text,
    createdAt: timestamp,
    updatedAt: timestamp,
    taskGroupId,
    messageKind: String(body.messageKind || "").trim(),
  };
  const assistantMessage = {
    id: "msg_vite_composer_assistant",
    role: "assistant",
    status: "queued",
    content: "",
    runId: "run_vite_composer_preview",
    createdAt: timestamp,
    updatedAt: timestamp,
    queuedAt: timestamp,
    taskGroupId,
    localRunProgressEvents: [{
      event: "run.request_preparing",
      timestamp: Math.floor(Date.parse(timestamp) / 1000),
      preview: "正在准备模型回复",
    }],
  };
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    run: {
      id: "run_vite_composer_preview",
      run_id: "run_vite_composer_preview",
      status: "queued",
      taskGroupId,
    },
    thread: {
      id: normalizedThreadId,
      workspaceId,
      singleWindow: true,
      status: "running",
      activeRunId: "run_vite_composer_preview",
      activeRunIds: ["run_vite_composer_preview"],
      updatedAt: timestamp,
      messages: [userMessage, assistantMessage],
    },
    requestEcho: {
      textLength: text.length,
      artifactCount: Array.isArray(body.artifacts) ? body.artifacts.length : 0,
      notificationChannel: String(body.notificationChannel || ""),
      singleWindowMode: String(body.singleWindowMode || ""),
      messageKind: String(body.messageKind || ""),
    },
  };
}

function chatRuntimeComposerInterruptPayload({ threadId = "", body = {}, now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedThreadId = String(threadId || "").trim();
  if (normalizedThreadId !== CHAT_RUNTIME_PREVIEW_THREAD_ID) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_composer_scope_mismatch",
    };
  }
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    runIds: ["run_vite_composer_preview"],
    stoppedRunIds: ["run_vite_composer_preview"],
    thread: {
      id: normalizedThreadId,
      workspaceId: "owner",
      singleWindow: true,
      status: "idle",
      activeRunId: "",
      activeRunIds: [],
      updatedAt: timestamp,
      messages: [
        {
          id: "msg_vite_composer_interrupted",
          role: "assistant",
          status: "cancelled",
          runId: "run_vite_composer_preview",
          content: "已停止开发预览运行。",
          updatedAt: timestamp,
          taskGroupId: String(body.taskGroupId || "").trim(),
        },
      ],
    },
  };
}

function chatRuntimeThreadReadPayload({ threadId = "", now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedThreadId = String(threadId || "").trim();
  if (normalizedThreadId !== CHAT_RUNTIME_PREVIEW_THREAD_ID) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_thread_not_found",
    };
  }
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    thread: {
      id: normalizedThreadId,
      workspaceId: "owner",
      singleWindow: true,
      status: "done",
      activeRunId: "",
      activeRunIds: [],
      updatedAt: timestamp,
      messages: [
        {
          id: "msg_user_1",
          role: "user",
          status: "done",
          content: "帮我总结今天的衣橱建议。",
          createdAt: "2026-07-02T09:00:00.000Z",
          updatedAt: "2026-07-02T09:00:00.000Z",
        },
        {
          id: "msg_assistant_1",
          role: "assistant",
          status: "done",
          runId: "run_preview_1",
          content: "runtime thread readback 已返回最终消息。",
          usage: { total_tokens: 512 },
          createdAt: "2026-07-02T09:00:01.000Z",
          updatedAt: timestamp,
        },
      ],
    },
    messagesPage: {
      mode: "chat",
      total: 2,
      loaded: 2,
      hasMoreBefore: false,
      oldestMessageId: "msg_user_1",
      newestMessageId: "msg_assistant_1",
    },
  };
}

function base64ByteLength(value = "") {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text) return 0;
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

function chatRuntimeUploadPayload({ threadId = "", body = {}, now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedThreadId = String(threadId || "").trim();
  const workspaceId = String(body.workspaceId || body.workspace_id || "owner").trim() || "owner";
  const filename = String(body.filename || body.name || "").trim();
  const dataBase64 = String(body.dataBase64 || "").trim();
  const type = String(body.type || body.mime || "").trim();
  if (normalizedThreadId !== CHAT_RUNTIME_PREVIEW_THREAD_ID || workspaceId !== "owner") {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_upload_scope_mismatch",
    };
  }
  if (!filename || !dataBase64) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: !filename ? "filename_required" : "data_base64_required",
    };
  }
  const safeId = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "upload";
  const size = base64ByteLength(dataBase64);
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    artifact: {
      id: `artifact_vite_upload_${safeId}`,
      threadId: normalizedThreadId,
      workspaceId,
      name: filename,
      filename,
      mime: type,
      type,
      size,
      createdAt: timestamp,
      source: "system_upload",
    },
    requestEcho: {
      filename,
      type,
      dataBase64Length: dataBase64.length,
      byteLength: size,
    },
  };
}

function chatRuntimeServerFileAttachmentPayload({ threadId = "", body = {}, now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedThreadId = String(threadId || "").trim();
  const workspaceId = String(body.workspaceId || body.workspace_id || "owner").trim() || "owner";
  const filePath = String(body.path || body.displayPath || body.workspacePath || "").trim();
  const filename = String(body.filename || body.name || "").trim()
    || filePath.split(/[\\/]/).filter(Boolean).pop()
    || "server-file";
  if (normalizedThreadId !== CHAT_RUNTIME_PREVIEW_THREAD_ID || workspaceId !== "owner") {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_server_file_scope_mismatch",
    };
  }
  if (!filePath) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "server_file_path_required",
    };
  }
  if (/^https?:\/\//i.test(filePath)) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "remote_server_files_not_attachable",
    };
  }
  const safeId = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "server_file";
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    artifact: {
      id: `artifact_vite_server_file_${safeId}`,
      threadId: normalizedThreadId,
      workspaceId,
      name: filename,
      filename,
      mime: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "",
      type: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "",
      size: 8192,
      createdAt: timestamp,
      source: "server_file",
    },
    requestEcho: {
      filename,
      workspaceId,
      pathPresent: Boolean(filePath),
    },
  };
}

function pluginHostManifestPayload({ pluginId = "", workspaceId = "owner", now = new Date() } = {}) {
  const timestamp = isoNow(now);
  const normalizedPluginId = String(pluginId || "").trim().toLowerCase();
  const normalizedWorkspaceId = String(workspaceId || "owner").trim() || "owner";
  if (!PLUGIN_HOST_PREVIEW_PLUGIN_IDS.includes(normalizedPluginId)) {
    return {
      ok: false,
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      error: "vite_dev_preview_plugin_not_found",
      pluginId: normalizedPluginId,
    };
  }
  const title = normalizedPluginId === "finance"
    ? "记账"
    : normalizedPluginId === "movie"
      ? "电影"
      : "Codex Mobile";
  return {
    ok: true,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    id: normalizedPluginId,
    pluginId: normalizedPluginId,
    title,
    kind: "embedded_app",
    available: true,
    workspaceId: normalizedWorkspaceId,
    version: `vite-dev-plugin-host-${normalizedPluginId}-v1`,
    generatedAt: timestamp,
    entry: {
      url: `/plugins/${encodeURIComponent(normalizedPluginId)}/?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}&mode=vite-dev-preview`,
      origin: "same-origin",
    },
    embed: {
      tokenStatus: "not_required",
      refreshOnVersionChange: true,
      blockedByFrameAncestors: false,
    },
    embedding: {
      refreshOnVersionChange: true,
    },
    actions: normalizedPluginId === "finance"
      ? ["record", "transactions"]
      : [],
    permissionCount: normalizedPluginId === "codex-mobile" ? 3 : 2,
  };
}

function serializeSseData(value) {
  const text = String(value == null ? "" : value);
  return text.split(/\r?\n/).map((line) => `data: ${line}`).join("\n");
}

function chatRuntimeEventStreamRecords({ now = new Date() } = {}) {
  const timestamp = isoNow(now);
  return [
    {
      id: "runtime_delta_1",
      payload: {
        type: "message.delta",
        threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
        messageId: "msg_assistant_1",
        delta: "runtime SSE 已连接，",
        updatedAt: timestamp,
        firstFeedbackAt: timestamp,
      },
    },
    {
      id: "runtime_delta_2",
      payload: {
        type: "message.delta",
        threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
        messageId: "msg_assistant_1",
        delta: "事件由 Vite dev server mock 推送。",
        updatedAt: timestamp,
      },
    },
    {
      id: "runtime_terminal_message",
      payload: {
        type: "message",
        threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
        message: {
          id: "msg_assistant_1",
          role: "assistant",
          status: "done",
          runId: "run_preview_1",
          content: "runtime SSE 已连接，事件由 Vite dev server mock 推送。",
          usage: { total_tokens: 512 },
          updatedAt: timestamp,
        },
        thread: {
          id: CHAT_RUNTIME_PREVIEW_THREAD_ID,
          status: "done",
          activeRunId: "",
          activeRunIds: [],
          updatedAt: timestamp,
        },
      },
    },
  ].map((record) => {
    const data = JSON.stringify(record.payload);
    return Object.freeze({
      id: record.id,
      event: "message",
      data,
      serialized: `${serializeSseData(data)}\n\n`,
    });
  });
}

function viteDevPreviewEventStreamRouteApplies(request = {}) {
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  return url.pathname === "/api/events"
    && url.searchParams.get("clientVersion") === CHAT_RUNTIME_PREVIEW_CLIENT_VERSION;
}

function viteDevPreviewEventStreamPayload(request = {}, options = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  if (!viteDevPreviewEventStreamRouteApplies(request)) return null;
  if (method !== "GET") {
    return {
      ok: false,
      statusCode: 405,
      error: "method_not_allowed",
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    };
  }
  return {
    ok: true,
    statusCode: 200,
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    clientVersion: url.searchParams.get("clientVersion") || "",
    keyPresent: Boolean(url.searchParams.get("key")),
    frames: chatRuntimeEventStreamRecords({ now: options.now }),
    intervalMs: 25,
    closeDelayMs: 250,
  };
}

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-HomeAI-Vite-Dev-Mock": DEV_PREVIEW_API_MOCK_VERSION,
    },
    body,
  };
}

function viteDevPreviewApiMockRouteApplies(request = {}) {
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  return url.pathname.startsWith("/api/owner/system-console")
    || url.pathname === "/api/threads"
    || url.pathname.startsWith("/api/threads/")
    || url.pathname === WARDROBE_OUTFIT_WEAR_ACTION_PATH
    || /^\/api\/hermes-plugins\/[^/]+\/manifest$/.test(url.pathname);
}

function viteDevPreviewApiMockResponse(request = {}, options = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  const isOwnerConsoleRoute = url.pathname.startsWith("/api/owner/system-console");
  const isThreadReadRoute = url.pathname === "/api/threads" || url.pathname.startsWith("/api/threads/");
  const isWardrobeActionRoute = url.pathname === WARDROBE_OUTFIT_WEAR_ACTION_PATH;
  const pluginManifestMatch = url.pathname.match(/^\/api\/hermes-plugins\/([^/]+)\/manifest$/);
  const composerSendMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages$/);
  const composerInterruptMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/interrupt$/);
  const uploadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/uploads$/);
  const serverFileAttachmentMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/server-file-attachments$/);
  if (!isOwnerConsoleRoute && !isThreadReadRoute && !isWardrobeActionRoute && !pluginManifestMatch) return null;
  if (pluginManifestMatch) {
    if (method !== "GET") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = pluginHostManifestPayload({
      pluginId: decodeURIComponent(pluginManifestMatch[1] || ""),
      workspaceId: url.searchParams.get("workspaceId") || "owner",
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 404 : 200);
  }
  if (serverFileAttachmentMatch) {
    if (method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = chatRuntimeServerFileAttachmentPayload({
      threadId: decodeURIComponent(serverFileAttachmentMatch[1] || ""),
      body: request.body || {},
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 400 : 200);
  }
  if (uploadMatch) {
    if (method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = chatRuntimeUploadPayload({
      threadId: decodeURIComponent(uploadMatch[1] || ""),
      body: request.body || {},
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 400 : 200);
  }
  if (composerSendMatch) {
    if (method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = chatRuntimeComposerSendPayload({
      threadId: decodeURIComponent(composerSendMatch[1] || ""),
      body: request.body || {},
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 400 : 200);
  }
  if (composerInterruptMatch) {
    if (method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = chatRuntimeComposerInterruptPayload({
      threadId: decodeURIComponent(composerInterruptMatch[1] || ""),
      body: request.body || {},
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 400 : 200);
  }
  if (isWardrobeActionRoute) {
    if (method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "method_not_allowed",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 405);
    }
    const payload = messageActionPanelWardrobeExecutePayload({
      body: request.body || {},
      now: options.now,
    });
    return jsonResponse(payload, payload.ok === false ? 400 : 200);
  }
  if (method !== "GET") {
    return jsonResponse({
      ok: false,
      error: "method_not_allowed",
      source: "vite_dev_preview_mock",
      mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
    }, 405);
  }
  if (isThreadReadRoute) {
    const threadId = decodeURIComponent(url.pathname.replace(/^\/api\/threads\/?/, "") || "");
    if (threadId === CHAT_RUNTIME_PREVIEW_THREAD_ID) {
      return jsonResponse(chatRuntimeThreadReadPayload({
        threadId,
        now: options.now,
      }));
    }
    if (threadId !== NAVIGATION_SHELL_PREVIEW_THREAD_ID) {
      return jsonResponse({
        ok: false,
        error: "vite_dev_preview_thread_not_found",
        source: "vite_dev_preview_mock",
        mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
      }, 404);
    }
    return jsonResponse(navigationShellThreadReadPayload({
      now: options.now,
      taskGroupId: url.searchParams.get("taskGroupId") || "",
    }));
  }
  if (url.pathname === "/api/owner/system-console") {
    return jsonResponse(ownerConsoleOverview(options));
  }
  if (url.pathname === "/api/owner/system-console/system-status") {
    return jsonResponse(ownerConsoleSystemStatus(options));
  }
  return jsonResponse({
    ok: false,
    error: "vite_dev_preview_mock_route_not_found",
    source: "vite_dev_preview_mock",
    mockVersion: DEV_PREVIEW_API_MOCK_VERSION,
  }, 404);
}

module.exports = {
  CHAT_RUNTIME_PREVIEW_CLIENT_VERSION,
  CHAT_RUNTIME_PREVIEW_THREAD_ID,
  DEV_PREVIEW_API_MOCK_VERSION,
  MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
  NAVIGATION_SHELL_PREVIEW_THREAD_ID,
  PLUGIN_HOST_PREVIEW_PLUGIN_IDS,
  WARDROBE_OUTFIT_WEAR_ACTION_PATH,
  chatRuntimeComposerInterruptPayload,
  chatRuntimeComposerSendPayload,
  chatRuntimeEventStreamRecords,
  chatRuntimeServerFileAttachmentPayload,
  chatRuntimeThreadReadPayload,
  chatRuntimeUploadPayload,
  messageActionPanelWardrobeExecutePayload,
  navigationShellThreadReadPayload,
  ownerConsoleOverview,
  ownerConsoleSystemStatus,
  pluginHostManifestPayload,
  viteDevPreviewApiMockRouteApplies,
  viteDevPreviewApiMockResponse,
  viteDevPreviewEventStreamPayload,
  viteDevPreviewEventStreamRouteApplies,
};
