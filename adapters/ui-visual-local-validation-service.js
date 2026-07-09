"use strict";

const UI_VISUAL_LOCAL_VALIDATION_VERSION = "20260709-ui-visual-local-validation-v1";
const UI_VISUAL_LOCAL_VALIDATION_REQUIRED = "ui_visual_local_validation_required";

const PASS_VALUES = new Set(["pass", "passed", "ok", "success", "succeeded", "true"]);
const UI_ASSERTION_HINTS = new Set([
  "no-overlap",
  "no_overlap",
  "no-clipping",
  "no_clipping",
  "no-wrap",
  "no_wrap",
  "no-overflow",
  "no_overflow",
  "safe-area",
  "safe_area",
  "layout-bounds",
  "layout_bounds",
  "geometry",
  "canvas-pixels",
  "canvas_pixels",
  "visible",
  "tap-targets",
  "tap_targets",
]);
const PRIVATE_KEY_PATTERN = /(?:secret|token|cookie|authorization|password|accessKey|ownerKey|launchToken|endpointBody|privateThread|rawLog|rawLogs|dbRows|databaseRows|providerPayload|fullPrompt|imageBytes|rawScreenshot|rawImage|screenshotPath|screenshotBase64|screenshotData)/i;
const PRIVATE_VALUE_PATTERN = /(?:Bearer\s+[A-Za-z0-9._~+/-]+|-----BEGIN [^-]+PRIVATE KEY-----|data:image\/|\/Users\/[^ \n\r\t]*(?:secret|password|key)[^ \n\r\t]*)/i;

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function normalizedList(value, maxItems = 80, maxLength = 400) {
  return arrayValue(value)
    .flatMap((item) => String(item || "").split(","))
    .map((item) => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function boolValue(value, defaultValue = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
}

function statusPassed(item = {}) {
  if (item.ok === true || item.passed === true) return true;
  const status = lower(item.status || item.result || item.state || item.outcome, 80);
  return PASS_VALUES.has(status);
}

function normalizedPath(value) {
  return clean(value, 800).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isDocsOnlyPath(filePath) {
  const value = lower(filePath, 800);
  return /(^|\/)docs\//.test(value) || /\.(md|markdown|txt|adoc|rst)$/.test(value);
}

function isTestOnlyPath(filePath) {
  const value = lower(filePath, 800);
  return /(^|\/)tests?\//.test(value) || /(?:^|\/)__tests__(?:\/|$)/.test(value) || /\.(test|spec)\.(js|mjs|cjs|ts|tsx|jsx)$/.test(value);
}

function classifyUiChangedFile(filePath) {
  const path = normalizedPath(filePath);
  const value = lower(path, 800);
  if (!value || isDocsOnlyPath(value) || isTestOnlyPath(value)) {
    return { isUi: false, path, reason: "" };
  }

  if (/^(public\/index\.html|public\/service-worker\.js|public\/directory-viewer\.html)$/.test(value)) {
    return { isUi: true, path, reason: "static_client_cache_marker" };
  }
  if (/^public\/.+\.(js|mjs|css|html)$/.test(value)) {
    return { isUi: true, path, reason: "home_ai_host_static_ui" };
  }
  if (/^public\/(?:vite-islands|assets|android)\//.test(value)) {
    return { isUi: true, path, reason: "home_ai_built_ui_artifact" };
  }
  if (/^(src\/vite-|src\/vite-islands\/|src\/frontend\/|frontend\/)/.test(value)) {
    return { isUi: true, path, reason: "home_ai_vite_or_frontend_ui" };
  }
  if (/^(plugins\/[^/]+|movie)\/(?:public|frontend|web|dist\/web|src\/.*(?:components|ui|views|pages)|assets)\//.test(value)) {
    return { isUi: true, path, reason: "embedded_plugin_ui" };
  }
  if (/\.(css|html|htm|jsx|tsx|vue|svelte|hbs|handlebars|ejs|mustache)$/.test(value)) {
    return { isUi: true, path, reason: "visible_template_or_layout" };
  }
  return { isUi: false, path, reason: "" };
}

function classifyUiChangedFiles(changedFiles = []) {
  const files = normalizedList(changedFiles, 160, 800);
  const uiFiles = [];
  const nonUiFiles = [];
  for (const file of files) {
    const classified = classifyUiChangedFile(file);
    if (classified.isUi) uiFiles.push(classified);
    else nonUiFiles.push(classified.path);
  }
  return {
    changedFiles: files,
    uiFiles,
    nonUiFiles,
    uiFileCount: uiFiles.length,
  };
}

function evidenceObject(input = {}) {
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
  return evidence;
}

function evidenceSurfaces(input = {}) {
  const evidence = evidenceObject(input);
  return normalizedList(evidence.uiSurfaces || evidence.surfaces || input.uiSurfaces || input.surfaces, 32, 160);
}

function evidenceLocalTests(input = {}) {
  const evidence = evidenceObject(input);
  return arrayValue(evidence.localTests || evidence.tests || input.localTests || input.tests)
    .filter((item) => item && typeof item === "object")
    .slice(0, 40);
}

function evidenceVisualVerifications(input = {}) {
  const evidence = evidenceObject(input);
  return arrayValue(evidence.visualVerifications || evidence.visualEvidence || evidence.visualChecks || input.visualVerifications || input.visualEvidence)
    .filter((item) => item && typeof item === "object")
    .slice(0, 40);
}

function itemHasNameOrCommand(item = {}) {
  return Boolean(clean(item.command || item.name || item.harness || item.script || item.test, 240));
}

function visualHasMethod(item = {}) {
  return Boolean(clean(item.method || item.harness || item.scenario || item.tool || item.command, 240));
}

function visualHasViewportOrDevice(item = {}) {
  return Boolean(clean(item.viewport || item.viewports || item.device || item.devices || item.coverage || item.surface, 240));
}

function visualAssertions(item = {}) {
  const values = normalizedList(item.assertions || item.layoutAssertions || item.checked || item.checks, 40, 120)
    .map((entry) => lower(entry, 120));
  if (item.noOverlap === true) values.push("no-overlap");
  if (item.noClipping === true) values.push("no-clipping");
  if (item.noOverflow === true) values.push("no-overflow");
  if (item.noWrap === true) values.push("no-wrap");
  if (item.safeArea === true) values.push("safe-area");
  return values;
}

function visualHasLayoutAssertions(item = {}) {
  return visualAssertions(item).some((entry) => UI_ASSERTION_HINTS.has(entry));
}

function hasPrivateEvidence(value, keyName = "", depth = 0) {
  if (PRIVATE_KEY_PATTERN.test(String(keyName || ""))) return true;
  if (value == null || typeof value === "boolean" || typeof value === "number") return false;
  if (typeof value === "string") return PRIVATE_VALUE_PATTERN.test(value);
  if (depth > 6) return false;
  if (Array.isArray(value)) return value.some((item) => hasPrivateEvidence(item, "", depth + 1));
  if (typeof value === "object") {
    return Object.entries(value).some(([key, item]) => hasPrivateEvidence(item, key, depth + 1));
  }
  return false;
}

function summarizeEvidence(input = {}) {
  const localTests = evidenceLocalTests(input);
  const visualVerifications = evidenceVisualVerifications(input);
  return {
    uiSurfaces: evidenceSurfaces(input),
    localTestCount: localTests.length,
    passedLocalTestCount: localTests.filter((item) => statusPassed(item)).length,
    visualVerificationCount: visualVerifications.length,
    passedVisualVerificationCount: visualVerifications.filter((item) => statusPassed(item)).length,
    viewportOrDeviceCount: visualVerifications.filter((item) => visualHasViewportOrDevice(item)).length,
    layoutAssertionCount: visualVerifications.filter((item) => visualHasLayoutAssertions(item)).length,
  };
}

function issue(code, detail = "") {
  return {
    code: clean(code, 120),
    detail: clean(detail, 320),
  };
}

function buildUiVisualLocalValidation(input = {}) {
  const classification = classifyUiChangedFiles(input.changedFiles || input.changedFile || []);
  const uiImpact = boolValue(input.uiImpact || input.visibleUiImpact || input.visible_ui_impact, false);
  const required = classification.uiFileCount > 0 || uiImpact;
  const evidence = evidenceObject(input);
  const localTests = evidenceLocalTests(input);
  const visualVerifications = evidenceVisualVerifications(input);
  const issues = [];

  if (hasPrivateEvidence(evidence)) {
    issues.push(issue("ui_visual_evidence_privacy_violation", "Evidence packet contains a private-looking key or raw value."));
  }

  if (required) {
    if (!classification.changedFiles.length) {
      issues.push(issue("ui_visual_changed_files_required", "UI validation requires changed file metadata."));
    }
    if (!evidenceSurfaces(input).length) {
      issues.push(issue("ui_visual_surface_required", "Evidence packet must name the changed UI surface."));
    }
    const passingLocalTests = localTests.filter((item) => statusPassed(item) && itemHasNameOrCommand(item));
    if (!passingLocalTests.length) {
      issues.push(issue("ui_visual_local_tests_required", "UI changes require passed local focused test evidence."));
    }
    const passingVisuals = visualVerifications.filter((item) => (
      statusPassed(item)
      && visualHasMethod(item)
      && visualHasViewportOrDevice(item)
      && visualHasLayoutAssertions(item)
    ));
    if (!passingVisuals.length) {
      issues.push(issue("ui_visual_verification_required", "UI changes require passed visual evidence with method, viewport/device coverage, and layout assertions."));
    }
  }

  const ok = !issues.length;
  const issueCodes = issues.map((item) => item.code);
  if (required && !ok && !issueCodes.includes(UI_VISUAL_LOCAL_VALIDATION_REQUIRED)) {
    issues.unshift(issue(UI_VISUAL_LOCAL_VALIDATION_REQUIRED, "UI-affecting changes cannot deploy before local tests and visual verification pass."));
  }

  return {
    ok: !issues.length,
    schemaVersion: 1,
    version: UI_VISUAL_LOCAL_VALIDATION_VERSION,
    source: "ui_visual_local_validation_service",
    issueCode: required && issues.length ? UI_VISUAL_LOCAL_VALIDATION_REQUIRED : "",
    issueCodes: issues.map((item) => item.code),
    required,
    uiImpact,
    changedFiles: classification.changedFiles,
    uiFiles: classification.uiFiles,
    uiFileCount: classification.uiFileCount,
    nonUiFileCount: classification.nonUiFiles.length,
    evidence: summarizeEvidence(input),
    issues,
    policy: {
      deploymentBlockedWhenRequiredAndNotOk: true,
      boundedMetadataOnly: true,
      localTestsRequired: true,
      visualVerificationRequired: true,
      viewportOrDeviceCoverageRequired: true,
      layoutAssertionsRequired: true,
    },
  };
}

module.exports = {
  UI_VISUAL_LOCAL_VALIDATION_REQUIRED,
  UI_VISUAL_LOCAL_VALIDATION_VERSION,
  buildUiVisualLocalValidation,
  classifyUiChangedFile,
  classifyUiChangedFiles,
};
