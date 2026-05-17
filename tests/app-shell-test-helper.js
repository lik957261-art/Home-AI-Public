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
  "app-workspace-admin-ui.js",
  "app-directory-automation-ui.js",
  "app-learning-growth-controller.js",
  "app-kanban-core-ui.js",
  "app-kanban-render-ui.js",
  "app-kanban-actions-ui.js",
  "app-thread-message-ui.js",
  "app-events-composer-ui.js",
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
