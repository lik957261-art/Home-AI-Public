"use strict";

const COMPOSER_SEND_TIMEOUT_MS = 30000;

function currentClientNotificationChannel() {
  try {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search || "") : null;
    const nativeShell = params?.get("nativeShell") === "ios"
      || root?.dataset?.nativeShell === "ios"
      || root?.classList?.contains("native-shell-ios")
      || (typeof localStorage !== "undefined" && localStorage.getItem("homeAI.nativeShell") === "ios");
    return nativeShell ? "native_ios_apns" : "web_push";
  } catch (_) {
    return "web_push";
  }
}

function nativeEnvironmentContextBridgeAvailable() {
  try {
    const capability = window.HomeAINativeEnvironmentCapability || {};
    const bridge = window.HomeAINativeEnvironment || {};
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search || "");
    const nativeShell = params.get("nativeShell") === "ios"
      || root?.dataset?.nativeShell === "ios"
      || root?.classList?.contains("native-shell-ios")
      || localStorage.getItem("homeAI.nativeShell") === "ios";
    const enabled = capability.environmentContext === true
      || capability.nativeEnvironmentContext === true
      || root?.dataset?.nativeEnvironmentContext === "1"
      || localStorage.getItem("homeAI.nativeEnvironmentContext") === "1"
      || typeof bridge.getContext === "function";
    return Boolean(nativeShell && enabled && typeof bridge.getContext === "function");
  } catch (_) {
    return false;
  }
}

function nativeEnvironmentContextTargetAt(text = "") {
  const value = String(text || "");
  const now = new Date();
  const target = new Date(now.getTime());
  if (/(?:\u540e\u5929|day after tomorrow)/i.test(value)) {
    target.setDate(target.getDate() + 2);
  } else if (/(?:\u660e\u5929|tomorrow)/i.test(value)) {
    target.setDate(target.getDate() + 1);
  }
  if (/(?:\u65e9\u4e0a|\u65e9\u6668|\u4e0a\u5348|morning)/i.test(value)) {
    target.setHours(9, 0, 0, 0);
  } else if (/(?:\u4e2d\u5348|\u5348\u996d|noon)/i.test(value)) {
    target.setHours(12, 0, 0, 0);
  } else if (/(?:\u4e0b\u5348|afternoon)/i.test(value)) {
    target.setHours(15, 0, 0, 0);
  } else if (/(?:\u665a\u4e0a|\u4eca\u665a|\u660e\u665a|evening|tonight)/i.test(value)) {
    target.setHours(19, 0, 0, 0);
  }
  return target.toISOString();
}

function nativeEnvironmentContextPurpose(body = {}, text = "") {
  const taskGroupId = String(body.taskGroupId || "");
  if (taskGroupId === "plugin:wardrobe" || /(?:\bwardrobe\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d|\u914d\u4e00?\u5957|\u7a7f\u4ec0\u4e48)/i.test(text)) {
    return "wardrobe_outfit";
  }
  if (/(?:\bweather\b|\bforecast\b|\u5929\u6c14|\u9884\u62a5|\u6e29\u5ea6|\u964d\u96e8|\u51fa\u95e8|\u8fd0\u52a8)/i.test(text)) {
    return "general_environment";
  }
  return "";
}

async function requestNativeEnvironmentContextForSend(body = {}, text = "") {
  if (!nativeEnvironmentContextBridgeAvailable()) return null;
  const purpose = nativeEnvironmentContextPurpose(body, text);
  if (!purpose) return null;
  const request = {
    targetAt: nativeEnvironmentContextTargetAt(text),
    forceRefresh: false,
    precise: false,
    purpose,
  };
  const bridgePromise = window.HomeAINativeEnvironment.getContext(request);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), 1200);
  });
  try {
    const context = await Promise.race([bridgePromise, timeoutPromise]);
    if (!context || typeof context !== "object") return null;
    return Object.assign({}, context, {
      purpose,
      targetAt: context.targetAt || request.targetAt,
    });
  } catch (_) {
    return null;
  }
}

async function refreshNativeEnvironmentSnapshotForSend() {
  if (!nativeEnvironmentContextBridgeAvailable()) return null;
  const bridgePromise = window.HomeAINativeEnvironment.getContext({
    forceRefresh: false,
    precise: false,
    purpose: "model_tool_snapshot",
  });
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), 1200);
  });
  try {
    const context = await Promise.race([bridgePromise, timeoutPromise]);
    if (!context || typeof context !== "object") return null;
    const body = {
      workspaceId: state.selectedWorkspaceId,
      deviceId: "native-ios-current",
      environmentContext: Object.assign({}, context, { purpose: context.purpose || "model_tool_snapshot" }),
    };
    await api("/api/native/environment-context", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 2500,
    });
    return context;
  } catch (_) {
    return null;
  }
}

