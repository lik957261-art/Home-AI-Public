import { createHomeAiRuntimeFacade, RUNTIME_FACADE_VERSION } from "./runtime/home-ai-runtime-facade.mjs";
import { createEditableFocusLifecycleGuard, FOCUS_LIFECYCLE_GUARD_VERSION } from "./runtime/focus-lifecycle-guard.mjs";

const PRODUCTION_BOOTSTRAP_VERSION = "20260703-vite-production-bootstrap-v1";
const CUTOVER_VERSION = "20260703-vite-production-cutover-v1";

function clientVersion(documentRef = document) {
  return documentRef?.querySelector?.("meta[name='hermes-web-client-version'], meta[name='home-ai-client-version']")?.getAttribute?.("content")
    || documentRef?.documentElement?.dataset?.clientVersion
    || "";
}

function composerInput() {
  return document.getElementById("messageInput");
}

function composerContainer() {
  return document.getElementById("composer");
}

function isNativeShell() {
  return Boolean(
    document.documentElement?.classList?.contains("native-shell-ios")
      || document.documentElement?.classList?.contains("native-shell-android")
      || window.HomeAiRuntimeFacade?.native?.isNativeShell
      || window.HomeAINativeBridge
      || window.webkit?.messageHandlers?.homeAI,
  );
}

function installProductionBootstrap(root = window) {
  const existingFacade = root.HomeAiRuntimeFacade || null;
  const viteFacade = createHomeAiRuntimeFacade({
    root,
    mode: "vite-production-bootstrap",
    clientVersion: clientVersion(root.document),
    appState: {
      shellMode: "vite",
      cutoverVersion: CUTOVER_VERSION,
      productionBootstrapVersion: PRODUCTION_BOOTSTRAP_VERSION,
    },
    attachClassicCompatibility: false,
  });

  const focusGuard = createEditableFocusLifecycleGuard({
    root,
    documentRef: root.document,
    getComposerInput: composerInput,
    getComposerContainer: composerContainer,
    isNativeShell,
  });
  const focusStatus = focusGuard.install();

  root.document?.documentElement?.setAttribute?.("data-home-ai-shell-mode", "vite");
  root.document?.documentElement?.setAttribute?.("data-home-ai-vite-production", PRODUCTION_BOOTSTRAP_VERSION);

  const status = Object.freeze({
    ok: true,
    shellMode: "vite",
    cutoverVersion: CUTOVER_VERSION,
    productionBootstrapVersion: PRODUCTION_BOOTSTRAP_VERSION,
    runtimeFacadeVersion: RUNTIME_FACADE_VERSION,
    focusGuardVersion: FOCUS_LIFECYCLE_GUARD_VERSION,
    classicFacadePreserved: Boolean(existingFacade && root.HomeAiRuntimeFacade === existingFacade),
    viteFacadeMode: viteFacade.snapshot().mode,
    focusGuardInstalled: Boolean(focusStatus.installed),
    checkedAt: new Date().toISOString(),
  });

  Object.defineProperty(root, "HomeAiViteProduction", {
    value: Object.freeze({
      version: PRODUCTION_BOOTSTRAP_VERSION,
      cutoverVersion: CUTOVER_VERSION,
      focusGuard,
      status: () => status,
      runtimeSnapshot: () => viteFacade.snapshot(),
    }),
    configurable: true,
    enumerable: false,
    writable: false,
  });

  root.dispatchEvent?.(new CustomEvent("homeai:vite-production-ready", {
    detail: status,
  }));
  return status;
}

const status = installProductionBootstrap();

export {
  CUTOVER_VERSION,
  PRODUCTION_BOOTSTRAP_VERSION,
  installProductionBootstrap,
  status,
};
