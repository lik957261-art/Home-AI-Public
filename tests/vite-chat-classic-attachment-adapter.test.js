"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("classic composer upload adapter imports the Vite upload client with fallback", async () => {
    const source = read("public/app-composer-attachments-ui.js");
    assert.match(source, /CHAT_ATTACHMENT_UPLOAD_CLIENT_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-attachment-upload-client\/chat-attachment-upload-client\.js/);
    assert.match(source, /__homeAiImportChatAttachmentUploadClient/);
    assert.match(source, /importChatAttachmentUploadClient/);
    assert.match(source, /currentChatAttachmentUploadClient/);
    assert.match(source, /uploadFilesWithClassicFallback/);
    assert.match(source, /uploadComposerFiles/);
    assert.match(source, /readFileAsDataUrl/);
    assert.match(source, /fileToBase64/);
    assert.match(source, /dataBase64/);
    assert.match(source, /renderPendingArtifacts\(\)/);
    assert.match(source, /updateComposerAction\(\)/);
  });

  await test("classic file input change path uses the Vite controller when loaded", async () => {
    const source = read("public/app-wire-start-ui.js");
    assert.match(source, /CHAT_ATTACHMENT_FILE_INPUT_CONTROLLER_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-attachment-file-input-controller\/chat-attachment-file-input-controller\.js/);
    assert.match(source, /__homeAiImportChatAttachmentFileInputController/);
    assert.match(source, /importChatAttachmentFileInputController/);
    assert.match(source, /classicAttachmentFileInputSelection/);
    assert.match(source, /createAttachmentFileInputController/);
    assert.match(source, /controller\.handleChange\(event\)/);
    assert.match(source, /controller\.getSelectedFiles\(\)/);
    assert.match(source, /\$\("fileInput"\)\.addEventListener\("change", \(event\) => \{[\s\S]*?classicAttachmentFileInputSelection\(event\)[\s\S]*?markSystemFilePickerReturned\(120000\)/);
  });

  await test("built attachment adapter artifacts exist after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/chat-attachment-upload-client/chat-attachment-upload-client.js"),
      "run npm run build:vite before this test",
    );
    assert.ok(
      exists("public/vite-islands/chat-attachment-file-input-controller/chat-attachment-file-input-controller.js"),
      "run npm run build:vite before this test",
    );
    const manifest = read("public/vite-islands/.vite/manifest.json");
    const uploadOutput = read("public/vite-islands/chat-attachment-upload-client/chat-attachment-upload-client.js");
    const fileInputOutput = read("public/vite-islands/chat-attachment-file-input-controller/chat-attachment-file-input-controller.js");
    assert.match(manifest, /chat-attachment-upload-client\/chat-attachment-upload-client\.js/);
    assert.doesNotMatch(manifest, /attachment-upload-client\/chunks\/attachment-upload-client\.js/);
    assert.match(uploadOutput, /uploadComposerFiles/);
    assert.match(uploadOutput, /attachment_upload_requires_file_reader/);
    assert.doesNotMatch(uploadOutput, /X-Hermes-Web-Key/);
    assert.doesNotMatch(uploadOutput, /raw:\w+\}/);
    assert.match(fileInputOutput, /createAttachmentFileInputController/);
    assert.match(fileInputOutput, /chat-runtime-preview:attachment-file-input/);
    assert.doesNotMatch(fileInputOutput, /FileReader/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
