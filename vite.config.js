"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { defineConfig } = require("vite");
const {
  VITE_DEV_BACKEND_PROXY_VERSION,
  createViteDevBackendProxyRequest,
  resolveViteDevBackendProxyConfig,
  viteDevBackendProxyBlockedRouteApplies,
  viteDevBackendProxyRouteApplies,
} = require("./adapters/vite-dev-backend-proxy-service");
const {
  viteDevPreviewApiMockResponse,
  viteDevPreviewApiMockRouteApplies,
  viteDevPreviewEventStreamPayload,
  viteDevPreviewEventStreamRouteApplies,
} = require("./adapters/vite-dev-preview-api-mock-service");

const viteAppPreviewHtml = path.resolve(
  __dirname,
  "src/vite-app/index.html",
);
const ownerSystemConsoleEntry = path.resolve(
  __dirname,
  "src/vite-islands/owner-system-console/main.mjs",
);
const ownerSystemConsoleModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/owner-system-console/model.mjs",
);
const workspaceConsoleModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/workspace-console-model.mjs",
);
const ownerSystemConsolePreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/owner-system-console/index.html",
);
const aiOpsFeedbackEntry = path.resolve(
  __dirname,
  "src/vite-islands/ai-ops-feedback/main.mjs",
);
const aiOpsFeedbackModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/ai-ops-feedback/model.mjs",
);
const aiOpsFeedbackPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/ai-ops-feedback/index.html",
);
const voiceInputStatusEntry = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/main.mjs",
);
const voiceInputSessionControllerEntry = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/session-controller.mjs",
);
const voiceInputAudioCaptureAdapterEntry = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/audio-capture-adapter.mjs",
);
const voiceLearningModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/voice-learning-model.mjs",
);
const voiceInputStatusPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/index.html",
);
const chatRuntimeEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/main.mjs",
);
const chatLiveEventSourceClientEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/live-event-source-client.mjs",
);
const chatAttachmentFileInputControllerEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/attachment-file-input-controller.mjs",
);
const chatAttachmentUploadClientEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/attachment-upload-client.mjs",
);
const uploadSidebarModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/upload-sidebar-model.mjs",
);
const chatComposerDraftModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-draft-model.mjs",
);
const chatComposerDraftThreadModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-draft-thread-model.mjs",
);
const chatComposerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-model.mjs",
);
const chatComposerContextModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-context-model.mjs",
);
const chatComposerCurrentThreadRefreshModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-current-thread-refresh-model.mjs",
);
const chatComposerEventsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-events-model.mjs",
);
const chatComposerEditorModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-editor-model.mjs",
);
const chatComposerStreamingMessageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-streaming-message-model.mjs",
);
const chatComposerShellModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-shell-model.mjs",
);
const chatComposerSendUiModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-send-ui-model.mjs",
);
const chatComposerRenderSchedulerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-render-scheduler-model.mjs",
);
const chatComposerRefreshSchedulerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-refresh-scheduler-model.mjs",
);
const chatComposerViewportModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-viewport-model.mjs",
);
const chatComposerSelfCheckModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-self-check-model.mjs",
);
const chatComposerModelSelectionModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-model-selection-model.mjs",
);
const chatComposerMessageInvalidationModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-message-invalidation-model.mjs",
);
const chatComposerEventStateModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-event-state-model.mjs",
);
const chatComposerSourceModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-source-model.mjs",
);
const chatScopeModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/chat-scope-model.mjs",
);
const runProgressModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/run-progress-model.mjs",
);
const threadListModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/thread-list-model.mjs",
);
const threadCardMessageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/thread-card-message-model.mjs",
);
const messageUsageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/message-usage-model.mjs",
);
const messageSkillModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/message-skill-model.mjs",
);
const longMessageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/long-message-model.mjs",
);
const chatComposerSendPipelineModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-send-pipeline-model.mjs",
);
const chatComposerNativeEnvironmentModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/composer-native-environment-model.mjs",
);
const threadStateModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/thread-state-model.mjs",
);
const threadMessageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/thread-message-model.mjs",
);
const threadDirectoryModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/thread-directory-model.mjs",
);
const taskArtifactHelperModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/task-artifact-helper-model.mjs",
);
const sidebarBackNavigationModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/sidebar-back-navigation-model.mjs",
);
const routeSnapshotModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/route-snapshot-model.mjs",
);
const platformModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/platform-model.mjs",
);
const accessKeyManagerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/access-key-manager-model.mjs",
);
const navigationSearchModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/navigation-search-model.mjs",
);
const navigationViewModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/navigation-view-model.mjs",
);
const actionInboxModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/action-inbox-model.mjs",
);
const todoDetailModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/todo-detail-model.mjs",
);
const learningGrowthTaskModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-task-model.mjs",
);
const learningGrowthControllerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-controller-model.mjs",
);
const learningGrowthAiModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-ai-model.mjs",
);
const kanbanCardActionsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-card-actions-model.mjs",
);
const runtimeFacadeCompatModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/runtime-facade-compat-model.mjs",
);
const learningNativeGrowthSubmissionModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-native-growth-submission-model.mjs",
);
const kanbanLearningPanelModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-learning-panel-model.mjs",
);
const automationViewModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/automation-view-model.mjs",
);
const kanbanActionsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-actions-model.mjs",
);
const workspaceAdminModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/workspace-admin-model.mjs",
);
const kanbanStudyActionsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-study-actions-model.mjs",
);
const appBootstrapModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/app-bootstrap-model.mjs",
);
const appShellModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/app-shell-model.mjs",
);
const shellStartModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/shell-start-model.mjs",
);
const mobileLayoutModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/mobile-layout-model.mjs",
);
const fixedViewportControllerEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/fixed-viewport-controller.mjs",
);
const kanbanRenderModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-render-model.mjs",
);
const kanbanStoryCoreModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-story-core-model.mjs",
);
const kanbanListModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-list-model.mjs",
);
const learningReadingModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-reading-model.mjs",
);
const teachingControllerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/teaching-controller-model.mjs",
);
const kanbanRecorderModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-recorder-model.mjs",
);
const kanbanStoryHelpersModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-story-helpers-model.mjs",
);
const learningProgramModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-program-model.mjs",
);
const apiClientModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/api-client-model.mjs",
);
const learningGrowthRewardControllerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-reward-controller-model.mjs",
);
const learningGrowthSettingsControllerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-settings-controller-model.mjs",
);
const learningCoinsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-coins-model.mjs",
);
const learningGrowthModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-model.mjs",
);
const learningGrowthReflectionModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/learning-growth-reflection-model.mjs",
);
const automationControllerModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/automation-controller/model.mjs",
);
const kanbanTodoCoreModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/kanban-todo-core-model.mjs",
);
const directoryTopicModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/directory-topic-model.mjs",
);
const groupTopicModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/group-topic-model.mjs",
);
const taskGroupModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/task-group-model.mjs",
);
const pluginContextSwitchModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/plugin-context-switch-model.mjs",
);
const pluginTopicNavigationModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/plugin-topic-navigation-model.mjs",
);
const kanbanComposerActionsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/kanban-composer-actions-model.mjs",
);
const chatRuntimePreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/index.html",
);
const navigationShellEntry = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/main.mjs",
);
const navigationShellPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/navigation-shell/index.html",
);
const messageActionPanelEntry = path.resolve(
  __dirname,
  "src/vite-islands/message-action-panel/main.mjs",
);
const messageActionsModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/message-action-panel/message-actions-model.mjs",
);
const messageActionPanelPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/message-action-panel/index.html",
);
const pluginHostEntry = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/main.mjs",
);
const pluginHostModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/model.mjs",
);
const pluginAdminModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/plugin-admin-model.mjs",
);
const wardrobeModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/wardrobe-model.mjs",
);
const pluginHostPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/index.html",
);
const documentPreviewEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/main.mjs",
);
const documentPreviewModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/model.mjs",
);
const directoryAutomationModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/directory-automation-model.mjs",
);
const richTextDirectoryModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/rich-text-directory-model.mjs",
);
const sharedDirectoryModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/shared-directory-model.mjs",
);
const ttsProfileModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/tts-profile-model.mjs",
);
const markdownRendererModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/markdown-renderer-model.mjs",
);
const taskPreviewHelpersModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/preview-helpers-model.mjs",
);
const documentPreviewPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/index.html",
);
const dialogSheetEntry = path.resolve(
  __dirname,
  "src/vite-islands/dialog-sheet/main.mjs",
);
const dialogSheetModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/dialog-sheet/model.mjs",
);
const dialogSheetPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/dialog-sheet/index.html",
);
const toastStatusEntry = path.resolve(
  __dirname,
  "src/vite-islands/toast-status/main.mjs",
);
const toastStatusPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/toast-status/index.html",
);
const pwaPushStatusEntry = path.resolve(
  __dirname,
  "src/vite-islands/pwa-push-status/main.mjs",
);
const pwaPushStatusModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/pwa-push-status/model.mjs",
);
const pwaPushStatusPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/pwa-push-status/index.html",
);
const shareImageModelEntry = path.resolve(
  __dirname,
  "src/vite-islands/share-image/model.mjs",
);
const homeAiAppPreviewEntry = path.resolve(
  __dirname,
  "src/vite-app/main.mjs",
);
const homeAiProductionBootstrapEntry = path.resolve(
  __dirname,
  "src/vite-app/production-bootstrap.mjs",
);
const vitePreviewFavicon = path.resolve(
  __dirname,
  "public/icons/favicon-32-20260509.png",
);

