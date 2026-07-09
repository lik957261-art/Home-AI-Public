"use strict";

const fs = require("node:fs");
const path = require("node:path");

const AUDIT_VERSION = "20260702-vite-global-usage-audit-v1";

const DEFAULT_TARGETS = Object.freeze([
  { kind: "directory", path: "src/vite-app", extensions: [".js", ".mjs"] },
  { kind: "directory", path: "src/vite-islands", extensions: [".js", ".mjs"] },
  { kind: "file", path: "public/app-ai-ops-diagnostics-ui.js" },
  { kind: "file", path: "public/app-runtime-facade-ui.js" },
  { kind: "file", path: "public/app-owner-system-console-ui.js" },
  { kind: "file", path: "public/app-voice-input-ui.js" },
  { kind: "file", path: "public/app-task-preview-helpers-ui.js" },
  { kind: "file", path: "public/app-task-preview-ui.js" },
  { kind: "file", path: "public/directory-viewer.html" },
]);

const GLOBAL_USAGE_ALLOWLIST = Object.freeze([
  {
    id: "runtime-facade-classic-compat",
    owner: "Static Client Vite migration",
    reason: "Expose the single documented facade bridge while classic and Vite shells coexist.",
    removalTrigger: "Remove after the classic ordered shell is retired or after all consumers import the facade directly.",
    files: [
      "src/vite-app/runtime/home-ai-runtime-facade.mjs",
      "src/vite-app/main.mjs",
      "src/vite-app/production-bootstrap.mjs",
      "src/vite-islands/ai-ops-feedback/main.mjs",
      "src/vite-islands/chat-runtime/main.mjs",
      "src/vite-islands/dialog-sheet/main.mjs",
      "src/vite-islands/document-preview/main.mjs",
      "src/vite-islands/message-action-panel/main.mjs",
      "src/vite-islands/navigation-shell/main.mjs",
      "src/vite-islands/owner-system-console/main.mjs",
      "src/vite-islands/plugin-host/main.mjs",
      "src/vite-islands/pwa-push-status/main.mjs",
      "src/vite-islands/toast-status/main.mjs",
      "src/vite-islands/voice-input-status/main.mjs",
      "public/app-ai-ops-diagnostics-ui.js",
      "public/app-runtime-facade-ui.js",
      "public/app-owner-system-console-ui.js",
      "public/app-voice-input-ui.js",
      "public/directory-viewer.html",
    ],
    rules: ["custom_global_property", "dynamic_global_property"],
    names: ["HomeAiRuntimeFacade", "propertyName"],
  },
  {
    id: "ai-ops-diagnostic-classic-global",
    owner: "AI Operations diagnostic feedback UI",
    reason: "The classic shell exposes the diagnostic feedback controller as a static-script global while the module remains outside the Vite bundle.",
    removalTrigger: "Remove after the feedback/diagnostic surface is migrated to a Vite module with an imported mount adapter.",
    files: ["public/app-ai-ops-diagnostics-ui.js"],
    rules: ["custom_global_property"],
    names: ["HomeAIDiagnosticFeedback"],
  },
  {
    id: "vite-dev-preview-hooks",
    owner: "Static Client Vite migration",
    reason: "Expose bounded development-only preview controls for local harnesses.",
    removalTrigger: "Remove when the development preview host is replaced by the real Vite shell entry.",
    files: [
      "src/vite-app/main.mjs",
      "src/vite-islands/ai-ops-feedback/main.mjs",
      "src/vite-islands/chat-runtime/main.mjs",
      "src/vite-islands/dialog-sheet/main.mjs",
      "src/vite-islands/document-preview/main.mjs",
      "src/vite-islands/message-action-panel/main.mjs",
      "src/vite-islands/navigation-shell/main.mjs",
      "src/vite-islands/owner-system-console/main.mjs",
      "src/vite-islands/plugin-host/main.mjs",
      "src/vite-islands/pwa-push-status/main.mjs",
      "src/vite-islands/toast-status/main.mjs",
      "src/vite-islands/voice-input-status/main.mjs",
    ],
    rules: ["custom_global_property"],
    names: [
      "HomeAIViteAiOpsFeedbackPreview",
      "HomeAIViteAppPreview",
      "HomeAIViteChatRuntimePreview",
      "HomeAIViteDialogSheetPreview",
      "HomeAIViteDocumentPreviewPreview",
      "HomeAIViteMessageActionPanelPreview",
      "HomeAIViteNavigationShellPreview",
      "HomeAIViteOwnerSystemConsolePreview",
      "HomeAIVitePluginHostPreview",
      "HomeAIVitePwaPushStatusPreview",
      "HomeAIViteToastStatusPreview",
      "HomeAIViteVoiceInputStatusPreview",
    ],
  },
  {
    id: "runtime-facade-auth-api-boundary",
    owner: "Static Client Vite migration",
    reason: "The runtime facade owns access-key storage, cookie sync, and API fetch; the API client model owns Home AI auth/client-version header planning.",
    removalTrigger: "Keep until auth/API access is delegated to a typed shared client imported by the Vite shell.",
    files: [
      "src/vite-app/runtime/home-ai-runtime-facade.mjs",
      "src/vite-islands/navigation-shell/api-client-model.mjs",
    ],
    rules: ["direct_storage", "direct_fetch", "auth_header", "document_cookie"],
    names: ["localStorage", "sessionStorage", "fetch", "X-Hermes-Web-Key", "X-Hermes-Web-Client-Version", "cookie"],
  },
  {
    id: "classic-runtime-facade-browser-boundary",
    owner: "Static Client Vite migration",
    reason: "The classic shell bootstrap owns the temporary browser fetch/storage/cookie boundary until the full shell imports the ESM runtime facade.",
    removalTrigger: "Remove after production classic static scripts are replaced by the Vite runtime facade import path.",
    files: ["public/app-runtime-facade-ui.js"],
    rules: ["direct_fetch", "direct_storage", "auth_header", "document_cookie"],
    names: ["fetch", "localStorage", "X-Hermes-Web-Key", "cookie"],
  },
  {
    id: "vite-preview-static-manifest-fetch",
    owner: "Static Client Vite migration",
    reason: "The preview host may fetch the Vite manifest as static build metadata; it is not an authenticated Home AI API call.",
    removalTrigger: "Remove when preview metadata is passed through the runtime facade or server-rendered dev metadata.",
    files: ["src/vite-app/main.mjs"],
    rules: ["direct_fetch"],
    names: ["fetch"],
  },
  {
    id: "runtime-facade-classic-api-client",
    owner: "Static Client Vite migration",
    reason: "The facade may delegate to the existing classic API client factory when the classic shell provides it.",
    removalTrigger: "Remove after the classic API client is replaced by a module import shared by both shells.",
    files: ["src/vite-app/runtime/home-ai-runtime-facade.mjs", "public/app-runtime-facade-ui.js"],
    rules: ["custom_global_property", "classic_api_client"],
    names: ["HermesAppApiClient"],
  },
  {
    id: "runtime-facade-native-bridge-detection",
    owner: "Static Client Vite migration",
    reason: "The facade centralizes bounded native-shell capability detection for iOS and native-share/voice bridges.",
    removalTrigger: "Keep until native shell capabilities are supplied by a typed injected capability object.",
    files: ["src/vite-app/runtime/home-ai-runtime-facade.mjs", "src/vite-app/production-bootstrap.mjs", "public/app-runtime-facade-ui.js"],
    rules: ["custom_global_property", "ios_webkit_bridge"],
    names: [
      "HomeAINativeBridge",
      "HermesNativeBridge",
      "HomeAINativeVoice",
      "HomeAINativeVoiceInput",
      "HomeAINativeVoiceInputCapability",
      "HomeAIVoiceInput",
      "HomeAINativeShareCapability",
      "HomeAINativeShare",
      "webkit",
    ],
  },
  {
    id: "runtime-facade-event-source-boundary",
    owner: "Static Client Vite migration",
    reason: "The runtime facade owns EventSource construction while Vite chat runtime keeps the transport factory injected.",
    removalTrigger: "Keep until SSE transport is supplied by an imported typed client shared by classic and Vite shells.",
    files: ["src/vite-app/runtime/home-ai-runtime-facade.mjs", "public/app-runtime-facade-ui.js"],
    rules: ["custom_global_property"],
    names: ["EventSource"],
  },
  {
    id: "voice-input-audio-browser-boundary",
    owner: "Host Voice Input UI",
    reason: "Voice recording and streaming must select the browser AudioContext implementation at the capture boundary while the voice UI remains in the classic shell.",
    removalTrigger: "Remove after voice recording is migrated behind an imported Vite voice/audio capture adapter.",
    files: ["public/app-voice-input-ui.js"],
    rules: ["custom_global_property"],
    names: ["AudioContext"],
  },
  {
    id: "directory-viewer-theme-bootstrap",
    owner: "Static Client Vite migration",
    reason: "Directory viewer reads the persisted theme before app scripts load to avoid a first-paint theme flash.",
    removalTrigger: "Remove after directory viewer is migrated to an imported Vite entry with server-provided theme bootstrap.",
    files: ["public/directory-viewer.html"],
    rules: ["direct_storage"],
    names: ["localStorage"],
  },
  {
    id: "directory-viewer-preview-ui-bridge",
    owner: "Static Client Vite migration",
    reason: "Directory viewer temporarily calls the classic task/document preview overlay global after loading the preview UI script.",
    removalTrigger: "Remove after directory viewer and task preview UI are migrated to imported Vite modules.",
    files: ["public/directory-viewer.html"],
    rules: ["custom_global_property"],
    names: ["TaskDocumentPreviewUi"],
  },
]);

