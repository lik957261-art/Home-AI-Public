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
  await test("Vite config builds a development chat runtime island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /chat-runtime/);
    assert.match(configText, /\/vite-chat-runtime-preview\//);
    assert.match(configText, /src\/vite-islands\/chat-runtime\/main\.mjs/);
    assert.match(configText, /devPreviewEventStreamMockRoutes/);
    assert.match(configText, /viteDevPreviewEventStreamPayload/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/chat-runtime/index.html");
    const builtPreview = read("public/vite-preview/chat-runtime.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/chat-runtime\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/chat-runtime\/chat-runtime\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/chat-runtime/);
    assert.doesNotMatch(indexHtml, /vite-preview\/chat-runtime/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/chat-runtime/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/chat-runtime/);
  });

  await test("source uses runtime facade and avoids live transport/browser boundaries", async () => {
    const source = read("src/vite-islands/chat-runtime/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /event-stream-adapter\.mjs/);
    assert.match(source, /live-event-source-client\.mjs/);
    assert.match(source, /composer-model\.mjs/);
    assert.match(source, /chat-detail-model\.mjs/);
    assert.match(source, /composer-controller\.mjs/);
    assert.match(source, /thread-readback-controller\.mjs/);
    assert.match(source, /attachment-model\.mjs/);
    assert.match(source, /attachment-upload-client\.mjs/);
    assert.match(source, /attachment-server-file-client\.mjs/);
    assert.match(source, /attachment-native-share-client\.mjs/);
    assert.match(source, /focus-lifecycle-guard\.mjs/);
    assert.match(source, /applyChatEventStreamRecord/);
    assert.match(source, /createChatEventSourceClient/);
    assert.match(source, /createOptimisticSendPlan/);
    assert.match(source, /buildChatDetailViewModel/);
    assert.match(source, /createComposerController/);
    assert.match(source, /createChatThreadReadbackController/);
    assert.match(source, /buildComposerAttachmentState/);
    assert.match(source, /uploadComposerFiles/);
    assert.match(source, /attachServerFileToComposer/);
    assert.match(source, /createNativeShareIntakeController/);
    assert.match(source, /receiveNativeSharePayload/);
    assert.match(source, /installNativeShareReceiver/);
    assert.match(source, /chat-runtime-preview:attachments/);
    assert.match(source, /data-cr-attachment-add-upload/);
    assert.match(source, /data-cr-attachment-upload-selected/);
    assert.match(source, /data-cr-attachment-file-input/);
    assert.match(source, /createEditableFocusLifecycleGuard/);
    assert.match(source, /blurPreviewFocusedEditable/);
    assert.match(source, /chat-runtime-preview:focus-guard/);
    assert.match(source, /HomeAiRuntimeFacade/);
    assert.match(source, /runtime\.eventStream/);
    assert.match(source, /startRuntimeTransport/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /chat-runtime-preview:state/);
    assert.match(source, /dispose/);
    assert.match(source, /HomeAIViteChatRuntimePreview/);
    assert.match(source, /buildChatRuntimeViewModel/);
    const adapterSource = read("src/vite-islands/chat-runtime/event-stream-adapter.mjs");
    assert.match(adapterSource, /applyChatRuntimeEvent/);
    assert.match(adapterSource, /parseChatEventStreamInput/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /new\s+EventSource\b/);
    assert.doesNotMatch(source, /\bEventSource\s*\(/);
    assert.doesNotMatch(source, /sendMessage/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
  });

  await test("global audit allowlist names the preview hook explicitly", async () => {
    const auditText = read("scripts/vite-global-usage-audit.js");
    assert.match(auditText, /src\/vite-islands\/chat-runtime\/main\.mjs/);
    assert.match(auditText, /HomeAIViteChatRuntimePreview/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/chat-runtime/chat-runtime.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/chat-runtime/chat-runtime.js");
    assert.match(output, /Chat Runtime 事件模型/);
    assert.match(output, /message\.delta/);
    assert.match(output, /thread\.updated/);
    assert.match(output, /bad frame/);
    assert.match(output, /event_stream_invalid_json/);
    assert.match(output, /模拟 SSE/);
    assert.match(output, /runtime SSE/);
    assert.match(output, /Composer ESM/);
    assert.match(output, /模拟发送/);
    assert.match(output, /发送到 dev mock/);
    assert.match(output, /停止 dev mock/);
    assert.match(output, /回读线程/);
    assert.match(output, /线程回读/);
    assert.match(output, /静态预览阻断真实发送/);
    assert.match(output, /附件 ESM/);
    assert.match(output, /模拟系统文件/);
    assert.match(output, /上传选择文件/);
    assert.match(output, /开发文件/);
    assert.match(output, /模拟服务器文件/);
    assert.match(output, /收到系统分享/);
    assert.match(output, /系统分享桥/);
    assert.match(output, /Focus guard/);
    assert.match(output, /清理焦点/);
    assert.match(output, /event_source_reconnecting/);
    assert.match(output, /刷新请求/);
    assert.match(output, /HomeAIViteChatRuntimePreview/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