function devPreviewHtmlRoutes() {
  const routes = new Map([
    ["/vite-app-preview/", viteAppPreviewHtml],
    ["/vite-owner-system-console-preview/", ownerSystemConsolePreviewHtml],
    ["/vite-ai-ops-feedback-preview/", aiOpsFeedbackPreviewHtml],
    ["/vite-voice-input-status-preview/", voiceInputStatusPreviewHtml],
    ["/vite-chat-runtime-preview/", chatRuntimePreviewHtml],
    ["/vite-navigation-shell-preview/", navigationShellPreviewHtml],
    ["/vite-message-action-panel-preview/", messageActionPanelPreviewHtml],
    ["/vite-plugin-host-preview/", pluginHostPreviewHtml],
    ["/vite-document-preview-preview/", documentPreviewPreviewHtml],
    ["/vite-dialog-sheet-preview/", dialogSheetPreviewHtml],
    ["/vite-toast-status-preview/", toastStatusPreviewHtml],
    ["/vite-pwa-push-status-preview/", pwaPushStatusPreviewHtml],
  ]);
  return {
    name: "home-ai-dev-preview-html-routes",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = String(request.url || "").split("?")[0];
        if (pathname === "/icons/favicon-32-20260509.png") {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", "image/png");
            response.end(await fs.readFile(vitePreviewFavicon));
          } catch (error) {
            next(error);
          }
          return;
        }
        const htmlPath = routes.get(pathname);
        if (!htmlPath) {
          next();
          return;
        }
        try {
          const html = await fs.readFile(htmlPath, "utf8");
          const transformed = await server.transformIndexHtml(request.url, html);
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(transformed);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

function devBackendProxyRoutes() {
  const config = resolveViteDevBackendProxyConfig();

  function writeProxyError(response, statusCode, code) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-HomeAI-Vite-Dev-Backend-Proxy", VITE_DEV_BACKEND_PROXY_VERSION);
    response.end(JSON.stringify({
      ok: false,
      error: code || "vite_dev_backend_proxy_failed",
      source: "vite_dev_backend_proxy",
      proxyVersion: VITE_DEV_BACKEND_PROXY_VERSION,
    }));
  }

  function copyResponseHeaders(upstream, response) {
    for (const [name, value] of Object.entries(upstream.headers || {})) {
      const normalized = String(name || "").toLowerCase();
      if (!normalized || normalized === "connection" || normalized === "transfer-encoding") continue;
      if (value === undefined) continue;
      response.setHeader(name, value);
    }
    response.setHeader("X-HomeAI-Vite-Dev-Backend-Proxy", VITE_DEV_BACKEND_PROXY_VERSION);
  }

  function proxyRequest(request, response) {
    const proxyRequest = createViteDevBackendProxyRequest(request, config);
    if (!proxyRequest.ok) {
      writeProxyError(response, 502, proxyRequest.code);
      return;
    }
    const target = new URL(proxyRequest.targetUrl);
    const client = target.protocol === "https:" ? https : http;
    const upstream = client.request(target, {
      method: proxyRequest.method,
      headers: proxyRequest.headers,
    }, (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode || 502;
      copyResponseHeaders(upstreamResponse, response);
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(30000, () => {
      upstream.destroy(new Error("vite_dev_backend_proxy_timeout"));
    });
    upstream.on("error", (error) => {
      writeProxyError(response, 502, error?.message || "vite_dev_backend_proxy_failed");
    });
    request.pipe(upstream);
  }

  return {
    name: "home-ai-dev-backend-proxy",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (viteDevBackendProxyRouteApplies(request, config)) {
          proxyRequest(request, response);
          return;
        }
        if (viteDevBackendProxyBlockedRouteApplies(request, config)) {
          writeProxyError(response, 502, config.blockedReason || "vite_dev_backend_proxy_not_configured");
          return;
        }
        next();
      });
    },
  };
}

