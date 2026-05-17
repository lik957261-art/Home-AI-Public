"use strict";


function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  state.shouldStickToBottom = isNearBottom();
  state.preservedBottomOffset = conversation.scrollHeight - conversation.scrollTop;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    renderCurrentThread({ stickToBottom: state.shouldStickToBottom });
  });
}

function renderStreamingMessageContent(message) {
  if (!message?.id || message.role !== "assistant") return false;
  if (isChatSearchMode() && currentChatSearchQuery()) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  const content = body?.querySelector?.(".text-content");
  if (!article || !body || !content || message.revokedAt) return false;
  const shouldStick = isNearBottom();
  content.outerHTML = renderText(message.content || "", message);
  if (shouldStick) {
    const conversation = $("conversation");
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
  } else {
    state.conversationPinnedToBottom = false;
  }
  scheduleMessageScrollButtonVisibility($("conversation"));
  return true;
}

function scheduleStreamingMessageRender(message) {
  if (!message?.id) return false;
  const id = String(message.id);
  if (state.streamingMessageRenderScheduled.has(id)) return true;
  state.streamingMessageRenderScheduled.add(id);
  requestAnimationFrame(() => {
    state.streamingMessageRenderScheduled.delete(id);
    if (!renderStreamingMessageContent(message)) scheduleRenderCurrentThread();
  });
  return true;
}

function threadMatchesSelection(thread) {
  if (!thread) return false;
  if (
    state.selectedWorkspaceId
    && thread.workspaceId !== state.selectedWorkspaceId
    && !threadGroupMemberIds(thread).includes(state.selectedWorkspaceId)
  ) return false;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (!thread.singleWindow) return false;
    const search = currentSearchText().toLowerCase();
    if (state.viewMode === "tasks" && state.currentThread?.id === thread.id) {
      return taskListGroupsForThread(state.currentThread).some((group) => {
        if (!taskMatchesDirectoryFilter(group)) return false;
        if (!search) return true;
        return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
      });
    }
    if (!search) return true;
    return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
  }
  if (state.selectedProjectId && thread.projectId !== state.selectedProjectId) return false;
  if (state.selectedSubprojectId && (thread.subprojectId || "") !== state.selectedSubprojectId) return false;
  const search = currentSearchText().toLowerCase();
  if (!search) return true;
  return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
}

function upsertThreadSummary(thread) {
  if (!thread) return;
  const index = state.threads.findIndex((item) => item.id === thread.id);
  if (!threadMatchesSelection(thread)) {
    if (index >= 0) state.threads.splice(index, 1);
    renderThreads();
    return;
  }
  if (index >= 0) state.threads[index] = Object.assign({}, state.threads[index], thread);
  else state.threads.unshift(thread);
  state.threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  renderThreads();
}

