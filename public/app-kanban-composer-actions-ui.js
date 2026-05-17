"use strict";

function pushKanbanComposerMessage(role, content) {
  state.kanbanComposerMessages.push({
    id: `kanban-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: String(content || ""),
    at: new Date().toISOString(),
  });
  state.kanbanComposerMessages = state.kanbanComposerMessages.slice(-20);
}

function kanbanPlanSummaryText(plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const firstWave = cards.filter((card) => card.initialRunnable).length;
  const maxParallel = normalizeKanbanComposerMaxParallel(plan?.maxParallel || state.kanbanComposerMaxParallel);
  return `\u5df2\u751f\u6210 ${cards.length} \u5f20\u5361\u7247\u7684\u591a Agent \u62c6\u89e3\u8349\u6848\uff1b\u9996\u6279\u6267\u884c ${firstWave}\uff0c\u6700\u5927\u5e76\u884c ${maxParallel}\u3002`;
}

async function uploadKanbanComposerDocument(file) {
  if (!file) return;
  if (state.kanbanComposerDocumentUploading) return;
  state.kanbanComposerDocumentUploading = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const dataBase64 = await fileToBase64(file);
    const result = await api("/api/kanban/cards/document-preview", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        filename: file.name || "kanban-source.txt",
        type: file.type || "",
        dataBase64,
      }),
    });
    const doc = result.document || {};
    state.kanbanComposerDocuments = [
      ...(state.kanbanComposerDocuments || []),
      {
        name: doc.name || file.name || "kanban-source",
        mime: doc.mime || file.type || "",
        kind: doc.kind || "",
        size: doc.size || file.size || 0,
        text: result.text || "",
        totalChars: result.totalChars || 0,
        truncated: Boolean(result.truncated),
      },
    ];
    showPushToast("\u6587\u6863\u5df2\u89e3\u6790\uff0c\u5c06\u4f5c\u4e3a\u770b\u677f\u9700\u6c42\u4e0a\u4e0b\u6587", "success");
  } finally {
    state.kanbanComposerDocumentUploading = false;
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function submitKanbanComposer(root) {
  if (state.kanbanComposerBusy || state.kanbanPlanCreating) return;
  const input = root.querySelector("#kanbanComposerText");
  const rawText = String(input?.value || state.kanbanComposerText || "").trim();
  const text = kanbanComposerSubmissionText(rawText);
  const mode = kanbanComposerMode();
  const multiAgent = mode === "multi";
  const studyPlan = mode === "study";
  const assessmentPlan = mode === "assessment";
  if (!text && !studyPlan && !assessmentPlan) throw new Error("????????");
  if (studyPlan) syncKanbanReadingDraftFromDom(root);
  if (assessmentPlan) syncKanbanAssessmentDraftFromDom(root);
  const programmingStudyAssessment = studyPlan && isKanbanProgrammingStudyTemplate(state.kanbanReadingDraft?.studyTemplate);
  if (studyPlan && !String(state.kanbanReadingDraft?.activityTitle || state.kanbanReadingDraft?.bookTitle || "").trim()) throw new Error("????????");
  if (assessmentPlan && !String(state.kanbanAssessmentDraft?.planTitle || state.kanbanAssessmentDraft?.subject || "").trim()) throw new Error("????????");
  const maxParallel = saveKanbanComposerMaxParallel(root.querySelector("#kanbanComposerMaxParallel")?.value || state.kanbanComposerMaxParallel);
  const reasoningEffort = saveKanbanComposerReasoningEffort(root.querySelector("#kanbanComposerReasoningEffort")?.value || state.kanbanComposerReasoningEffort);
  const documentNames = (state.kanbanComposerDocuments || []).map((item) => item.name).filter(Boolean).join(", ");
  state.kanbanComposerText = rawText;
  if (rawText) localStorage.setItem("hermesKanbanComposerDraft", rawText);
  else localStorage.removeItem("hermesKanbanComposerDraft");
  saveKanbanComposerMode(mode);
  state.kanbanComposerBusy = true;
  state.kanbanPlanDraft = null;
  pushKanbanComposerMessage("user", studyPlan
    ? `${state.kanbanReadingDraft.activityTitle || state.kanbanReadingDraft.bookTitle || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim()
    : (assessmentPlan ? `${state.kanbanAssessmentDraft.planTitle || state.kanbanAssessmentDraft.subject || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim() : (rawText || (documentNames ? `Documents: ${documentNames}` : text))));
  beginKanbanComposerProgress((assessmentPlan || programmingStudyAssessment) ? "assessment" : (studyPlan ? "reading" : (multiAgent ? "plan" : "create")));
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    if (assessmentPlan || programmingStudyAssessment) {
      const draft = programmingStudyAssessment
        ? programmingAssessmentDraftFromStudyDraft(state.kanbanReadingDraft || {})
        : Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/assessment-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          subject: draft.subject,
          learnerName: draft.learnerName,
          courseLevel: draft.courseLevel,
          title: draft.planTitle,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          scheduleFrequency: draft.scheduleFrequency,
          scheduleWeekdays: draft.scheduleWeekdays,
          scheduleMonthDay: draft.scheduleMonthDay,
          sourceText: text,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ??????????????????`);
      state.kanbanComposerText = "";
      if (programmingStudyAssessment) state.kanbanReadingDraft = defaultKanbanReadingDraft();
      else state.kanbanAssessmentDraft = defaultKanbanAssessmentDraft();
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem(programmingStudyAssessment ? "hermesKanbanReadingDraft" : "hermesKanbanAssessmentDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (studyPlan) {
      const coverFile = state.kanbanReadingCoverFile;
      const coverImage = coverFile
        ? {
          filename: coverFile.name || "book-cover.jpg",
          mime: coverFile.type || "",
          dataBase64: await fileToBase64(coverFile),
        }
        : null;
      const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
      const activityTitle = String(draft.activityTitle || draft.bookTitle || "").trim();
      const learnerName = String(draft.learnerName || draft.readerName || "").trim();
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/study-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          caseMode: "study-plan",
          studyTemplate: String(draft.studyTemplate || "").trim() === "custom" ? "custom" : "reading",
          bookTitle: activityTitle,
          readerName: learnerName,
          activityTitle,
          learnerName,
          target: learnerName,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          sourceText: text,
          coverImage,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ???????????????????????????????`);
      state.kanbanComposerText = "";
      state.kanbanReadingDraft = defaultKanbanReadingDraft();
      clearKanbanComposerDocuments();
      setKanbanReadingCoverFile(null);
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem("hermesKanbanReadingDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (multiAgent) {
      const result = await api("/api/kanban/cards/plan", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          text,
          maxParallel,
          reasoning_effort: reasoningEffort,
        }),
      });
      state.kanbanPlanDraft = result.plan || null;
      pushKanbanComposerMessage("assistant", kanbanPlanSummaryText(state.kanbanPlanDraft));
      finishKanbanComposerProgress();
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    } else {
      const singleContent = rawText || (documentNames ? `Create Kanban task from document: ${documentNames}` : text);
      const result = await api(boardCollectionApiPath(), {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          assignee: defaultTodoAssignee(),
          content: singleContent,
          description: text,
          sourceText: text,
        }),
      });
      const card = result.card || result.todo || result.result || {};
      pushKanbanComposerMessage("assistant", `????????${card.id || ""} ${card.content || text}`.trim());
      state.kanbanComposerText = "";
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = "todo";
      localStorage.setItem("hermesTodoKanbanStatus", "todo");
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true });
    }
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `???????${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanComposerBusy = false;
    if (!state.kanbanPlanCreating) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function createKanbanPlanFromDraft() {
  if (!state.kanbanPlanDraft || state.kanbanPlanCreating) return;
  state.kanbanPlanCreating = true;
  beginKanbanComposerProgress("create");
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api("/api/kanban/cards/batch", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        plan: state.kanbanPlanDraft,
        maxParallel: normalizeKanbanComposerMaxParallel(state.kanbanPlanDraft?.maxParallel || state.kanbanComposerMaxParallel),
        reasoning_effort: state.kanbanPlanDraft?.reasoningEffort || state.kanbanComposerReasoningEffort || "",
      }),
    });
    const cards = Array.isArray(result.cards) ? result.cards : [];
    const blocked = cards.filter((item) => item.blocked).length;
    pushKanbanComposerMessage("assistant", `\u5df2\u521b\u5efa ${cards.length} \u5f20\u591a Agent \u770b\u677f\u5361\u7247\uff1b${Math.max(0, cards.length - blocked)} \u5f20\u9996\u6279\u6267\u884c\uff0c${blocked} \u5f20\u7b49\u5f85\u4f9d\u8d56\u6216\u5e76\u884c\u4f4d\u3002`);
    state.kanbanPlanDraft = null;
    state.kanbanComposerText = "";
    clearKanbanComposerDocuments();
    localStorage.removeItem("hermesKanbanComposerDraft");
    finishKanbanComposerProgress();
    clearTodoListCache();
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    state.todoCreateOpen = false;
    await loadTodos({ skipCache: true });
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `\u6279\u91cf\u521b\u5efa\u5931\u8d25\uff1a${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanPlanCreating = false;
    if (!state.kanbanComposerBusy) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}