function connectEvents() {
  if (state.events) state.events.close();
  const params = new URLSearchParams();
  if (state.key) params.set("key", state.key);
  if (state.clientVersion) params.set("clientVersion", state.clientVersion);
  const query = params.toString() ? `?${params.toString()}` : "";
  state.events = new EventSource(`/api/events${query}`);
  state.events.onmessage = (event) => {
    try {
      applyEvent(JSON.parse(event.data));
    } catch (err) {
      showError(err);
    }
  };
  state.events.onerror = () => {
    $("connectionState").textContent = "Reconnecting";
  };
}

async function sendMessage(event) {
  event?.preventDefault?.();
  if (state.composerComposing) {
    state.composerSendAfterComposition = true;
    $("messageInput")?.blur();
    scheduleComposerSendAfterCompositionFallback();
    return;
  }
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  if (isComposerStopMode()) {
    const button = $("sendMessage");
    button.disabled = true;
    try {
      await interruptRun();
    } finally {
      button.disabled = false;
      updateComposerAction();
    }
    return;
  }
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (!state.currentThreadId) return;
  let text = getComposerText().trim();
  const originalText = text;
  const ownerElevationOnceTag = ownerElevationComposerAvailable() ? ownerElevationOnceTagInfo(text) : null;
  let ownerElevationOnceRequested = false;
  if (ownerElevationOnceTag) {
    text = stripOwnerElevationOnceTags(text);
  }
  if (!text && !state.pendingArtifacts.length) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  if (typeof voiceLearningModeActive === "function" && voiceLearningModeActive()) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    await handleVoiceLearningComposerSend(text);
    return;
  }
  const directoryTopicDraftSend = typeof isDirectoryTopicDraftActive === "function"
    ? isDirectoryTopicDraftActive()
    : state.viewMode === "tasks"
      && !state.currentTaskGroupId
      && Boolean(state.pendingTaskDirectory?.projectId)
      && Boolean(state.directoryReturnRoute);
  if (directoryTopicDraftSend && state.directoryTopicDraftSendInFlight) {
    return;
  }
  if (directoryTopicDraftSend) {
    state.directoryTopicDraftSendInFlight = true;
  }
  const aiMention = composerAiMentionInfo(text);
  const searchSourceFields = composerSearchSourceBodyFields(text);
  const chatGptProRequested = Boolean(aiMention.chatGptPro);
  if (chatGptProRequested && !ownerElevationComposerAvailable() && !ownerElevationActive()) {
    showError(new Error("ChatGPT Pro requires Owner high-privilege approval."));
    return;
  }
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  if (ownerElevationOnceTag) {
    clearOwnerElevationOnce();
    const ok = await activateOwnerElevationOnce({ confirm: false });
    if (!ok) return;
    ownerElevationOnceRequested = true;
  }
  let chatGptProOnceApproved = false;
  if (chatGptProRequested && !ownerElevationActive() && !ownerElevationOnceTag) {
    clearOwnerElevationOnce();
    const ok = await activateOwnerElevationOnce({
      message: "Approve ChatGPT Pro tool routing for this message only? This sends the run to the Owner maintenance Gateway and exposes only the ChatGPT Pro tool for the approved request.",
    });
    if (!ok) return;
    ownerElevationOnceRequested = true;
    chatGptProOnceApproved = true;
  }
  if (state.composerSendInFlight) return;
  state.composerSendInFlight = true;
  closeGroupMentionMenu();
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  let optimisticSend = null;
  try {
    const body = {
      text,
      artifacts: state.pendingArtifacts,
      workspaceId: state.selectedWorkspaceId,
      notificationChannel: currentClientNotificationChannel(),
    };
    if (searchSourceFields) Object.assign(body, searchSourceFields);
    if (ownerElevationActive() || ownerElevationOnceTag || chatGptProOnceApproved) {
      body.maintenanceMode = true;
      body.maintenance_mode = true;
      body.elevationScope = chatGptProRequested ? "chatgpt_pro_generate" : "owner_high_privilege";
      if (ownerElevationOnceTag || chatGptProOnceApproved) {
        body.ownerElevationOnceToken = state.ownerElevationOnceToken;
      }
    }
    if (chatGptProRequested) {
      body.chatGptProGenerate = true;
      body.chatgpt_pro_generate = true;
      body.requiredTool = "chatgpt_pro_generate";
    }
    if (state.viewMode === "single") {
      body.singleWindowMode = state.singleWindowMode === "chat" ? "chat" : "task";
      if (state.singleWindowMode === "chat") {
        body.taskGroupId = isGroupChatView()
          ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
          : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
        body.messageLimit = CHAT_MESSAGE_INITIAL_LIMIT;
      } else if (state.currentTaskGroupId) {
        body.taskGroupId = state.currentTaskGroupId;
        body.messageLimit = TASK_MESSAGE_INITIAL_LIMIT;
      }
      if (isGroupChatView()) body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
    }
    if (state.viewMode === "tasks" && state.currentTaskGroupId) {
      body.taskGroupId = state.currentTaskGroupId;
      const pluginTopicDef = typeof pluginTopicDefForGroupId === "function"
        ? pluginTopicDefForGroupId(state.currentTaskGroupId)
        : null;
      if (pluginTopicDef) {
        const directory = typeof pluginTopicDeliveryAttachment === "function" ? pluginTopicDeliveryAttachment(pluginTopicDef) : null;
        if (directory?.projectId) body.directory = directory;
        const instruction = typeof pluginTopicInstruction === "function" ? pluginTopicInstruction(pluginTopicDef) : "";
        if (instruction) body.instructions = [body.instructions || "", instruction].filter(Boolean).join("\n\n");
      }
      const sharedTopicGroup = selectedSharedTopicGroup();
      if (sharedTopicGroup) {
        body.singleWindowMode = "chat";
        body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
        body.messageLimit = TASK_MESSAGE_INITIAL_LIMIT;
      }
    }
    const reasoningEffort = selectedComposerReasoningEffort(text);
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    const model = selectedComposerModel(text);
    if (model) body.model = model;
    const provider = selectedComposerProvider(text);
    if (provider) body.provider = provider;
    await refreshNativeEnvironmentSnapshotForSend();
    const environmentContext = await requestNativeEnvironmentContextForSend(body, text);
    if (environmentContext) body.environmentContext = environmentContext;
    const quotedReply = activeQuotedReplyForSend();
    if (quotedReply) {
      body.taskGroupId = quotedReply.taskGroupId;
      body.replyToMessageId = quotedReply.messageId;
    }
    createsNewTask = state.viewMode === "tasks" && !body.taskGroupId;
    consumedPendingDirectory = directoryTopicDraftSend && Boolean(state.pendingTaskDirectory?.projectId);
    if (createsNewTask) {
      const directory = directoryTopicDraftSend ? state.pendingTaskDirectory : null;
      if (directory?.projectId) body.directory = directory;
    }
    requestBody = body;
    const serializedBody = JSON.stringify(body);
    const sizeError = composerRequestSizeError(text, serializedBody);
    if (sizeError) {
      showError(new Error(sizeError));
      return;
    }
    setComposerText("");
    suppressComposerAutoFocus(1800);
    blurComposerInput();
    lockComposerSendToBottom();
    optimisticSend = appendOptimisticSendMessages(body, text);
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
      method: "POST",
      body: serializedBody,
      timeoutMs: COMPOSER_SEND_TIMEOUT_MS,
    });
    clearOptimisticSendMessages(optimisticSend, { render: false });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
    if (typeof commitPendingVoiceInputFinalText === "function") commitPendingVoiceInputFinalText(text, body);
  } catch (err) {
    const clearedOptimisticSend = clearOptimisticSendMessages(optimisticSend, { render: true });
    if (clearedOptimisticSend && typeof requestCurrentThreadRefresh === "function") {
      requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 500 });
    }
    if (shouldOfferOwnerElevation(err) && requestBody) {
      const prompt = ownerElevationConfirmMessage(err);
      const ok = await openOwnerElevationApprovalDialog({
        title: "Owner Approval",
        message: prompt,
        detail: err.elevationReason || "",
      });
      if (ok) {
        try {
          let onceToken = "";
          if (!ownerElevationActive()) {
            await activateOwnerElevationOnce({ confirm: false });
            onceToken = state.ownerElevationOnceToken;
            ownerElevationOnceRequested = true;
          }
          const elevatedBody = Object.assign({}, requestBody, {
            maintenanceMode: true,
            maintenance_mode: true,
            elevationScope: err.elevationScope || err.code || "shared_skill_write",
          });
          if (requestBody.chatGptProGenerate || requestBody.chatgpt_pro_generate) {
            elevatedBody.elevationScope = "chatgpt_pro_generate";
          }
          if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
          const serializedElevatedBody = JSON.stringify(elevatedBody);
          const elevatedSizeError = composerRequestSizeError(elevatedBody.text || "", serializedElevatedBody);
          if (elevatedSizeError) throw new Error(elevatedSizeError);
          const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
            method: "POST",
            body: serializedElevatedBody,
          });
          handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
          if (typeof commitPendingVoiceInputFinalText === "function") commitPendingVoiceInputFinalText(elevatedBody.text || "", elevatedBody);
          return;
        } catch (elevatedErr) {
          setComposerText(originalText);
          showError(elevatedErr);
          return;
        }
      }
      setComposerText(originalText);
      showError(new Error("已取消 Owner 提权，未执行这次越权请求。"));
      return;
    }
    setComposerText(originalText);
    showError(err);
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    state.composerSendInFlight = false;
    if (directoryTopicDraftSend) state.directoryTopicDraftSendInFlight = false;
    $("sendMessage").disabled = false;
    updateComposerAction();
  }
}