function devPreviewApiMockRoutes() {
  function readRequestJson(request, maxBytes = 64 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let raw = "";
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error("vite_dev_preview_body_too_large"));
          request.destroy();
          return;
        }
        raw += chunk.toString("utf8");
      });
      request.on("error", reject);
      request.on("end", () => {
        if (!raw.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (_error) {
          reject(new Error("vite_dev_preview_invalid_json"));
        }
      });
    });
  }
  return {
    name: "home-ai-dev-preview-api-mocks",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!viteDevPreviewApiMockRouteApplies(request)) {
          next();
          return;
        }
        let body = {};
        if (String(request.method || "").toUpperCase() === "POST") {
          try {
            body = await readRequestJson(request);
          } catch (error) {
            response.statusCode = error.message === "vite_dev_preview_body_too_large" ? 413 : 400;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              ok: false,
              error: error.message || "vite_dev_preview_invalid_request_body",
              source: "vite_dev_preview_mock",
            }));
            return;
          }
        }
        const mockResponse = viteDevPreviewApiMockResponse({
          method: request.method,
          url: request.url,
          body,
        });
        if (!mockResponse) {
          next();
          return;
        }
        response.statusCode = mockResponse.statusCode;
        for (const [name, value] of Object.entries(mockResponse.headers || {})) {
          response.setHeader(name, value);
        }
        response.end(JSON.stringify(mockResponse.body));
      });
    },
  };
}

