function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compatibilitySourceLabel(source = "") {
  switch (String(source || "")) {
    case "options.currentThread":
      return "显式线程";
    case "state.taskListThread":
      return "任务根缓存";
    case "state.taskListRootCache.thread":
      return "任务根对象缓存";
    case "state.cachedTaskListRoot.thread":
      return "兼容任务根缓存";
    case "state.currentThread":
      return "当前线程";
    default:
      return "未收集";
  }
}

function taskTopicRootSummaryRows(taskTopicShell = {}, compatibility = {}) {
  const rows = [
    Object.freeze(["Render signature", taskTopicShell.renderSignature || ""]),
    Object.freeze(["Directory signature", taskTopicShell.directoryTopicSignature || ""]),
    Object.freeze(["数据来源", compatibilitySourceLabel(compatibility.source)]),
    Object.freeze(["目录集合", String(taskTopicShell.directoryCollectionCount || 0)]),
    Object.freeze(["常规话题", String(taskTopicShell.regularGroupCount || 0)]),
    Object.freeze(["插件话题", String(taskTopicShell.pluginGroupCount || 0)]),
    Object.freeze(["延迟重绘", taskTopicShell.shouldDeferDirectoryTopics ? "需要" : "不需要"]),
  ];
  if (compatibility.cacheSignature) {
    rows.push(Object.freeze(["缓存签名", compatibility.cacheSignature]));
  }
  return Object.freeze(rows);
}

function taskTopicRootSummaryHtml(taskTopicShell = {}, compatibility = {}) {
  return taskTopicRootSummaryRows(taskTopicShell, compatibility).map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function topicItemTitle(item = {}) {
  return item.title || item.label || item.pluginId || item.id || "话题";
}

function topicItemMeta(item = {}) {
  if (item.status) return item.status;
  if (item.pluginId) return item.pluginId;
  const topicCount = Number(item.topicCount || 0);
  return `${Number.isFinite(topicCount) ? topicCount : 0} 个话题`;
}

function actionAttributes(action = null) {
  if (!action?.actionId) return "";
  const disabled = action.enabled === false ? " disabled aria-disabled=\"true\"" : "";
  return [
    ` data-vns-topic-action="${escapeHtml(action.actionId)}"`,
    action.classicFallbackHref ? ` data-vns-topic-href="${escapeHtml(action.classicFallbackHref)}"` : "",
    disabled,
  ].join("");
}

function topicRowsHtml(items = [], emptyText = "暂无") {
  if (!items.length) return `<li class="vns-topic-empty">${escapeHtml(emptyText)}</li>`;
  return items.map((item) => `
    <li>
      <button class="vns-topic-row-button" type="button"${actionAttributes(item.action)}>
        <strong>${escapeHtml(topicItemTitle(item))}</strong>
        <span>${escapeHtml(topicItemMeta(item))}</span>
      </button>
    </li>
  `).join("");
}

function roleLabel(role = "") {
  switch (String(role || "")) {
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    case "system":
      return "系统";
    case "tool":
      return "工具";
    default:
      return "未知";
  }
}

function messageMetaText(message = {}) {
  const parts = [];
  if (message.status) parts.push(message.status);
  parts.push(`附件 ${Number(message.attachmentCount || 0)}`);
  parts.push(`产物 ${Number(message.artifactCount || 0)}`);
  if (Number(message.toolCallCount || 0) > 0) parts.push(`工具 ${Number(message.toolCallCount || 0)}`);
  return parts.join(" · ");
}

function messagePreviewRowsHtml(messages = [], emptyText = "暂无消息") {
  if (!messages.length) return `<li class="vns-topic-empty">${escapeHtml(emptyText)}</li>`;
  return messages.map((message) => `
    <li>
      <strong>${escapeHtml(roleLabel(message.role))}</strong>
      <span>${escapeHtml(messageMetaText(message))}</span>
      <p>${escapeHtml(message.textPreview || "(无文本预览)")}</p>
    </li>
  `).join("");
}

function renderSelectedTopicDetailHtml(selectedView = {}) {
  return `
    <section class="vns-topic-detail" aria-label="选中话题读回">
      <article class="vns-card">
        <h2>选中话题读回</h2>
        <dl class="vns-cache vns-topic-facts">
          <div><dt>话题</dt><dd>${escapeHtml(selectedView.selectedTaskGroupId || "话题根")}</dd></div>
          <div><dt>模式</dt><dd>${escapeHtml(selectedView.messageMode || "tasks")}</dd></div>
          <div><dt>消息数</dt><dd>${escapeHtml(String(selectedView.totalMessageCount ?? selectedView.messageCount ?? 0))}</dd></div>
          <div><dt>已加载</dt><dd>${escapeHtml(String(selectedView.loadedMessageCount || 0))}</dd></div>
          <div><dt>更多历史</dt><dd>${selectedView.hasMoreBefore ? "有" : "无"}</dd></div>
          <div><dt>来源</dt><dd>${escapeHtml(selectedView.source || "thread_read_api")}</dd></div>
        </dl>
        <ul class="vns-topic-list vns-message-preview-list">
          ${messagePreviewRowsHtml(selectedView.previewMessages || [], selectedView.emptyText || "暂无消息")}
        </ul>
      </article>
    </section>
  `;
}

function renderTaskTopicRootHtml(taskTopicShell = {}, compatibility = {}, actionModel = {}) {
  return `
    <section class="vns-topic-shell" aria-label="话题根预览">
      <article class="vns-card">
        <h2>话题根模型</h2>
        <dl class="vns-cache vns-topic-facts">
          ${taskTopicRootSummaryHtml(taskTopicShell, compatibility)}
        </dl>
      </article>
      <article class="vns-card">
        <h2>目录话题</h2>
        <ul class="vns-topic-list">
          ${topicRowsHtml(actionModel.directoryCollections || taskTopicShell.directoryCollections, "没有目录话题")}
        </ul>
      </article>
      <article class="vns-card">
        <h2>普通话题</h2>
        <ul class="vns-topic-list">
          ${topicRowsHtml(actionModel.visibleRegularGroups || taskTopicShell.visibleRegularGroups, taskTopicShell.emptyStateText || "暂无")}
        </ul>
      </article>
      <article class="vns-card">
        <h2>插件话题</h2>
        <ul class="vns-topic-list">
          ${topicRowsHtml(actionModel.pluginCards || taskTopicShell.pluginCards, "没有插件话题")}
        </ul>
      </article>
    </section>
  `;
}

export {
  actionAttributes,
  compatibilitySourceLabel,
  escapeHtml,
  messageMetaText,
  messagePreviewRowsHtml,
  renderTaskTopicRootHtml,
  renderSelectedTopicDetailHtml,
  roleLabel,
  taskTopicRootSummaryHtml,
  taskTopicRootSummaryRows,
  topicItemMeta,
  topicItemTitle,
  topicRowsHtml,
};
