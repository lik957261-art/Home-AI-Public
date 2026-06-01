"use strict";

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
  closeGroupMentionMenu();
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  try {
    const body = { text, artifacts: state.pendingArtifacts, workspaceId: state.selectedWorkspaceId };
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
    const quotedReply = activeQuotedReplyForSend();
    if (quotedReply) {
      body.taskGroupId = quotedReply.taskGroupId;
      body.replyToMessageId = quotedReply.messageId;
    }
    createsNewTask = state.viewMode === "tasks" && !body.taskGroupId;
    consumedPendingDirectory = Boolean(state.pendingTaskDirectory?.projectId);
    if (createsNewTask) {
      const directory = state.pendingTaskDirectory;
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
    lockComposerSendToBottom();
    const optimisticSend = appendOptimisticSendMessages(body, text);
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
      method: "POST",
      body: serializedBody,
    });
    clearOptimisticSendMessages(optimisticSend, { render: false });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
  } catch (err) {
    clearOptimisticSendMessages(typeof optimisticSend !== "undefined" ? optimisticSend : null, { render: true });
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
    $("connectionState").textContent = "Hermes OK";
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}