function optimisticSendTaskGroupId(body = {}) {
  if (body.taskGroupId) return body.taskGroupId;
  if (state.viewMode === "single" && state.singleWindowMode === "chat" && typeof activeChatTaskGroupId === "function") {
    return activeChatTaskGroupId();
  }
  return "";
}

function optimisticSendShouldAppendAssistant(body = {}) {
  return !(state.viewMode === "single" && state.singleWindowMode === "chat" && body.messageKind === "plain");
}

function appendOptimisticSendMessages(body = {}, text = "") {
  const thread = state.currentThread;
  if (!thread?.id || !Array.isArray(thread.messages)) return null;
  const nowMs = Date.now();
  const baseId = `local_send_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
  const taskGroupId = optimisticSendTaskGroupId(body);
  const messageKind = body.messageKind || "";
  const userMessage = {
    id: `${baseId}_user`,
    role: "user",
    content: text,
    status: "done",
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    taskGroupId,
    messageKind,
    localPendingSend: true,
    localPendingSendId: baseId,
  };
  const messages = [userMessage];
  if (optimisticSendShouldAppendAssistant(body)) {
    messages.push({
      id: `${baseId}_assistant`,
      role: "assistant",
      content: "",
      status: "queued",
      createdAt: new Date(nowMs + 1).toISOString(),
      updatedAt: new Date(nowMs + 1).toISOString(),
      queuedAt: new Date(nowMs + 1).toISOString(),
      taskGroupId,
      localRunProgressEvents: [{
        event: "run.request_preparing",
        timestamp: (nowMs + 1) / 1000,
        preview: "\u6b63\u5728\u51c6\u5907\u6a21\u578b\u56de\u590d",
      }],
      localPendingSend: true,
      localPendingSendId: baseId,
    });
  }
  const ids = new Set(messages.map((message) => message.id));
  thread.messages = [...thread.messages, ...messages];
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationViewportBottomFollowUntil = Date.now() + 5000;
  state.conversationViewportSettleUntil = Date.now() + 900;
  state.conversationPinnedToBottom = true;
  if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: true });
  if (typeof scheduleConversationBottomStick === "function" && typeof isSingleWindowChatView === "function" && isSingleWindowChatView()) {
    scheduleConversationBottomStick();
  }
  return { threadId: thread.id, ids };
}

function clearOptimisticSendMessages(token, options = {}) {
  if (!token?.ids?.size || !state.currentThread || state.currentThread.id !== token.threadId) return false;
  const before = state.currentThread.messages || [];
  const after = before.filter((message) => !token.ids.has(message.id));
  if (after.length === before.length) return false;
  state.currentThread.messages = after;
  if (options.render !== false && typeof renderCurrentThread === "function") {
    renderCurrentThread({ stickToBottom: true });
  }
  return true;
}

function lockComposerSendToBottom() {
  if (!conversationViewportRefreshApplies()) return;
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationViewportBottomFollowUntil = Date.now() + 5000;
  state.conversationViewportSettleUntil = Date.now() + 900;
  state.suppressChatAutoBottomUntil = 0;
  state.suppressConversationPinUntil = Date.now() + 700;
  state.conversationPinnedToBottom = true;
  requestAnimationFrame(() => {
    scrollConversationToBottom();
    requestAnimationFrame(scrollConversationToBottom);
  });
}

async function uploadFiles(files) {
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId || !files || !files.length) return;
  $("attachFile").disabled = true;
  $("connectionState").textContent = "Uploading";
  try {
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/uploads`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, type: file.type, dataBase64, workspaceId: state.selectedWorkspaceId || "owner" }),
      });
      if (result.artifact) state.pendingArtifacts.push(result.artifact);
    }
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Home AI OK";
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}
