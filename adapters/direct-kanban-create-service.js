"use strict";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function defaultFormatLocalDateTime(date) {
  return [
    date.getFullYear(),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    " ",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
  ].join("");
}

function defaultEscapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createDirectKanbanCreateService(options = {}) {
  const formatLocalDateTime = typeof options.formatLocalDateTime === "function"
    ? options.formatLocalDateTime
    : defaultFormatLocalDateTime;
  const resolveTodoAssigneeFromText = typeof options.resolveTodoAssigneeFromText === "function"
    ? options.resolveTodoAssigneeFromText
    : ((_text, workspaceId) => String(workspaceId || "owner"));
  const todoAssigneeLabel = typeof options.todoAssigneeLabel === "function"
    ? options.todoAssigneeLabel
    : ((_workspaceId, principalId) => String(principalId || "owner"));
  const stripPrincipalLabelPrefixes = typeof options.stripPrincipalLabelPrefixes === "function"
    ? options.stripPrincipalLabelPrefixes
    : ((value) => String(value || ""));
  const escapeRegExp = typeof options.escapeRegExp === "function" ? options.escapeRegExp : defaultEscapeRegExp;
  const useKanbanTodoBackend = typeof options.useKanbanTodoBackend === "function"
    ? options.useKanbanTodoBackend
    : (() => false);

  function parseWebTodoDueFromText(text, now = new Date()) {
    const raw = String(text || "");
    const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]*(\d{1,2})(?:[:\uff1a])?(\d{1,2})?/);
    if (iso) {
      const date = new Date(now);
      date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      date.setHours(Number(iso[4]), Number(iso[5] || 0), 0, 0);
      return { dueTime: formatLocalDateTime(date), raw: iso[0] };
    }
    const match = raw.match(/(\u4eca\u5929|\u660e\u5929|\u540e\u5929)?\s*(\u4eca\u665a|\u660e\u65e9|\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a)?\s*(?:(?:\u63d0\u9192\u6211|\u63d0\u9192|\u53eb\u6211|\u901a\u77e5\u6211|\u5230\u65f6\u5019|\u8bb0\u5f97|please)\s*){0,3}(\d{1,2})\s*(?:\u70b9|[:\uff1a])\s*(\u534a|\d{1,2}\s*\u5206?)?/i);
    if (!match) return null;
    const date = new Date(now);
    const dateWord = match[1] || "";
    const timeWord = match[2] || "";
    const dayOffset = dateWord === "\u540e\u5929" ? 2 : dateWord === "\u660e\u5929" || timeWord === "\u660e\u65e9" ? 1 : 0;
    date.setDate(date.getDate() + dayOffset);
    let hour = Number(match[3]);
    let minute = 0;
    const minuteRaw = String(match[4] || "").trim();
    if (minuteRaw === "\u534a") minute = 30;
    else if (minuteRaw) minute = Number((minuteRaw.match(/\d{1,2}/) || ["0"])[0]);
    if ((timeWord === "\u4e0b\u5348" || timeWord === "\u665a\u4e0a" || timeWord === "\u4eca\u665a") && hour < 12) hour += 12;
    if (timeWord === "\u4e2d\u5348" && hour < 11) hour += 12;
    if (!dateWord && !timeWord && hour < 12 && now.getHours() >= 12) hour += 12;
    date.setHours(hour, minute, 0, 0);
    if (!dateWord && date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    }
    return { dueTime: formatLocalDateTime(date), raw: match[0] };
  }

  function detectDirectTodoCreateIntentForWeb(text, workspaceId, now = new Date()) {
    const rawText = String(text || "").trim();
    const hasTodoKeyword = /(\u5f85\u529e|\u770b\u677f|\u5361\u7247|kanban|todo|to-do)/i.test(rawText);
    const reminderRequest = /(\u63d0\u9192\u6211|\u53eb\u6211|\u901a\u77e5\u6211|\u63d0\u9192)/.test(rawText);
    const hasCreateKeyword = /(\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192|\u52a0)/.test(rawText);
    if (!rawText || (!hasTodoKeyword && !reminderRequest)) return null;
    if (!hasCreateKeyword && !reminderRequest) return null;
    const due = parseWebTodoDueFromText(rawText, now);
    if (!due?.dueTime) return null;
    const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
    const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
    let content = rawText;
    for (const token of [assigneeLabel, assignee, stripPrincipalLabelPrefixes(assignee)].filter(Boolean)) {
      content = content.replace(new RegExp(`(?:\\u7ed9|\\u4e3a|\\u5e2e)?\\s*${escapeRegExp(token)}`, "g"), " ");
    }
    content = content
      .replace(due.raw, " ")
      .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192\u6211|\u53eb\u6211|\u901a\u77e5\u6211|\u63d0\u9192|\u52a0)\s*(?:\u4e00\u4e2a|\u4e00\u6761|\u4e00\u5f20)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)?/ig, " ")
      .replace(/(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u6211\u60f3|\u6211\u8981|\u9700\u8981)?\s*(?:\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u5f00\u542f|\u6dfb\u52a0|\u589e\u52a0|\u5b89\u6392|\u63d0\u9192\u6211|\u53eb\u6211|\u901a\u77e5\u6211|\u63d0\u9192|\u52a0)/ig, " ")
      .replace(/(?:\u4e00\u4e2a|\u4e00\u6761|\u4e00\u5f20)?\s*(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)/ig, " ")
      .replace(/(?:\u5f85\u529e(?:\u4e8b\u9879)?|\u770b\u677f(?:\u5361\u7247)?|\u5361\u7247|kanban|todo|to-do)/ig, " ")
      .replace(/\u7684/g, " ")
      .replace(/[\uff0c,.\u3002\uff1b;\uff1a:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!content) return null;
    return { assignee, assigneeLabel, dueTime: due.dueTime, content };
  }

  function detectDirectKanbanCreateRequest(text) {
    const rawText = String(text || "").trim();
    if (!rawText) return false;
    if (!/(\u770b\u677f|\u5361\u7247|kanban|board)/i.test(rawText)) return false;
    return /(\badd\b|\bcreate\b|\bnew\b|\u65b0\u589e|\u65b0\u5efa|\u521b\u5efa|\u589e\u52a0|\u6dfb\u52a0|\u52a0\u5165|\u653e\u8fdb|\u653e\u5165|\u5b89\u6392|\u767b\u8bb0|\u8bb0\u5f55|\u8865\u5efa|\u8865\u5f55|\u751f\u6210)/i.test(rawText);
  }

  function directTodoCreateNeedsKanbanFields(todo) {
    if (!todo || typeof todo !== "object") return useKanbanTodoBackend();
    const source = String(todo.source || "").trim().toLowerCase();
    if (source === "kanban" || source === "hermes_kanban") return true;
    return useKanbanTodoBackend();
  }

  function verifyDirectTodoCreateResult(todo) {
    const id = String(todo?.id || "").trim();
    if (!id) {
      return { ok: false, error: "Todo created but no visible card id returned." };
    }
    if (directTodoCreateNeedsKanbanFields(todo)) {
      const board = String(todo?.kanbanBoard || "").trim();
      const status = String(todo?.kanbanStatus || "").trim();
      if (!board || !status) {
        return { ok: false, error: "Kanban card creation returned without board/status metadata." };
      }
    }
    return { ok: true, error: "" };
  }

  function formatDirectTodoCreateSuccessMessage(intent, todo) {
    const assigneeLabel = String(intent?.assigneeLabel || "").trim() || "owner";
    const dueTime = String(intent?.dueTime || "").trim() || "no due time";
    const content = String(intent?.content || "").trim() || String(todo?.content || "").trim() || "todo";
    const id = String(todo?.id || "").trim();
    const source = String(todo?.source || "").trim() || "unknown";
    const board = String(todo?.kanbanBoard || "").trim();
    const status = String(todo?.kanbanStatus || "").trim();
    const details = [`ID: ${id}`, `Source: ${source}`];
    if (board) details.push(`Board: ${board}`);
    if (status) details.push(`Status: ${status}`);
    return `\u5df2\u65b0\u589e\u770b\u677f\u5361\u7247\uff1a${assigneeLabel} | ${dueTime} | ${content}\n${details.join(" | ")}`;
  }

  return Object.freeze({
    parseWebTodoDueFromText,
    detectDirectTodoCreateIntentForWeb,
    detectDirectKanbanCreateRequest,
    directTodoCreateNeedsKanbanFields,
    verifyDirectTodoCreateResult,
    formatDirectTodoCreateSuccessMessage,
  });
}

module.exports = {
  createDirectKanbanCreateService,
  defaultFormatLocalDateTime,
  defaultEscapeRegExp,
};