function devPreviewEventStreamMockRoutes() {
  return {
    name: "home-ai-dev-preview-event-stream-mock",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!viteDevPreviewEventStreamRouteApplies(request)) {
          next();
          return;
        }
        const payload = viteDevPreviewEventStreamPayload(request);
        if (!payload) {
          next();
          return;
        }
        if (payload.ok === false) {
          response.statusCode = payload.statusCode || 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("X-HomeAI-Vite-Dev-Mock", payload.mockVersion);
          response.end(JSON.stringify({
            ok: false,
            error: payload.error || "vite_dev_preview_event_stream_failed",
            source: payload.source,
            mockVersion: payload.mockVersion,
          }));
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("X-HomeAI-Vite-Dev-Mock", payload.mockVersion);
        response.write(`: ${payload.source} ${payload.mockVersion}\n\n`);
        const timers = [];
        let closed = false;
        const cleanup = () => {
          closed = true;
          while (timers.length) clearTimeout(timers.pop());
        };
        request.on("close", cleanup);
        for (const [index, frame] of payload.frames.entries()) {
          timers.push(setTimeout(() => {
            if (!closed && !response.destroyed) response.write(frame.serialized);
          }, index * payload.intervalMs));
        }
        timers.push(setTimeout(() => {
          if (!closed && !response.destroyed) response.end();
          cleanup();
        }, payload.frames.length * payload.intervalMs + payload.closeDelayMs));
      });
    },
  };
}

