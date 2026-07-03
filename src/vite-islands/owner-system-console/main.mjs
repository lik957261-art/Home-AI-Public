import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  ownerConsoleError,
  renderErrorHtml,
  renderLoadingHtml,
  renderOwnerConsoleHtml,
} from "./model.mjs";

const OVERVIEW_API_PATH = "/api/owner/system-console";
const STATUS_API_PATH = "/api/owner/system-console/system-status";
const CLIENT_VERSION = "20260702-vite-owner-console-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-owner-system-console-preview",
  clientVersion: CLIENT_VERSION,
  appState: {
    ownerSystemConsolePreview: true,
  },
  attachClassicCompatibility: true,
});

async function fetchOwnerJson(path) {
  try {
    return await runtime.api(path, {
      headers: { Accept: "application/json" },
    }) || {};
  } catch (error) {
    throw ownerConsoleError(error);
  }
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-owner-console-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-owner-console-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function renderHtml(root, html) {
  root.innerHTML = html;
  installStyles(root);
}

function renderConsole(root, overviewPayload, statusPayload) {
  renderHtml(root, renderOwnerConsoleHtml(overviewPayload, statusPayload));
  root.querySelector("[data-osc-refresh]")?.addEventListener("click", () => loadConsole(root));
}

function renderLoading(root) {
  renderHtml(root, renderLoadingHtml());
}

function renderError(root, error) {
  renderHtml(root, renderErrorHtml(error));
}

async function loadConsole(root) {
  renderLoading(root);
  runtime.events?.emit?.("owner-system-console:load:start", { source: "vite-island" });
  try {
    const [overviewPayload, statusPayload] = await Promise.all([
      fetchOwnerJson(OVERVIEW_API_PATH),
      fetchOwnerJson(STATUS_API_PATH),
    ]);
    runtime.state?.set?.({
      ownerSystemConsoleLoadedAt: new Date().toISOString(),
      ownerSystemConsoleStatus: "ready",
    });
    runtime.events?.emit?.("owner-system-console:load:success", { source: "vite-island" });
    renderConsole(root, overviewPayload, statusPayload);
  } catch (error) {
    runtime.state?.set?.({
      ownerSystemConsoleStatus: "error",
      ownerSystemConsoleError: error?.code || error?.message || "unknown_error",
    });
    runtime.events?.emit?.("owner-system-console:load:error", {
      source: "vite-island",
      code: error?.code || "",
      status: error?.status || 0,
    });
    renderError(root, error);
  }
}

export function mount(target = document.querySelector("[data-homeai-vite-owner-console]")) {
  if (!target) return null;
  installStyles(target);
  loadConsole(target);
  return {
    refresh: () => loadConsole(target),
  };
}

window.HomeAIViteOwnerSystemConsolePreview = Object.freeze({
  mount,
  runtimeSnapshot: () => runtime.snapshot?.() || {},
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