function upsertMessage(message) {
  if (!state.currentThread || !message) return;
  const messages = state.currentThread.messages || [];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
  else messages.push(message);
  state.currentThread.messages = messages;
  if (state.viewMode === "tasks" && state.currentThread?.singleWindow && !currentTaskThreadIsSharedTopicThread()) {
    rememberTaskListThread(state.currentThread);
  }
  const mergedMessage = index >= 0 ? messages[index] : message;
  offerOwnerElevationForMessage(mergedMessage).catch(showError);
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function upsertCachedChatScopeMessage(threadId, message, threadSummary = null) {
  if (!threadId || !message) return false;
  let touched = false;
  const update = (thread) => {
    const messages = thread.messages || [];
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
    else messages.push(message);
    touched = true;
    return Object.assign({}, thread, threadSummary || {}, {
      messages: sortedThreadMessages(messages),
      updatedAt: threadSummary?.updatedAt || message.updatedAt || thread.updatedAt,
    });
  };
  if (state.groupChatThread?.id === threadId) {
    state.groupChatThread = update(state.groupChatThread);
    state.groupChatAvailable = true;
    state.groupChatThreadId = state.groupChatThread.id;
  }
  if (state.weixinChatThread?.id === threadId) {
    state.weixinChatThread = update(state.weixinChatThread);
    state.weixinChatAvailable = true;
    state.weixinChatThreadId = state.weixinChatThread.id;
  }
  if (state.privateChatThread?.id === threadId) {
    state.privateChatThread = update(state.privateChatThread);
  }
  if (touched && isSingleWindowChatView()) renderChatScopeHeader(state.currentThread);
  return touched;
}

function currentThreadHasPendingMessages(thread = state.currentThread) {
  return Boolean(
    thread
    && (
      activeThreadRunIds(thread).length
      || (thread.messages || []).some((message) => (
        message?.role === "assistant"
        && ["queued", "running"].includes(String(message.status || ""))
      ))
    )
  );
}

function summaryHasActiveRun(summary) {
  return Boolean(
    (Array.isArray(summary?.activeRunIds) && summary.activeRunIds.length)
    || summary?.activeRunId
    || ["queued", "running"].includes(String(summary?.status || ""))
  );
}

function shouldRefreshCurrentThreadForSummary(summary) {
  if (!summary || !state.currentThread || summary.id !== state.currentThread.id) return false;
  const summaryUpdated = String(summary.updatedAt || "");
  const currentUpdated = String(state.currentThread.updatedAt || "");
  if (summaryUpdated && currentUpdated && summaryUpdated > currentUpdated) return true;
  return currentThreadHasPendingMessages() && !summaryHasActiveRun(summary);
}

async function refreshCurrentThreadFromServer(options = {}) {
  const threadId = state.currentThreadId || state.currentThread?.id || "";
  if (!threadId || !["single", "tasks"].includes(state.viewMode)) return;
  if (state.currentThreadRefreshInFlight) {
    state.currentThreadRefreshPending = true;
    return;
  }
  state.currentThreadRefreshInFlight = true;
  state.currentThreadRefreshPending = false;
  const stickToBottom = Object.prototype.hasOwnProperty.call(options, "stickToBottom")
    ? Boolean(options.stickToBottom)
    : isNearBottom();
  try {
    const params = isSingleWindowChatView()
      ? `?${chatMessagePageParams({ limit: CHAT_MESSAGE_INITIAL_LIMIT })}`
      : isTaskWindowView()
        ? `?messageMode=tasks&messageLimit=${TASK_MESSAGE_INITIAL_LIMIT}`
      : "";
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}${params}`);
    if ((state.currentThreadId || state.currentThread?.id || "") !== threadId) return;
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || threadId;
    upsertThreadSummary(summarizeThread(state.currentThread));
    renderCurrentThread({ stickToBottom });
  } catch (err) {
    if (options.reportError) showError(err);
  } finally {
    state.currentThreadRefreshInFlight = false;
    if (state.currentThreadRefreshPending) {
      state.currentThreadRefreshPending = false;
      requestCurrentThreadRefresh(Object.assign({}, options, { delayMs: 180 }));
    }
  }
}

function requestCurrentThreadRefresh(options = {}) {
  if (!state.currentThreadId || !["single", "tasks"].includes(state.viewMode)) return;
  window.clearTimeout(state.currentThreadRefreshTimer);
  const delayMs = Math.max(0, Number(options.delayMs || 120));
  state.currentThreadRefreshTimer = window.setTimeout(() => {
    state.currentThreadRefreshTimer = 0;
    refreshCurrentThreadFromServer(options).catch(() => {});
  }, delayMs);
}

function appendDelta(threadId, messageId, delta, payload = {}) {
  if (!state.currentThread || state.currentThread.id !== threadId) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = payload.updatedAt || new Date().toISOString();
  message.content = `${message.content || ""}${delta || ""}`;
  if (!message.firstFeedbackAt) message.firstFeedbackAt = payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (!scheduleStreamingMessageRender(message)) scheduleRenderCurrentThread();
}

function applyEvent(payload) {
  if (!payload || !payload.type) return;
  if (payload.clientVersion) handleClientVersion(payload.clientVersion, payload.type);
  if (payload.type === "client.version") return;
  if (payload.type === "todos.updated") {
    if (state.viewMode === "todos" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadTodos().catch(showError);
    }
    return;
  }
  if (payload.type === "learning-coins.updated") {
    if (state.viewMode === "learning" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadLearningCoins({ limit: 30 }).catch(showError);
    }
    return;
  }
  if (payload.type === "snapshot") {
    const drafts = state.threads.filter(isDraftThread).filter(threadMatchesSelection);
    const incoming = (payload.threads || state.threads).filter(threadMatchesSelection);
    const currentSummary = incoming.find((thread) => thread.id === state.currentThreadId);
    state.threads = [
      ...drafts,
      ...incoming.filter((thread) => !drafts.some((draft) => draft.id === thread.id)),
    ];
    renderThreads();
    if (shouldRefreshCurrentThreadForSummary(currentSummary)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 80 });
    }
    return;
  }
  if (payload.thread) upsertThreadSummary(payload.thread);
  if (payload.type === "thread.updated" && state.currentThread && payload.thread?.id === state.currentThread.id) {
    state.currentThread = mergeCurrentThread(payload.thread);
    renderCurrentThread({ stickToBottom: false });
    if (shouldRefreshCurrentThreadForSummary(payload.thread)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 120 });
    }
    return;
  }
  if (payload.type === "message.delta") {
    appendDelta(payload.threadId, payload.messageId, payload.delta || "", payload);
    return;
  }
  if (payload.type === "run.event") {
    appendRunEventToCurrentThread(payload);
    return;
  }
  if (payload.type === "task.deleted" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    if (state.currentTaskGroupId === payload.taskGroupId) state.currentTaskGroupId = "";
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (payload.type === "task.renamed" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    renderThreads();
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  if (payload.message) upsertCachedChatScopeMessage(payload.threadId, payload.message, payload.thread);
  if (payload.message && state.currentThread && payload.threadId === state.currentThread.id) {
    upsertMessage(payload.message);
    if (payload.thread) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
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
  const aiMention = composerAiMentionInfo(text);
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
  closeGroupMentionMenu();
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  try {
    const body = { text, artifacts: state.pendingArtifacts, workspaceId: state.selectedWorkspaceId };
    if (ownerElevationActive() || ownerElevationOnceTag) {
      body.maintenanceMode = true;
      body.maintenance_mode = true;
      body.elevationScope = "owner_high_privilege";
      if (ownerElevationOnceTag) {
        body.ownerElevationOnceToken = state.ownerElevationOnceToken;
      }
    }
    if (state.viewMode === "single") {
      body.singleWindowMode = state.singleWindowMode === "chat" ? "chat" : "task";
      if (state.singleWindowMode === "chat") {
        body.taskGroupId = isGroupChatView()
          ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
          : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
        body.messageLimit = CHAT_MESSAGE_INITIAL_LIMIT;
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
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
      method: "POST",
      body: serializedBody,
    });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
  } catch (err) {
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function renderPendingArtifacts() {
  let panel = $("pendingArtifacts");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pendingArtifacts";
    panel.className = "pending-artifacts";
    $("composer").insertBefore(panel, $("messageInput"));
  }
  if (!state.pendingArtifacts.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    updateComposerAction();
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = state.pendingArtifacts.map((artifact, index) => `<button type="button" class="pending-artifact doc-${escapeHtml(artifactKind(artifact))}" data-remove-artifact="${index}">
    <span class="pending-artifact-icon" aria-hidden="true"></span>
    <span class="pending-artifact-name">${escapeHtml(artifact.name || artifact.id)}</span>
  </button>`).join("");
  panel.querySelectorAll("[data-remove-artifact]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingArtifacts.splice(Number(button.dataset.removeArtifact), 1);
      renderPendingArtifacts();
      updateComposerAction();
    });
  });
}

async function interruptRun() {
  if (!state.currentThreadId) return;
  const body = state.viewMode === "tasks" && state.currentTaskGroupId ? { taskGroupId: state.currentTaskGroupId } : {};
  await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/interrupt`, {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(showError);
}

function sidebarScrollTarget(target) {
  const sidebar = $("sidebar");
  if (!sidebar) return null;
  const element = target?.closest ? target : target?.parentElement;
  const threadList = element?.closest?.(".thread-list");
  if (threadList && threadList.scrollHeight > threadList.clientHeight + 1) return threadList;
  return sidebar;
}

function wireSidebarTouchScroll() {
  const sidebar = $("sidebar");
  if (!sidebar) return;
  let gesture = null;
  sidebar.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    gesture = {
      startY: event.touches[0].clientY,
      lastY: event.touches[0].clientY,
      target: sidebarScrollTarget(event.target),
    };
  }, { passive: true });
  sidebar.addEventListener("touchmove", (event) => {
    if (!gesture || !isMobileLayout() || event.touches.length !== 1) return;
    const x = event.touches[0].clientX;
    const dx = x - (state.sidebarSwipe?.startX ?? x);
    const dyFromSwipe = event.touches[0].clientY - (state.sidebarSwipe?.startY ?? event.touches[0].clientY);
    if (state.sidebarSwipe?.mode === "close" && Math.abs(dx) > Math.abs(dyFromSwipe) * 1.15 && Math.abs(dx) > 12) {
      return;
    }
    const y = event.touches[0].clientY;
    const delta = gesture.lastY - y;
    gesture.lastY = y;
    if (Math.abs(y - gesture.startY) < 2) return;
    const target = gesture.target || sidebarScrollTarget(event.target);
    if (!target) return;
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    if (maxScroll <= 1) return;
    const before = target.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, before + delta));
    if (next !== before) target.scrollTop = next;
    event.preventDefault();
  }, { passive: false });
  const end = () => {
    gesture = null;
  };
  sidebar.addEventListener("touchend", end, { passive: true });
  sidebar.addEventListener("touchcancel", end, { passive: true });
}