module.exports = defineConfig({
  appType: "custom",
  publicDir: false,
  plugins: [
    devBackendProxyRoutes(),
    devPreviewEventStreamMockRoutes(),
    devPreviewApiMockRoutes(),
    devPreviewHtmlRoutes(),
  ],
  build: {
    emptyOutDir: false,
    manifest: true,
    outDir: "public/vite-islands",
    target: "es2022",
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        "ai-ops-feedback": aiOpsFeedbackEntry,
        "ai-ops-feedback-model": aiOpsFeedbackModelEntry,
        "chat-live-event-source-client": chatLiveEventSourceClientEntry,
        "chat-attachment-file-input-controller": chatAttachmentFileInputControllerEntry,
        "chat-attachment-upload-client": chatAttachmentUploadClientEntry,
        "upload-sidebar-model": uploadSidebarModelEntry,
        "chat-composer-context-model": chatComposerContextModelEntry,
        "chat-composer-current-thread-refresh-model": chatComposerCurrentThreadRefreshModelEntry,
        "chat-composer-events-model": chatComposerEventsModelEntry,
        "chat-composer-editor-model": chatComposerEditorModelEntry,
        "chat-composer-refresh-scheduler-model": chatComposerRefreshSchedulerModelEntry,
        "chat-composer-render-scheduler-model": chatComposerRenderSchedulerModelEntry,
        "chat-composer-shell-model": chatComposerShellModelEntry,
        "app-shell-model": appShellModelEntry,
        "chat-composer-send-ui-model": chatComposerSendUiModelEntry,
        "chat-composer-model-selection-model": chatComposerModelSelectionModelEntry,
        "chat-composer-message-invalidation-model": chatComposerMessageInvalidationModelEntry,
        "chat-composer-event-state-model": chatComposerEventStateModelEntry,
        "chat-composer-source-model": chatComposerSourceModelEntry,
        "chat-scope-model": chatScopeModelEntry,
        "run-progress-model": runProgressModelEntry,
        "thread-list-model": threadListModelEntry,
        "thread-card-message-model": threadCardMessageModelEntry,
        "message-usage-model": messageUsageModelEntry,
        "message-skill-model": messageSkillModelEntry,
        "long-message-model": longMessageModelEntry,
        "chat-composer-streaming-message-model": chatComposerStreamingMessageModelEntry,
        "chat-composer-viewport-model": chatComposerViewportModelEntry,
        "chat-composer-self-check-model": chatComposerSelfCheckModelEntry,
        "chat-composer-draft-model": chatComposerDraftModelEntry,
        "chat-composer-draft-thread-model": chatComposerDraftThreadModelEntry,
        "chat-composer-model": chatComposerModelEntry,
        "chat-composer-native-environment-model": chatComposerNativeEnvironmentModelEntry,
        "chat-composer-send-pipeline-model": chatComposerSendPipelineModelEntry,
        "chat-runtime": chatRuntimeEntry,
        "thread-state-model": threadStateModelEntry,
        "thread-message-model": threadMessageModelEntry,
        "thread-directory-model": threadDirectoryModelEntry,
        "document-preview": documentPreviewEntry,
        "dialog-sheet": dialogSheetEntry,
        "dialog-sheet-model": dialogSheetModelEntry,
        "directory-topic-model": directoryTopicModelEntry,
        "group-topic-model": groupTopicModelEntry,
        "document-preview-model": documentPreviewModelEntry,
        "directory-automation-model": directoryAutomationModelEntry,
        "rich-text-directory-model": richTextDirectoryModelEntry,
        "shared-directory-model": sharedDirectoryModelEntry,
        "tts-profile-model": ttsProfileModelEntry,
        "markdown-renderer-model": markdownRendererModelEntry,
        "task-preview-helpers-model": taskPreviewHelpersModelEntry,
        "todo-detail-model": todoDetailModelEntry,
        "learning-growth-task-model": learningGrowthTaskModelEntry,
        "learning-growth-controller-model": learningGrowthControllerModelEntry,
        "learning-growth-ai-model": learningGrowthAiModelEntry,
        "kanban-card-actions-model": kanbanCardActionsModelEntry,
        "runtime-facade-compat-model": runtimeFacadeCompatModelEntry,
        "learning-native-growth-submission-model": learningNativeGrowthSubmissionModelEntry,
        "kanban-learning-panel-model": kanbanLearningPanelModelEntry,
        "automation-view-model": automationViewModelEntry,
        "kanban-actions-model": kanbanActionsModelEntry,
        "workspace-admin-model": workspaceAdminModelEntry,
        "kanban-study-actions-model": kanbanStudyActionsModelEntry,
        "app-bootstrap-model": appBootstrapModelEntry,
        "shell-start-model": shellStartModelEntry,
        "mobile-layout-model": mobileLayoutModelEntry,
        "fixed-viewport-controller": fixedViewportControllerEntry,
        "kanban-render-model": kanbanRenderModelEntry,
        "kanban-story-core-model": kanbanStoryCoreModelEntry,
        "kanban-list-model": kanbanListModelEntry,
        "learning-reading-model": learningReadingModelEntry,
        "teaching-controller-model": teachingControllerModelEntry,
        "kanban-recorder-model": kanbanRecorderModelEntry,
        "kanban-story-helpers-model": kanbanStoryHelpersModelEntry,
        "learning-program-model": learningProgramModelEntry,
        "api-client-model": apiClientModelEntry,
        "learning-growth-reward-controller-model": learningGrowthRewardControllerModelEntry,
        "learning-growth-settings-controller-model": learningGrowthSettingsControllerModelEntry,
        "learning-coins-model": learningCoinsModelEntry,
        "learning-growth-model": learningGrowthModelEntry,
        "learning-growth-reflection-model": learningGrowthReflectionModelEntry,
        "automation-controller-model": automationControllerModelEntry,
        "kanban-todo-core-model": kanbanTodoCoreModelEntry,
        "home-ai-app-preview": homeAiAppPreviewEntry,
        "home-ai-production-bootstrap": homeAiProductionBootstrapEntry,
        "kanban-composer-actions-model": kanbanComposerActionsModelEntry,
        "message-action-panel": messageActionPanelEntry,
        "message-actions-model": messageActionsModelEntry,
        "action-inbox-model": actionInboxModelEntry,
        "navigation-search-model": navigationSearchModelEntry,
        "navigation-view-model": navigationViewModelEntry,
        "navigation-shell": navigationShellEntry,
        "owner-system-console": ownerSystemConsoleEntry,
        "owner-system-console-model": ownerSystemConsoleModelEntry,
        "workspace-console-model": workspaceConsoleModelEntry,
        "plugin-host": pluginHostEntry,
        "plugin-admin-model": pluginAdminModelEntry,
        "plugin-host-model": pluginHostModelEntry,
        "plugin-context-switch-model": pluginContextSwitchModelEntry,
        "plugin-topic-navigation-model": pluginTopicNavigationModelEntry,
        "access-key-manager-model": accessKeyManagerModelEntry,
        "platform-model": platformModelEntry,
        "pwa-push-status": pwaPushStatusEntry,
        "pwa-push-status-model": pwaPushStatusModelEntry,
        "route-snapshot-model": routeSnapshotModelEntry,
        "share-image-model": shareImageModelEntry,
        "sidebar-back-navigation-model": sidebarBackNavigationModelEntry,
        "task-artifact-helper-model": taskArtifactHelperModelEntry,
        "task-group-model": taskGroupModelEntry,
        "toast-status": toastStatusEntry,
        "voice-input-audio-capture-adapter": voiceInputAudioCaptureAdapterEntry,
        "voice-input-session-controller": voiceInputSessionControllerEntry,
        "voice-input-status": voiceInputStatusEntry,
        "voice-learning-model": voiceLearningModelEntry,
        "wardrobe-model": wardrobeModelEntry,
      },
      output: {
        entryFileNames: "[name]/[name].js",
        chunkFileNames: "[name]/chunks/[name].js",
        assetFileNames: "[name]/assets/[name][extname]",
      },
    },
  },
});
