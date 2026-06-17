"use strict";

const NOTIFICATION_CONTEXT_LABELS = Object.freeze({
  wardrobe: "衣橱",
  moira: "星盘",
  finance: "记账",
  email: "邮箱",
  health: "健康",
  note: "笔记",
  growth: "成长",
  "codex-mobile": "Codex",
  chat: "聊天",
  "group-chat": "群聊",
});

function cleanNotificationContext(value, max = 40) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function pluginIdFromTaskGroupId(value = "") {
  const text = cleanNotificationContext(value, 120);
  const match = text.match(/^plugin[:/](.+)$/i);
  return match ? cleanNotificationContext(match[1], 80).toLowerCase() : "";
}

function notificationContextLabelFromPluginId(pluginId = "") {
  const id = cleanNotificationContext(pluginId, 80).toLowerCase();
  return NOTIFICATION_CONTEXT_LABELS[id] || cleanNotificationContext(id, 40);
}

function notificationContextLabelForTask(thread, message) {
  const runOptions = message?.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
  const pluginId = cleanNotificationContext(
    message?.pluginId
      || message?.plugin_id
      || runOptions.pluginId
      || runOptions.plugin_id
      || thread?.pluginId
      || thread?.plugin_id
      || pluginIdFromTaskGroupId(message?.taskGroupId),
    80,
  ).toLowerCase();
  if (pluginId) return notificationContextLabelFromPluginId(pluginId);
  const taskGroupId = cleanNotificationContext(message?.taskGroupId, 80);
  if (taskGroupId === "group-chat" || thread?.chatGroup?.enabled) return NOTIFICATION_CONTEXT_LABELS["group-chat"];
  if (taskGroupId === "chat" || thread?.singleWindow) return NOTIFICATION_CONTEXT_LABELS.chat;
  return "";
}

function notificationTitleWithContext(title, contextLabel, fallback = "Home AI") {
  const baseTitle = cleanNotificationContext(title, 120) || fallback;
  const label = cleanNotificationContext(contextLabel, 40);
  if (!label) return baseTitle;
  if (baseTitle === label || baseTitle.startsWith(`${label}:`) || baseTitle.startsWith(`${label}：`)) return baseTitle;
  return `${label}：${baseTitle}`;
}

module.exports = {
  notificationContextLabelForTask,
  notificationContextLabelFromPluginId,
  notificationTitleWithContext,
};