function wireSidebarSwipe() {
  const sidebar = $("sidebar");
  const edge = $("edgeSwipeZone");
  const overlay = $("sidebarOverlay");
  if (!sidebar || !edge) return;

  const startSwipe = (mode, event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (mode === "close" && !sidebar.classList.contains("open")) return;
    if (mode === "edge" && sidebar.classList.contains("open")) return;
    state.sidebarSwipe = {
      mode,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      lastX: event.touches[0].clientX,
      startedAt: performance.now(),
      width: sidebarDragWidth(sidebar),
      dragging: false,
      handled: false,
    };
  };

  const moveSwipe = (event) => {
    const swipe = state.sidebarSwipe;
    if (!swipe || !isMobileLayout() || event.touches.length !== 1 || swipe.handled) return;
    const x = event.touches[0].clientX;
    const y = event.touches[0].clientY;
    const dx = x - swipe.startX;
    const dy = y - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (horizontal < 18 || horizontal < vertical * 1.15) return;
    const target = swipe.mode === "edge" && dx > 0 ? backSwipeTarget() : "";
    if (target) {
      if (!swipe.backTarget) {
        swipe.backTarget = target;
        swipe.surface = backSwipeSurface(target);
        if (!swipe.surface) return;
      }
      swipe.dragging = true;
      swipe.lastX = x;
      applyBackSwipeDrag(swipe, dx);
      event.preventDefault();
      return;
    }
    const canDragSidebar = swipe.mode === "close" && dx < 0;
    if (!canDragSidebar) return;
    swipe.dragging = true;
    swipe.lastX = x;
    const width = swipe.width || sidebarDragWidth(sidebar);
    const progress = swipe.mode === "edge" ? dx / width : 1 + dx / width;
    swipe.lastProgress = clamp01(progress);
    applySidebarDragProgress(swipe.lastProgress);
    event.preventDefault();
  };

  const endSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (!swipe?.dragging) return;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const dx = (swipe.lastX || swipe.startX) - swipe.startX;
    const velocity = dx / elapsed;
    if (swipe.backTarget) {
      const accepted = (swipe.progress || 0) > 0.34 || velocity > 0.55;
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        if (accepted) navigateDirectoryUp({ exitShell: swipe.surface, animateEntry: true }).catch(showError);
        else settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      } else {
        settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, accepted);
      }
      return;
    }
    const progress = clamp01(swipe.lastProgress);
    if (swipe.mode === "edge") {
      settleSidebarDrag(progress > 0.38 || velocity > 0.55);
    } else if (swipe.mode === "close") {
      settleSidebarDrag(!(progress < 0.7 || velocity < -0.55));
    } else {
      clearSidebarDragStyles();
    }
  };

  const cancelSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (swipe?.backTarget) {
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      }
      else settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, false);
      return;
    }
    if (swipe?.dragging) {
      settleSidebarDrag(swipe.mode === "close");
    } else {
      clearSidebarDragStyles();
    }
  };

  const startEdgeSwipe = (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (edge.classList.contains("disabled")) return;
    if (event.touches[0].clientX > EDGE_SWIPE_HIT_PX) return;
    event.preventDefault();
    state.sidebarSwipe = null;
  };
  const moveEdgeSwipe = (event) => {
    if (state.sidebarSwipe?.mode === "edge") moveSwipe(event);
  };
  const endEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") endSwipe();
  };
  const cancelEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") cancelSwipe();
  };

  document.addEventListener("touchstart", startEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchmove", moveEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchend", endEdgeSwipe, { passive: true, capture: true });
  document.addEventListener("touchcancel", cancelEdgeSwipe, { passive: true, capture: true });

  sidebar.addEventListener("touchstart", (event) => startSwipe("close", event), { passive: true });
  sidebar.addEventListener("touchmove", moveSwipe, { passive: false });
  sidebar.addEventListener("touchend", endSwipe, { passive: true });
  sidebar.addEventListener("touchcancel", cancelSwipe, { passive: true });

  overlay?.addEventListener("click", closeSidebar);
}

