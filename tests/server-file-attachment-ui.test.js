"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const indexHtml = read("public/index.html");
const appJs = read("public/app.js");
const messageActionsUi = read("public/app-message-actions-ui.js");
const uploadSidebarUi = read("public/app-upload-sidebar-ui.js");
const sharedDirectoryUi = read("public/app-shared-directory-ui.js");
const eventStreamUi = read("public/app-event-stream-ui.js");
const styles = read("public/styles.css");

assert.match(indexHtml, /id="attachFileMenu"/);
assert.match(appJs, /attachFileMenuOpen: false/);
assert.match(appJs, /serverFileAttachmentPickerOpen: false/);
assert.match(appJs, /serverFileAttachmentTargetThreadId: ""/);
assert.match(appJs, /nativeSharedFiles: \[\]/);

assert.match(messageActionsUi, /openAttachFileMenu\(\)/);
assert.match(messageActionsUi, /openAttachFilePicker\(\)/);
assert.match(uploadSidebarUi, /function openAttachFileMenu\(\)/);
assert.match(uploadSidebarUi, /data-attach-menu-system/);
assert.match(uploadSidebarUi, />系统文件</);
assert.match(uploadSidebarUi, /data-attach-menu-server/);
assert.match(uploadSidebarUi, />服务器文件</);
assert.match(uploadSidebarUi, /openServerFileAttachmentPicker\(\)/);

assert.match(uploadSidebarUi, /function systemShareDirectoryPath\(\) \{[\s\S]*?return "系统分享";/);
assert.doesNotMatch(uploadSidebarUi, /yyyyMMdd|YYYYMMDD|getMonth\(\)|getDate\(\)/);
assert.match(uploadSidebarUi, /function openServerFileAttachmentPicker\(\)/);
assert.match(uploadSidebarUi, /if \(isDraftThread\(state\.currentThread\)\) await materializeCurrentThread\(\)/);
assert.match(uploadSidebarUi, /state\.serverFileAttachmentTargetThreadId = state\.currentThreadId/);
assert.match(uploadSidebarUi, /state\.directoryPath = systemShareDirectoryPath\(\)/);
assert.doesNotMatch(uploadSidebarUi, /await loadDirectoryView\(\{ resetPath: true \}\)/);
assert.match(uploadSidebarUi, /function attachServerFileToComposer\(entry = \{\}\)/);
assert.match(uploadSidebarUi, /\/api\/threads\/\$\{encodeURIComponent\(threadId\)\}\/server-file-attachments/);
assert.match(uploadSidebarUi, /body: JSON\.stringify\(\{[\s\S]*path: filePath,[\s\S]*filename: entry\.name \|\| "",[\s\S]*workspaceId: entry\.workspaceId \|\| state\.selectedWorkspaceId \|\| "owner"/);
assert.match(uploadSidebarUi, /function receiveNativeSharedFiles\(payload = \{\}\)/);
assert.match(uploadSidebarUi, /window\.HomeAINativeShare = Object\.assign\(existing, \{/);
assert.match(uploadSidebarUi, /function attachNativeSharedFilesToCurrentComposer\(\)/);
assert.match(uploadSidebarUi, /attachServerFileToComposer\(\{[\s\S]*path: file\.path,[\s\S]*workspaceId: file\.workspaceId,[\s\S]*restore: false/);
assert.match(uploadSidebarUi, /<span class="pending-artifact-remove" aria-hidden="true"><\/span>/);
assert.match(uploadSidebarUi, /data-native-share-attach title="附加到当前对话" aria-label="附加到当前对话">附加<\/button>/);
assert.match(uploadSidebarUi, /data-native-share-open-directory title="打开文件目录" aria-label="打开文件目录">目录<\/button>/);
assert.match(uploadSidebarUi, /data-native-share-clear title="仅保存，不附加" aria-label="仅保存，不附加">保存<\/button>/);

const attachServerFileBody = uploadSidebarUi.match(/async function attachServerFileToComposer[\s\S]*?\n}\n/);
assert.ok(attachServerFileBody, "attachServerFileToComposer must be present");
assert.doesNotMatch(attachServerFileBody[0], /fileToBase64/);
assert.doesNotMatch(attachServerFileBody[0], /dataBase64/);
assert.match(eventStreamUi, /dataBase64/);

assert.match(sharedDirectoryUi, /state\.serverFileAttachmentPickerOpen \? "选择服务器文件" : "目录"/);
assert.match(sharedDirectoryUi, /data-attach-server-file-path/);
assert.match(sharedDirectoryUi, /attachServerFileToComposer\(\{/);
assert.match(sharedDirectoryUi, /选择服务器上的文件作为附件引用，不会重复上传。/);

assert.match(styles, /\.attach-file-menu/);
assert.match(styles, /\.attach-file-option/);
assert.match(styles, /\.server-file-picker-banner/);
assert.match(styles, /\.native-share-intake-panel/);
assert.match(styles, /\.native-share-intake-actions/);
assert.match(styles, /\.native-share-intake-actions \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.native-share-intake-actions button \{[\s\S]*?font-size: 11px;/);
assert.match(styles, /\.pending-artifact-remove::before/);

console.log("server file attachment UI contract passed");