const RULES = Object.freeze([
  {
    id: "custom_global_property",
    pattern: /\b(window|globalThis|root|browserRoot)(?:\?\.|\.)\s*([A-Z][A-Za-z0-9_$]*)\b/g,
    name: (match) => match[2],
  },
  {
    id: "dynamic_global_property",
    pattern: /\broot\s*\[\s*propertyName\s*\]|\bObject\.defineProperty\s*\(\s*root\s*,\s*propertyName/g,
    name: () => "propertyName",
  },
  {
    id: "ios_webkit_bridge",
    pattern: /\b(window|globalThis|root|browserRoot)(?:\?\.|\.)\s*webkit\b/g,
    name: () => "webkit",
  },
  {
    id: "window_state",
    pattern: /\b(window|globalThis|root|browserRoot)(?:\?\.|\.)\s*state\b/g,
    name: () => "state",
  },
  {
    id: "direct_storage",
    pattern: /\b(window|globalThis|root|browserRoot|windowRef|global)(?:\?\.|\.)\s*(localStorage|sessionStorage)\b|(?<![\w$.])\b(localStorage|sessionStorage)\b/g,
    name: (match) => match[2] || match[3],
  },
  {
    id: "direct_fetch",
    pattern: /\b(window|globalThis|root|browserRoot|windowRef|global)(?:\?\.|\.)\s*fetch\s*\(|(?<![\w$.])\bfetch\s*\(/g,
    name: () => "fetch",
  },
  {
    id: "auth_header",
    pattern: /X-Hermes-Web-(?:Key|Client-Version)/g,
    name: (match) => match[0],
  },
  {
    id: "document_cookie",
    pattern: /\b(?:document|documentRef)\.cookie\b/g,
    name: () => "cookie",
  },
  {
    id: "classic_api_client",
    pattern: /\bHermesAppApiClient\b/g,
    name: () => "HermesAppApiClient",
  },
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function lineColumnFor(text, index) {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function walkFiles(root, extensions, output = []) {
  if (!fs.existsSync(root)) return output;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, output);
      continue;
    }
    if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function collectTargetFiles(repoRoot, targets = DEFAULT_TARGETS) {
  const absoluteFiles = new Set();
  for (const target of targets) {
    const targetPath = path.join(repoRoot, target.path);
    if (target.kind === "file") {
      if (fs.existsSync(targetPath)) absoluteFiles.add(targetPath);
      continue;
    }
    for (const file of walkFiles(targetPath, target.extensions || [".js", ".mjs"])) {
      absoluteFiles.add(file);
    }
  }
  return [...absoluteFiles].sort().map((absolutePath) => {
    const relativePath = toPosix(path.relative(repoRoot, absolutePath));
    return {
      relativePath,
      text: fs.readFileSync(absolutePath, "utf8"),
    };
  });
}

function scanSourceRecord(record) {
  const findings = [];
  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match = pattern.exec(record.text);
    while (match) {
      const position = lineColumnFor(record.text, match.index);
      findings.push({
        rule: rule.id,
        name: rule.name(match),
        relativePath: record.relativePath,
        line: position.line,
        column: position.column,
        snippet: match[0].slice(0, 120),
      });
      match = pattern.exec(record.text);
    }
  }
  return findings;
}

function entryMatchesFile(entry, relativePath) {
  return entry.files.some((file) => {
    if (file.endsWith("/")) return relativePath.startsWith(file);
    return relativePath === file;
  });
}

function entryMatchesFinding(entry, finding) {
  return (
    entryMatchesFile(entry, finding.relativePath) &&
    entry.rules.includes(finding.rule) &&
    (entry.names.includes("*") || entry.names.includes(finding.name))
  );
}

function annotateFindings(findings, allowlist = GLOBAL_USAGE_ALLOWLIST) {
  return findings.map((finding) => {
    const allowlistEntry = allowlist.find((entry) => entryMatchesFinding(entry, finding));
    return Object.assign({}, finding, {
      allowed: Boolean(allowlistEntry),
      allowlistId: allowlistEntry?.id || "",
      owner: allowlistEntry?.owner || "",
    });
  });
}

function summarizeByRule(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.rule] = (counts[finding.rule] || 0) + 1;
  }
  return counts;
}

function auditSourceRecords(records, options = {}) {
  const allowlist = options.allowlist || GLOBAL_USAGE_ALLOWLIST;
  const rawFindings = records.flatMap(scanSourceRecord);
  const annotatedFindings = annotateFindings(rawFindings, allowlist);
  const unmanagedFindings = annotatedFindings.filter((finding) => !finding.allowed);
  return {
    ok: unmanagedFindings.length === 0,
    auditVersion: AUDIT_VERSION,
    targetCount: records.length,
    occurrenceCount: annotatedFindings.length,
    unmanagedCount: unmanagedFindings.length,
    byRule: summarizeByRule(annotatedFindings),
    allowlist: allowlist.map((entry) => ({
      id: entry.id,
      owner: entry.owner,
      reason: entry.reason,
      removalTrigger: entry.removalTrigger,
      files: entry.files,
      rules: entry.rules,
      names: entry.names,
    })),
    findings: unmanagedFindings,
    occurrences: annotatedFindings,
  };
}

function runViteGlobalUsageAudit(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const records = options.records || collectTargetFiles(repoRoot, options.targets || DEFAULT_TARGETS);
  return auditSourceRecords(records, {
    allowlist: options.allowlist || GLOBAL_USAGE_ALLOWLIST,
  });
}

function printHuman(result) {
  if (result.ok) {
    console.log(`ok - ${AUDIT_VERSION}: ${result.occurrenceCount} tracked global usage occurrences are allowlisted`);
    return;
  }
  console.error(`not ok - ${AUDIT_VERSION}: ${result.unmanagedCount} unmanaged global usage occurrence(s)`);
  for (const finding of result.findings) {
    console.error(`${finding.relativePath}:${finding.line}:${finding.column} ${finding.rule} ${finding.name} ${finding.snippet}`);
  }
}

if (require.main === module) {
  const result = runViteGlobalUsageAudit();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  if (!result.ok) process.exit(1);
}

module.exports = {
  AUDIT_VERSION,
  DEFAULT_TARGETS,
  GLOBAL_USAGE_ALLOWLIST,
  RULES,
  auditSourceRecords,
  collectTargetFiles,
  runViteGlobalUsageAudit,
  scanSourceRecord,
};