function wireRightSwipeGuard() {
  if (document.documentElement.dataset.rightSwipeGuardBound) return;
  document.documentElement.dataset.rightSwipeGuardBound = "1";
  let touch = null;
  const interactiveSelector = ".sidebar, .directory-shell, input, select, textarea, [contenteditable='true']";
  const clear = () => {
    touch = null;
  };
  document.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    const target = backSwipeTarget();
    touch = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      blocked: point.clientX <= EDGE_SWIPE_HIT_PX,
      accepted: false,
      target,
      surface: target ? backSwipeSurface(target) : document.querySelector(".main"),
    };
    if (touch.blocked) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("touchmove", (event) => {
    if (!touch || !isMobileLayout() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - touch.startX;
    const dy = point.clientY - touch.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!touch.blocked && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    touch.blocked = true;
    touch.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (touch.startedAt || performance.now()));
    const velocity = dx / elapsed;
    touch.accepted = dx > 58 || velocity > 0.55;
    if (touch.surface) applyBackSwipeDrag(touch, dx);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false, capture: true });
  document.addEventListener("touchend", () => {
    const current = touch;
    clear();
    if (!current?.blocked || !isMobileLayout()) return;
    if (current.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
    if (!current.accepted || !current.target) return;
    handleInAppBackNavigation({ animateEntry: true }).catch(showError);
  }, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => {
    const current = touch;
    clear();
    if (current?.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
  }, { passive: true, capture: true });
}

function showError(err) {
  $("connectionState").textContent = err.message || String(err);
}

function handleSendMessageResult(result, createsNewTask, consumedPendingDirectory) {
  state.pendingArtifacts = [];
  if (createsNewTask) {
    state.pendingTaskDirectory = null;
    if (consumedPendingDirectory) state.taskDirectoryFilter = null;
  }
  if (state.viewMode === "tasks") state.pendingTaskReasoningEffort = "";
  if (state.viewMode === "tasks") state.pendingTaskReasoningExplicit = false;
  clearQuotedReply({ render: false });
  renderPendingArtifacts();
  state.currentThread = mergeCurrentThread(result.thread);
  if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
    const latestUser = [...(state.currentThread?.messages || [])].reverse().find((message) => message.role === "user");
    state.currentTaskGroupId = latestUser?.taskGroupId || "";
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  suppressComposerAutoFocus(1200);
  blurComposerInput();
}

function shouldOfferOwnerElevation(err) {
  return Boolean(err?.elevationRequired && state.auth?.isOwner);
}

function shouldOfferOwnerElevationForMessage(message) {
  if (!message?.elevationRequired) return false;
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return false;
  const status = String(message.status || "");
  if (status === "queued" || status === "running") return false;
  if (!state.currentThreadId && !state.currentThread?.id) return false;
  if (state.ownerElevationRetryingMessageIds.has(message.id)) return false;
  return true;
}

async function offerOwnerElevationForMessage(message) {
  if (!shouldOfferOwnerElevationForMessage(message)) return false;
  const messageId = String(message.id || "");
  if (!messageId || state.ownerElevationPromptedMessageIds.has(messageId)) return false;
  state.ownerElevationPromptedMessageIds.add(messageId);
  const ok = await openOwnerElevationApprovalDialog({
    title: "Owner Approval",
    message: ownerElevationConfirmMessage(message),
    detail: message.elevationReason || "",
  });
  if (!ok) return false;
  state.ownerElevationRetryingMessageIds.add(messageId);
  let ownerElevationOnceRequested = false;
  try {
    let onceToken = "";
    if (!ownerElevationActive()) {
      await activateOwnerElevationOnce({ confirm: false });
      onceToken = state.ownerElevationOnceToken;
      ownerElevationOnceRequested = true;
    }
    const threadId = state.currentThreadId || state.currentThread?.id || "";
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/owner-elevation`, {
      method: "POST",
      body: JSON.stringify({
        elevationScope: message.elevationScope || "owner_high_privilege",
        ownerElevationOnceToken: onceToken,
      }),
    });
    if (result.thread) {
      state.currentThread = mergeCurrentThread(result.thread);
      state.currentThreadId = state.currentThread?.id || threadId;
      upsertThreadSummary(summarizeThread(state.currentThread));
      renderCurrentThread({ stickToBottom: true });
    }
    showPushToast("已批准高权限重跑", "success");
    return true;
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    state.ownerElevationRetryingMessageIds.delete(messageId);
  }
}

function ownerElevationConfirmMessage(err) {
  const scope = String(err?.elevationScope || err?.code || "").trim();
  if (scope === "automation_admin_write") {
    return "这次请求会修改其他账号的自动化任务，需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "shared_skill_write") {
    return "这次操作需要写入共享或系统级 Skill。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "owner_high_privilege" || scope === "owner_high_privilege_required") {
    return "这次请求需要 Owner 高权限运行。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  return "这次请求需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
}

function getComposerText() {
  const input = $("messageInput");
  if (input && "value" in input) return String(input.value || "").replace(/\u00a0/g, " ");
  return String(input?.innerText || "").replace(/\u00a0/g, " ");
}

function utf8ByteLength(text) {
  const value = String(text || "");
  if (!value) return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
  if (typeof Blob === "function") return new Blob([value]).size;
  return unescape(encodeURIComponent(value)).length;
}

function composerRequestSizeError(text, serializedBody) {
  if (String(text || "").length > COMPOSER_MAX_TEXT_CHARS) {
    return "内容太长，单条消息最多约 24 万字，请拆成几条发送，或作为文件上传。";
  }
  if (utf8ByteLength(serializedBody) > COMPOSER_MAX_BODY_BYTES) {
    return "内容太长，当前消息包超过发送上限，请拆成几条发送，或作为文件上传。";
  }
  return "";
}

function clearComposerSendAfterCompositionFallback() {
  if (!state.composerSendAfterCompositionTimer) return;
  clearTimeout(state.composerSendAfterCompositionTimer);
  state.composerSendAfterCompositionTimer = null;
}

function scheduleComposerSendAfterCompositionFallback() {
  clearComposerSendAfterCompositionFallback();
  state.composerSendAfterCompositionTimer = setTimeout(() => {
    state.composerSendAfterCompositionTimer = null;
    if (!state.composerSendAfterComposition) return;
    state.composerComposing = false;
    state.composerSendAfterComposition = false;
    updateComposerAction();
    updateGroupMentionMenu();
    void sendMessage();
  }, 450);
}

function setComposerText(text) {
  const input = $("messageInput");
  if (!input) return;
  if ("value" in input) input.value = text || "";
  else input.textContent = text || "";
  autoSizeComposerEditor(input);
  updateComposerAction();
}

function composerCaretOffset() {
  const input = $("messageInput");
  if (input && typeof input.selectionStart === "number") return input.selectionStart;
  const selection = window.getSelection?.();
  if (!input || !selection || !selection.rangeCount) return getComposerText().length;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.endContainer)) return getComposerText().length;
  const before = document.createRange();
  before.selectNodeContents(input);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function setComposerCaretOffset(offset) {
  const input = $("messageInput");
  if (!input) return;
  const target = Math.max(0, Number(offset) || 0);
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(target, target);
    return;
  }
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();
  const selection = window.getSelection?.();
  const range = document.createRange();
  while (node) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ownerElevationComposerAvailable() {
  if (isChatSearchMode()) return false;
  return Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner" && (state.viewMode === "single" || state.viewMode === "tasks"));
}

function ownerElevationMentionOptions() {
  if (!ownerElevationComposerAvailable()) return [];
  return [{
    workspaceId: "owner-elevation-once",
    label: "高权限本次",
    virtual: true,
    mentionText: "#高权限本次",
    description: "只授权当前这一条 Owner 消息",
    ownerElevationOnce: true,
  }];
}

function ownerElevationTagPattern() {
  return /(^|[\s([{,.;:!?\u3000\uff08\uff3b\u3010\uff0c\u3002\uff1b\uff1a\uff01\uff1f])[#\uff03]\s*(?:高权限|高權限|owner[-_\s]?high[-_\s]?privilege|high[-_\s]?privilege)\s*(?:本次|once)?/gi;
}

function ownerElevationOnceTagInfo(text) {
  return ownerElevationTagPattern().test(String(text || "")) ? { present: true } : null;
}

function stripOwnerElevationOnceTags(text) {
  return String(text || "")
    .replace(ownerElevationTagPattern(), (match, prefix = "") => prefix)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function composerMentionAvailable() {
  if (isChatSearchMode()) return false;
  return state.viewMode === "single" || state.viewMode === "tasks";
}

function composerMentionMembers() {
  const groupMembers = isGroupChatView() ? groupChatMentionMembers(state.currentThread, { includeAi: false }) : [];
  return [...composerAiMentionOptions(), ...groupMembers];
}

function activeGroupMentionToken() {
  if (!composerMentionAvailable()) return null;
  const text = getComposerText();
  const caret = composerCaretOffset();
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("\uff20"));
  const hash = ownerElevationComposerAvailable()
    ? Math.max(before.lastIndexOf("#"), before.lastIndexOf("\uff03"))
    : -1;
  const start = Math.max(at, hash);
  if (start < 0) return null;
  const trigger = start === hash ? "#" : "@";
  const previous = start > 0 ? before[start - 1] : "";
  if (previous && !/[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?，。；：！？、]/.test(previous)) return null;
  const query = before.slice(start + 1);
  if (/[\s\r\n@\uff20#\uff03]/.test(query) || query.length > 40) return null;
  return { start, end: caret, query, trigger };
}

function mentionOptionsForQuery(query, members = composerMentionMembers()) {
  const needle = normalizeMentionSearch(query);
  return members.filter((member) => {
    if (!needle) return true;
    return normalizeMentionSearch(member.label).includes(needle)
      || normalizeMentionSearch(member.workspaceId).includes(needle)
      || normalizeMentionSearch(member.description).includes(needle)
      || normalizeMentionSearch(member.mentionText).includes(needle)
      || normalizeMentionSearch(member.reasoningEffort).includes(needle);
  }).slice(0, 8);
}

function closeGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  state.groupMentionOpen = false;
  state.groupMentionOptions = [];
  state.groupMentionIndex = 0;
  state.groupMentionToken = null;
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function renderGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  if (!menu) return;
  const token = activeGroupMentionToken();
  if (!token) {
    closeGroupMentionMenu();
    return;
  }
  const options = token.trigger === "#"
    ? mentionOptionsForQuery(token.query, ownerElevationMentionOptions())
    : mentionOptionsForQuery(token.query);
  if (!options.length) {
    closeGroupMentionMenu();
    return;
  }
  state.groupMentionOpen = true;
  state.groupMentionOptions = options;
  state.groupMentionToken = token;
  state.groupMentionIndex = Math.min(Math.max(0, state.groupMentionIndex), options.length - 1);
  menu.hidden = false;
  menu.innerHTML = options.map((member, index) => `
    <button class="group-mention-option${index === state.groupMentionIndex ? " active" : ""}" type="button" data-group-mention-index="${index}">
      <span class="group-mention-name">${escapeHtml(member.mentionText || `@${member.label}`)}</span>
    </button>`).join("");
}

function moveGroupMentionSelection(delta) {
  if (!state.groupMentionOpen || !state.groupMentionOptions.length) return;
  const total = state.groupMentionOptions.length;
  state.groupMentionIndex = (state.groupMentionIndex + delta + total) % total;
  renderGroupMentionMenu();
}

async function chooseGroupMention(index = state.groupMentionIndex) {
  if (!state.groupMentionOpen || !state.groupMentionToken) return false;
  const member = state.groupMentionOptions[index] || state.groupMentionOptions[0];
  if (!member) return false;
  if (member.ownerElevationOnce) clearOwnerElevationOnce();
  const token = state.groupMentionToken;
  const text = getComposerText();
  const insertion = `${String(member.mentionText || `@${member.label}`).trimEnd()} `;
  const next = `${text.slice(0, token.start)}${insertion}${text.slice(token.end)}`;
  setComposerText(next);
  $("messageInput")?.focus({ preventScroll: true });
  setComposerCaretOffset(token.start + insertion.length);
  closeGroupMentionMenu();
  updateComposerAction();
  return true;
}

function updateGroupMentionMenu() {
  if (!composerMentionAvailable()) {
    closeGroupMentionMenu();
    return;
  }
  renderGroupMentionMenu();
}

function autoSizeComposerEditor(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  const input = $("messageInput");
  if (input && typeof input.setRangeText === "function") {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

function handleComposerKeydown(event) {
  if (composerMentionAvailable() && state.groupMentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGroupMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGroupMentionSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeGroupMentionMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      void chooseGroupMention();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  void sendMessage();
}

function wireUi() {
  wireBackNavigationGuard();
  wireSidebarTouchScroll();
  wireRightSwipeGuard();
  wireSidebarSwipe();
  wireConversationScrollFeedback();
  $("refreshNow")?.addEventListener("click", reloadForClientUpdate);
  $("refreshLater")?.addEventListener("click", () => {
    state.refreshNoticeDismissedVersion = state.serverClientVersion;
    hideRefreshNotice();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleAppBackgrounded();
      return;
    }
    handleAppForegrounded();
    checkClientVersion("visible").catch(() => {});
  });
  window.addEventListener("pagehide", handleAppBackgrounded);
  window.addEventListener("pageshow", handleAppForegrounded);
  window.addEventListener("focus", () => {
    handleAppForegrounded();
    checkClientVersion("focus").catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.pwaInstallPrompt = event;
    updateTopMoreControls();
    renderPwaInstallOverlay();
  });
  window.addEventListener("appinstalled", () => {
    state.pwaInstalled = true;
    state.pwaInstallPrompt = null;
    closePwaInstall();
    updateTopMoreControls();
    showPushToast("Hermes Mobile 已安装。", "success");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "hermes.notification.open") {
        openNotificationRoute(event.data.url || event.data.data?.url || "/").catch(showError);
        return;
      }
      if (event.data?.type === "hermes.push.received") {
        handleForegroundPushMessage(event.data);
        checkClientVersion("push").catch(() => {});
      }
    });
  }
  $("setupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOwnerSetup().catch((err) => {
      state.setupError = err.message || String(err);
      renderSetup();
    });
  });
  $("copySetupKey")?.addEventListener("click", () => copyTextToClipboard(state.setupOwnerKey || "").catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("enterAfterSetup")?.addEventListener("click", () => enterAfterSetup().catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("loginKey").value.trim()).catch((err) => showLogin(err.message));
  });
  $("workspaceSelect").addEventListener("change", async (event) => {
    clearQuotedReply({ render: false });
    clearTaskDirectoryFilter({ render: false });
    state.selectedWorkspaceId = event.target.value;
    state.privateChatThread = null;
    state.weixinChatThread = null;
    state.weixinChatThreadId = "";
    state.weixinChatAvailable = false;
    state.groupChatThread = null;
    state.groupChatThreadId = "";
    state.groupChatAvailable = false;
    resetLearningCoinsState();
    localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
    renderWorkspaceAccessPanel();
    state.directoryThreadId = "";
    state.directoryThreadWorkspaceId = "";
    await loadProjects();
    resetDirectoryPath();
    await loadSelectedView();
    syncPushSubscriptionContext().catch(() => {});
  });
  $("projectSelect").addEventListener("change", async (event) => {
    state.selectedProjectId = event.target.value;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    renderSubprojects();
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("subprojectSelect").addEventListener("change", async (event) => {
    persistSelectedSubproject(event.target.value);
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("taskManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    if (!(state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task"))) {
      state.viewMode = "tasks";
      localStorage.setItem("hermesWebViewMode", state.viewMode);
      state.currentTaskGroupId = "";
      await loadSelectedView();
    }
  });
  $("chatManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomTasksMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomChatMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleTaskMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("task");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("tasksMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("projectsMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomProjectsMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("automationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomAutomationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("learningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomLearningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("todosMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomTodosMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("threadSearch").addEventListener("input", () => {
    updateSearchButton();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadSelectedView().catch(showError), 250);
  });
  $("workspaceEntry")?.addEventListener("click", focusWorkspaceEntry);
  $("directoryEntry").addEventListener("click", () => {
    openCurrentDirectoryEntry().catch(showError);
  });
  $("topInstallPwa")?.addEventListener("click", openPwaInstall);
  $("newThread").addEventListener("click", () => createThread().catch(showError));
  $("pushToggle").addEventListener("click", () => handlePushButton().catch(showError));
  $("topMoreButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("topMoreMenu");
    const button = $("topMoreButton");
    if (!menu || !button) return;
    const open = Boolean(menu.hidden);
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("topMoreMenu")?.addEventListener("click", (event) => event.stopPropagation());
  $("topToggleTaskView")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    if (isSingleWindowView()) {
      state.viewMode = "tasks";
    } else {
      state.viewMode = "single";
      setSingleWindowMode("task");
    }
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    await loadSelectedView();
  });
  $("topToggleSingleMode")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    setSingleWindowMode(state.singleWindowMode === "chat" ? "task" : "chat");
    await loadSelectedView();
  });
  $("topClearDirectoryFilter")?.addEventListener("click", () => {
    clearTaskDirectoryFilter();
  });
  $("topManageAccessKeys")?.addEventListener("click", () => {
    openAccessKeyManager({ workspaceId: state.selectedWorkspaceId }).catch(showError);
  });
  $("topNewDirectoryFolder")?.addEventListener("click", () => {
    closeTopMoreMenu();
    createDirectoryFolder().catch(showError);
  });
  $("topManageSharedDirectories")?.addEventListener("click", () => {
    openSharedDirectoryManager().catch(showError);
  });
  $("topNewTodo")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openTodoCreate();
  });
  $("topNewAutomation")?.addEventListener("click", () => {
    openAutomationCreate();
  });
  $("topEditAutomation")?.addEventListener("click", () => {
    openAutomationEdit();
  });
  $("topToggleAutomationPause")?.addEventListener("click", () => {
    toggleAutomationPause().catch(showError);
  });
  $("topDeleteAutomation")?.addEventListener("click", () => {
    deleteAutomationJob().catch(showError);
  });
  $("topDeleteTodo")?.addEventListener("click", () => {
    deleteTodo(state.selectedTodoId).catch(showError);
  });
  $("topRenameTask")?.addEventListener("click", () => {
    closeTopMoreMenu();
    renameTaskGroup(state.currentTaskGroupId).catch(showError);
  });
  $("topSearchChat")?.addEventListener("click", () => {
    openChatSearch();
  });
  $("topToggleGroupChat")?.addEventListener("click", () => {
    toggleGroupChat().catch(showError);
  });
  $("topToggleWeixinChat")?.addEventListener("click", () => {
    toggleWeixinChat().catch(showError);
  });
  $("topManageGroupMembers")?.addEventListener("click", () => {
    openGroupChatMembers().catch(showError);
  });
  $("topToggleReadingFullscreen")?.addEventListener("click", () => {
    setReadingFullscreen(!state.readingFullscreen);
  });
  $("readingFullscreenExit")?.addEventListener("click", () => {
    setReadingFullscreen(false);
  });
  $("readingFullscreenEnter")?.addEventListener("click", () => {
    setReadingFullscreen(true);
  });
  $("topSettingsButton")?.addEventListener("click", openSettings);
  $("clientVersion")?.addEventListener("click", applyAppUpdateFromBadge);
  document.addEventListener("click", closeTopMoreMenu);
  document.addEventListener("click", () => closeTaskCardMenus());
  document.addEventListener("click", () => closeDirectoryEntryMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.readingFullscreen) setReadingFullscreen(false);
  });
  $("openMenu").addEventListener("click", (event) => handleTopNavActivation(event));
  $("closeMenu").addEventListener("click", closeSidebar);
  $("sidebarBack")?.addEventListener("click", sidebarBackToMenu);
  $("sendMessage").addEventListener("click", () => void sendMessage());
  $("groupMentionMenu")?.addEventListener("pointerdown", (event) => {
    const option = event.target.closest?.("[data-group-mention-index]");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    suppressTransientActivations(700);
    void chooseGroupMention(Number(option.dataset.groupMentionIndex || 0));
  });
  $("groupMentionMenu")?.addEventListener("pointerup", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("groupMentionMenu")?.addEventListener("touchend", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true, passive: false });
  $("groupMentionMenu")?.addEventListener("click", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("interruptRun").addEventListener("click", interruptRun);
  $("messageInput").addEventListener("input", (event) => {
    autoSizeComposerEditor(event.target);
    if (isChatSearchMode()) updateChatSearchDraft(getComposerText());
    else {
      updateComposerAction();
      updateGroupMentionMenu();
    }
  });
  $("messageInput").addEventListener("keydown", handleComposerKeydown);
  $("messageInput").addEventListener("paste", pastePlainText);
  $("messageInput").addEventListener("compositionstart", () => {
    state.composerComposing = true;
  });
  $("messageInput").addEventListener("compositionend", () => {
    state.composerComposing = false;
    clearComposerSendAfterCompositionFallback();
    updateComposerAction();
    updateGroupMentionMenu();
    if (state.composerSendAfterComposition) {
      state.composerSendAfterComposition = false;
      setTimeout(() => void sendMessage(), 0);
    }
  });
  $("messageInput").addEventListener("focus", () => {
    state.composerFocused = true;
    refreshKeyboardViewportDuringFocus();
    refreshComposerContextSoon(0);
    refreshComposerContextSoon(160);
    refreshComposerContextSoon(360);
  });
  $("messageInput").addEventListener("blur", () => {
    state.composerFocused = false;
    refreshKeyboardViewportSoon(80);
    refreshKeyboardViewportSoon(260);
    refreshComposerContextSoon(80);
  });
  $("conversation")?.addEventListener("scroll", handleConversationScrollState, { passive: true });
  navigator.virtualKeyboard?.addEventListener("geometrychange", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("resize", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("scroll", handleViewportLayoutChange);
  window.addEventListener("resize", handleViewportLayoutChange);
  window.addEventListener("orientationchange", handleViewportLayoutChange);
  window.screen?.orientation?.addEventListener?.("change", handleViewportLayoutChange);
  document.addEventListener("pointerdown", (event) => {
    if (!state.groupMentionOpen) return;
    if ($("composer")?.contains(event.target)) return;
    closeGroupMentionMenu();
  });
  document.addEventListener("click", (event) => {
    suppressTransientActivationEvent(event);
  }, { capture: true });
  document.addEventListener("pointerup", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (event.pointerType === "mouse") return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true });
  document.addEventListener("touchend", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (window.PointerEvent) return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true, passive: false });
  $("attachFile").addEventListener("click", (event) => {
    if ($("attachFile").dataset.searchCloseHandled === "1") {
      delete $("attachFile").dataset.searchCloseHandled;
      event.preventDefault();
      return;
    }
    handleAttachFileActivation(event);
  });
  $("chatSearchPrev")?.addEventListener("click", () => moveChatSearch(-1));
  $("chatSearchNext")?.addEventListener("click", () => moveChatSearch(1));
  $("fileInput").addEventListener("change", (event) => {
    const input = event.target;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    uploadFiles(files).catch(showError);
  });
}

async function start() {
  applyFontFamilyPreference();
  applyFontSizePreference();
  wireUi();
  state.pwaInstalled = isStandalonePwa();
  ensurePwaServiceWorker({ timeoutMs: 8000 }).catch(() => {});
  showBootSplash("正在连接 Hermes Mobile");
  try {
    const config = await fetch("/api/public-config").then((res) => res.json());
    state.setupRequired = Boolean(config.setupRequired);
    if (state.setupRequired) {
      showSetup();
      return;
    }
    if (config.authRequired && !state.key) {
      if (!(await hasCookieSession().catch(() => false))) {
        showLogin();
        return;
      }
    }
    setBootSplashText("正在载入工作区");
    await bootstrap();
    showApp();
  } catch (err) {
    showError(err);
    if (/unauthorized/i.test(err.message)) showLogin();
    else showApp();
  }
}
