"use strict";

const fs = require("fs");
const path = require("path");

const appSplitModuleFiles = Object.freeze([
  "app-shell-ui.js",
  "app-task-groups-ui.js",
  "app-chat-composer-ui.js",
  "app-navigation-search-ui.js",
  "app-sidebar-task-ui.js",
  "app-message-actions-ui.js",
  "app-platform-ui.js",
  "app-pwa-settings-push-ui.js",
  "app-workspace-admin-ui.js",
  "app-access-key-manager-ui.js",
  "app-share-image-ui.js",
  "app-draft-thread-ui.js",
  "app-directory-automation-ui.js",
  "app-shared-directory-ui.js",
  "app-automation-ui.js",
  "app-learning-growth-controller.js",
  "app-automation-controller-ui.js",
  "app-thread-state-ui.js",
  "app-group-topic-ui.js",
  "app-kanban-core-ui.js",
  "app-kanban-story-core-ui.js",
  "app-kanban-todo-core-ui.js",
  "app-kanban-render-ui.js",
  "app-kanban-list-ui.js",
  "app-kanban-learning-panel-ui.js",
  "app-kanban-recorder-ui.js",
  "app-todo-detail-ui.js",
  "app-kanban-actions-ui.js",
  "app-thread-message-ui.js",
  "app-thread-list-ui.js",
  "app-thread-directory-ui.js",
  "app-thread-card-message-ui.js",
  "app-rich-text-directory-ui.js",
  "app-message-usage-ui.js",
  "app-events-composer-ui.js",
  "app-event-stream-ui.js",
  "app-upload-sidebar-ui.js",
  "app-composer-send-ui.js",
  "app-wire-start-ui.js",
  "app-start.js",
]);

function readPublicFile(repoRoot, file) {
  return fs.readFileSync(path.join(repoRoot, "public", file), "utf8");
}

function readAppShellSource(repoRoot) {
  return [
    readPublicFile(repoRoot, "app.js"),
    ...appSplitModuleFiles.map((file) => readPublicFile(repoRoot, file)),
  ].join("\n");
}

module.exports = {
  appSplitModuleFiles,
  readAppShellSource,
};
