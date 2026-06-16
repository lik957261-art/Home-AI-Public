"use strict";

const path = require("node:path");

function defaultCompactText(value, max = 200) {
  return String(value || "").slice(0, max);
}

function defaultAppRouteUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function defaultHashValue(value) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function numeric(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createWebPushAutomationProjectionService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const appRouteUrl = typeof options.appRouteUrl === "function" ? options.appRouteUrl : defaultAppRouteUrl;
  const workspaceIdForPrincipal = typeof options.workspaceIdForPrincipal === "function"
    ? options.workspaceIdForPrincipal
    : ((principalId) => String(principalId || "owner"));
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : defaultHashValue;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const state = typeof options.state === "function" ? options.state : (() => options.state || {});
  const automationDeliverableExtensions = new Set(
    Array.from(options.automationDeliverableExtensions || [".md", ".pdf", ".doc", ".docx", ".xlsx", ".pptx"])
      .map((item) => String(item).toLowerCase()),
  );
  const automationDeliverableLookbackMs = numeric(options.automationDeliverableLookbackMs, 30 * 60 * 1000);
  const automationDeliverableFutureGraceMs = numeric(options.automationDeliverableFutureGraceMs, 30 * 60 * 1000);
  const automationInitialLookbackMs = numeric(options.automationInitialLookbackMs, 24 * 60 * 60 * 1000);

  function currentState() {
    return state() || {};
  }

  function automationOwnerPrincipal(job) {
    return String(job?.ownerPrincipalId || "").trim() || "owner";
  }

  function automationTitleForPush(job) {
    return compactText(job?.name || job?.id || "Hermes CRON", 120).replace(/\s+/g, " ").trim() || "Hermes CRON";
  }

  function automationTimeMs(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function automationDeliverableExtension(doc) {
    return path.extname(String(doc?.name || "")).toLowerCase();
  }

  function automationDeliverableTimeMs(doc) {
    return Math.max(
      automationTimeMs(doc?.runOutputUpdatedAt),
      automationTimeMs(doc?.updatedAt),
    );
  }

  function automationLatestDeliverableTimeMs(job) {
    return Math.max(0, ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments : []).map(automationDeliverableTimeMs));
  }

  function automationActivityTimeMs(job) {
    return Math.max(
      automationLatestDeliverableTimeMs(job),
      automationTimeMs(job?.lastRunAt),
      automationTimeMs(job?.updatedAt),
    );
  }

  function automationRunFailed(job) {
    return /error|fail/i.test(String(job?.lastStatus || job?.status || ""))
      || Boolean(job?.lastError || job?.lastDeliveryError);
  }

  function automationFailureSummary(job) {
    return compactText(
      job?.lastError
      || job?.lastDeliveryError
      || job?.error
      || job?.lastStatus
      || job?.status
      || "Automation run failed",
      160,
    ).replace(/\s+/g, " ").trim();
  }

  function automationListSortByLatestDeliverable(left, right) {
    const leftActivity = automationActivityTimeMs(left);
    const rightActivity = automationActivityTimeMs(right);
    if (leftActivity !== rightActivity) return rightActivity - leftActivity;
    const leftNext = automationTimeMs(left?.nextRunAt);
    const rightNext = automationTimeMs(right?.nextRunAt);
    if (Boolean(leftNext) !== Boolean(rightNext)) return leftNext ? -1 : 1;
    if (leftNext && rightNext && leftNext !== rightNext) return leftNext - rightNext;
    return String(left?.name || left?.id || "").localeCompare(String(right?.name || right?.id || ""));
  }

  function automationPushMarkDeliverableTimeMs(mark) {
    if (!mark || typeof mark !== "object") return 0;
    return Math.max(
      automationTimeMs(mark.deliverableTimeAt),
      automationTimeMs(mark.deliverableUpdatedAt),
      automationTimeMs(mark.runOutputUpdatedAt),
    );
  }

  function automationLatestDeliverableForPush(job, existingMark = null) {
    const lastRunMs = automationTimeMs(job?.lastRunAt);
    if (!lastRunMs) return null;
    const previousDeliverableMs = automationPushMarkDeliverableTimeMs(existingMark);
    const nowWithGrace = nowMs() + automationDeliverableFutureGraceMs;
    const candidates = (Array.isArray(job?.outputDocuments) ? job.outputDocuments : [])
      .filter((doc) => {
        const ext = automationDeliverableExtension(doc);
        if (!automationDeliverableExtensions.has(ext)) return false;
        if (!doc?.url || Number(doc?.size || 0) <= 0) return false;
        const docTimeMs = automationDeliverableTimeMs(doc);
        if (!docTimeMs) return false;
        if (previousDeliverableMs && docTimeMs <= previousDeliverableMs) return false;
        if (docTimeMs < lastRunMs - automationDeliverableLookbackMs) return false;
        if (docTimeMs > nowWithGrace) return false;
        return true;
      })
      .sort((left, right) => automationDeliverableTimeMs(right) - automationDeliverableTimeMs(left));
    return candidates[0] || null;
  }

  function automationDeliverableMime(doc = {}) {
    const explicit = String(doc.mime || doc.mimeType || doc.contentType || "").trim();
    if (explicit) return explicit;
    const ext = automationDeliverableExtension(doc);
    if (ext === ".md") return "text/markdown";
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === ".doc") return "application/msword";
    return "application/octet-stream";
  }

  function automationDeliverableSourceRef(doc = null) {
    if (!doc) return null;
    return {
      name: String(doc.name || "").trim(),
      url: String(doc.url || "").trim(),
      mime: automationDeliverableMime(doc),
      updatedAt: String(doc.updatedAt || "").trim(),
      runOutputUpdatedAt: String(doc.runOutputUpdatedAt || "").trim(),
    };
  }

  function automationJobLooksScheduledTodo(job = {}) {
    const explicit = String(job.itemType || job.item_type || job.intentType || job.intent_type || job.category || job.kind || "").trim().toLowerCase();
    if (["todo", "scheduled_todo", "reminder", "scheduled-reminder"].includes(explicit)) return true;
    if (job.scheduledTodo || job.scheduled_todo || job.todoReminder || job.todo_reminder) return true;
    const schedule = String(job.scheduleText || job.schedule || "").trim().toLowerCase();
    if (!schedule || schedule === "manual") return false;
    const text = `${job.name || ""}\n${job.title || ""}\n${job.prompt || ""}\n${job.promptPreview || ""}`.toLowerCase();
    return /\b(todo|to-do|reminder|remind me)\b/.test(text) || /待办|提醒|备忘/.test(text);
  }

  function automationPushSignature(job, latestDoc = null) {
    const lastRunAt = String(job?.lastRunAt || "").trim();
    if (!lastRunAt) return "";
    if (automationRunFailed(job)) {
      return [
        lastRunAt,
        "failed",
        automationFailureSummary(job),
      ].join("|");
    }
    const docSignature = latestDoc ? [
      String(latestDoc.name || "").trim(),
      String(latestDoc.updatedAt || "").trim(),
      String(latestDoc.runOutputUpdatedAt || "").trim(),
      String(latestDoc.url || "").trim(),
    ].join(":") : "no-deliverable";
    return [
      lastRunAt,
      String(job?.lastStatus || "").trim(),
      String(job?.status || "").trim(),
      String(job?.lastError || "").trim(),
      String(job?.lastDeliveryError || "").trim(),
      docSignature,
    ].join("|");
  }

  function automationPushMarkSignature(mark) {
    if (!mark) return "";
    if (typeof mark === "string") return mark;
    if (typeof mark === "object") return String(mark.signature || "");
    return "";
  }

  function isRecentInitialAutomationDeliverable(latestDoc = null) {
    const docTimeMs = automationDeliverableTimeMs(latestDoc);
    if (!docTimeMs) return false;
    return nowMs() - docTimeMs <= Math.max(0, automationInitialLookbackMs);
  }

  function isRecentInitialAutomationEvent(job, latestDoc = null) {
    if (latestDoc) return isRecentInitialAutomationDeliverable(latestDoc);
    const runMs = automationTimeMs(job?.lastRunAt);
    if (!runMs) return false;
    return nowMs() - runMs <= Math.max(0, automationInitialLookbackMs);
  }

  function setAutomationPushMark(job, signature, latestDoc = null) {
    const store = currentState();
    store.automationPushMarks = store.automationPushMarks || {};
    store.automationPushMarks[String(job?.id || "")] = {
      signature,
      lastRunAt: String(job?.lastRunAt || ""),
      lastStatus: String(job?.lastStatus || job?.status || ""),
      deliverableName: latestDoc ? String(latestDoc.name || "") : "",
      deliverableUpdatedAt: latestDoc ? String(latestDoc.updatedAt || "") : "",
      runOutputUpdatedAt: latestDoc ? String(latestDoc.runOutputUpdatedAt || "") : "",
      deliverableTimeAt: latestDoc ? new Date(automationDeliverableTimeMs(latestDoc)).toISOString() : "",
      updatedAt: nowIso(),
    };
  }

  function automationDetailRouteUrl(input = {}) {
    const workspaceId = String(input.workspaceId || "owner").trim() || "owner";
    const automationId = String(input.automationId || input.jobId || "").trim();
    const params = { view: "automation", workspaceId, automationId };
    const inboxItemId = String(input.inboxItemId || input.sourceInboxItemId || "").trim();
    if (inboxItemId) {
      params.returnTo = "inbox";
      params.returnScope = "detail";
      params.sourceInboxItemId = inboxItemId;
    }
    return appRouteUrl(params);
  }

  function automationPushEventForJob(job, latestDoc, signature) {
    const jobId = String(job?.id || "").trim();
    if (!jobId || !String(job?.lastRunAt || "").trim()) return null;
    const principalId = automationOwnerPrincipal(job);
    const workspaceId = workspaceIdForPrincipal(principalId);
    const failed = automationRunFailed(job);
    const scheduledTodo = automationJobLooksScheduledTodo(job);
    if (!latestDoc && !failed && !scheduledTodo) return null;
    const automationTitle = automationTitleForPush(job);
    const title = failed ? "\u81ea\u52a8\u5316\u4efb\u52a1\u5931\u8d25" : (scheduledTodo ? automationTitle : "\u81ea\u52a8\u5316\u4efb\u52a1\u5b8c\u6210");
    const body = compactText([
      automationTitle,
      latestDoc ? `\u4ea4\u4ed8\u6587\u4ef6: ${latestDoc.name}` : "",
      failed ? `\u9519\u8bef: ${automationFailureSummary(job)}` : "",
    ].filter(Boolean).join("\n"), 220);
    const automationUrl = automationDetailRouteUrl({ workspaceId, automationId: jobId });
    return {
      jobId,
      principalId,
      workspaceId,
      signature,
      latestDoc,
      scheduledTodo,
      payload: {
        title,
        body,
        tag: `hermes-automation-${jobId}-${hashValue(signature).slice(0, 12)}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: nowMs(),
        vibrate: [200, 100, 200],
        data: {
          url: automationUrl,
          viewMode: "automation",
          workspaceId,
          automationId: jobId,
          principalId,
          messageType: failed ? "automation_failed" : (scheduledTodo ? "automation_scheduled_todo" : "automation_completed"),
          automationTitle,
          lastRunAt: job.lastRunAt || "",
          status: job.lastStatus || job.status || "",
          schedule: job.scheduleText || job.schedule || "",
          requireInteraction: true,
        },
      },
    };
  }

  return {
    automationDeliverableSourceRef,
    automationLatestDeliverableForPush,
    automationLatestDeliverableTimeMs,
    automationListSortByLatestDeliverable,
    automationPushEventForJob,
    automationPushMarkSignature,
    automationPushSignature,
    automationRunFailed,
    automationJobLooksScheduledTodo,
    automationDetailRouteUrl,
    automationOwnerPrincipal,
    isRecentInitialAutomationEvent,
    setAutomationPushMark,
  };
}

module.exports = {
  createWebPushAutomationProjectionService,
};
