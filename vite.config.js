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
const ownerSystemConsolePreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/owner-system-console/index.html",
);
const aiOpsFeedbackEntry = path.resolve(
  __dirname,
  "src/vite-islands/ai-ops-feedback/main.mjs",
);
const aiOpsFeedbackPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/ai-ops-feedback/index.html",
);
const voiceInputStatusEntry = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/main.mjs",
);
const voiceInputStatusPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/voice-input-status/index.html",
);
const chatRuntimeEntry = path.resolve(
  __dirname,
  "src/vite-islands/chat-runtime/main.mjs",
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
const messageActionPanelPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/message-action-panel/index.html",
);
const pluginHostEntry = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/main.mjs",
);
const pluginHostPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/plugin-host/index.html",
);
const documentPreviewEntry = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/main.mjs",
);
const documentPreviewPreviewHtml = path.resolve(
  __dirname,
  "src/vite-islands/document-preview/index.html",
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
      input: {
        "ai-ops-feedback": aiOpsFeedbackEntry,
        "chat-runtime": chatRuntimeEntry,
        "document-preview": documentPreviewEntry,
        "home-ai-app-preview": homeAiAppPreviewEntry,
        "home-ai-production-bootstrap": homeAiProductionBootstrapEntry,
        "message-action-panel": messageActionPanelEntry,
        "navigation-shell": navigationShellEntry,
        "owner-system-console": ownerSystemConsoleEntry,
        "plugin-host": pluginHostEntry,
        "voice-input-status": voiceInputStatusEntry,
      },
      output: {
        entryFileNames: "[name]/[name].js",
        chunkFileNames: "[name]/chunks/[name].js",
        assetFileNames: "[name]/assets/[name][extname]",
      },
    },
  },
});
