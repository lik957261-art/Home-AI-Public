"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  validateViteProductionReadback,
} = require("./vite-production-readback-validator");

const STATUS_CHECK_VERSION = "20260704-vite-production-status-v1";
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_BOOTSTRAP_PATH =
  "public/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js";
const VITE_MANIFEST_PATH = "public/vite-islands/.vite/manifest.json";

const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { id: "launch_token_url", pattern: /[?&](?:launchToken|launch_token|token)=[^&\s]{8,}/i },
  { id: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { id: "cookie_header", pattern: /\bCookie:\s*[^;\s]+=/i },
  { id: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    requireOk: false,
    repoRoot: DEFAULT_REPO_ROOT,
    baseUrl: "",
    readbackJson: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-ok") {
      options.requireOk = true;
    } else if (arg === "--repo-root") {
      options.repoRoot = path.resolve(argv[index + 1] || options.repoRoot);
      index += 1;
    } else if (arg.startsWith("--repo-root=")) {
      options.repoRoot = path.resolve(arg.slice("--repo-root=".length));
    } else if (arg === "--base") {
      options.baseUrl = normalizeBaseUrl(argv[index + 1] || "");
      index += 1;
    } else if (arg.startsWith("--base=")) {
      options.baseUrl = normalizeBaseUrl(arg.slice("--base=".length));
    } else if (arg === "--readback-json") {
      options.readbackJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--readback-json=")) {
      options.readbackJson = arg.slice("--readback-json=".length);
    }
  }

  return options;
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readTextIfExists(filePath) {
  try {
    return { ok: true, text: fs.readFileSync(filePath, "utf8"), error: "" };
  } catch (error) {
    return { ok: false, text: "", error: error.message };
  }
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text), error: "" };
  } catch (error) {
    return { ok: false, value: null, error: error.message };
  }
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lower) return String(value || "");
  }
  return "";
}

function passedCheck(id, summary, evidence = {}) {
  return {
    id,
    ok: true,
    status: "passed",
    summary,
    evidence,
  };
}

function failedCheck(id, summary, evidence = {}) {
  return {
    id,
    ok: false,
    status: "failed",
    summary,
    evidence,
  };
}

function scanForbiddenValues(payload) {
  const text = JSON.stringify(payload || {});
  const findings = [];
  for (const entry of FORBIDDEN_VALUE_PATTERNS) {
    if (entry.pattern.test(text)) findings.push(entry.id);
  }
  return findings;
}

function collectSourceChecks(repoRoot) {
  const checks = [];
  const configPath = path.join(repoRoot, "config/home-ai-shell-mode.json");
  const config = readTextIfExists(configPath);
  const parsedConfig = config.ok ? safeJsonParse(config.text) : { ok: false, value: null, error: config.error };
  const shellMode = parsedConfig.ok ? String(parsedConfig.value.shellMode || "") : "";
  checks.push(
    shellMode === "vite"
      ? passedCheck("source_shell_mode_config", "Source shell mode selects Vite.", {
          shellMode,
          cutoverVersion: parsedConfig.value.cutoverVersion || "",
        })
      : failedCheck("source_shell_mode_config", "Source shell mode must be Vite after production cutover.", {
          shellMode,
          error: parsedConfig.error || "",
        }),
  );

  const bootstrap = readTextIfExists(path.join(repoRoot, PRODUCTION_BOOTSTRAP_PATH));
  checks.push(
    bootstrap.ok && bootstrap.text.includes("HomeAiViteProduction")
      ? passedCheck("source_vite_bootstrap_asset", "Production Vite bootstrap asset is present.", {
          path: PRODUCTION_BOOTSTRAP_PATH,
          marker: "HomeAiViteProduction",
        })
      : failedCheck("source_vite_bootstrap_asset", "Production Vite bootstrap asset is missing or invalid.", {
          path: PRODUCTION_BOOTSTRAP_PATH,
          error: bootstrap.error || "marker_missing",
        }),
  );

  const manifest = readTextIfExists(path.join(repoRoot, VITE_MANIFEST_PATH));
  const parsedManifest = manifest.ok ? safeJsonParse(manifest.text) : { ok: false, value: null, error: manifest.error };
  checks.push(
    parsedManifest.ok && parsedManifest.value && typeof parsedManifest.value === "object"
      ? passedCheck("source_vite_manifest", "Vite manifest exists in built static assets.", {
          path: VITE_MANIFEST_PATH,
          entryCount: Object.keys(parsedManifest.value).length,
        })
      : failedCheck("source_vite_manifest", "Vite manifest is missing or invalid.", {
          path: VITE_MANIFEST_PATH,
          error: parsedManifest.error || "",
        }),
  );

  return checks;
}

async function fetchText(fetchImpl, url) {
  try {
    const response = await fetchImpl(url);
    const text = typeof response.text === "function" ? await response.text() : String(response.body || "");
    return {
      ok: true,
      status: Number(response.status || 0),
      headers: response.headers || {},
      text,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      headers: {},
      text: "",
      error: error.message,
    };
  }
}

async function collectProductionChecks(options) {
  const checks = [];
  if (!options.baseUrl) return checks;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return [
      failedCheck("production_fetch_available", "Fetch is required for live production probes.", {
        baseUrl: options.baseUrl,
      }),
    ];
  }

  const root = await fetchText(fetchImpl, `${options.baseUrl}/`);
  const rootMode = headerValue(root.headers, "x-homeai-shell-mode");
  const rootBootstrap = headerValue(root.headers, "x-homeai-vite-bootstrap");
  checks.push(
    root.ok &&
      root.status === 200 &&
      rootMode === "vite" &&
      rootBootstrap === "/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js" &&
      root.text.includes("home-ai-vite-production-bootstrap")
      ? passedCheck("production_root_shell_vite", "Production root selects the Vite bootstrap.", {
          status: root.status,
          shellMode: rootMode,
          bootstrap: rootBootstrap,
        })
      : failedCheck("production_root_shell_vite", "Production root did not select the expected Vite bootstrap.", {
          status: root.status,
          shellMode: rootMode,
          bootstrap: rootBootstrap,
          error: root.error || "",
          htmlHasBootstrap: root.text.includes("home-ai-vite-production-bootstrap"),
        }),
  );

  const classic = await fetchText(fetchImpl, `${options.baseUrl}/?homeAiShellMode=classic`);
  const classicMode = headerValue(classic.headers, "x-homeai-shell-mode");
  const classicPolicy = headerValue(classic.headers, "x-homeai-shell-mode-policy");
  checks.push(
    classic.ok &&
      classic.status === 200 &&
      classicMode === "vite" &&
      classicPolicy === "vite-only" &&
      classic.text.includes("home-ai-vite-production-bootstrap")
      ? passedCheck("production_classic_override_ignored", "Classic request override is ignored by the Vite-only shell.", {
          status: classic.status,
          shellMode: classicMode,
          shellModePolicy: classicPolicy,
        })
      : failedCheck("production_classic_override_ignored", "Classic request override must not activate Classic shell.", {
          status: classic.status,
          shellMode: classicMode,
          shellModePolicy: classicPolicy,
          htmlHasBootstrap: classic.text.includes("home-ai-vite-production-bootstrap"),
          error: classic.error || "",
        }),
  );

  const manifest = await fetchText(fetchImpl, `${options.baseUrl}/vite-islands/.vite/manifest.json`);
  const manifestJson = manifest.ok ? safeJsonParse(manifest.text) : { ok: false, value: null, error: manifest.error };
  checks.push(
    manifest.status === 200 && manifestJson.ok
      ? passedCheck("production_vite_manifest_reachable", "Production Vite manifest is reachable.", {
          status: manifest.status,
          entryCount: Object.keys(manifestJson.value || {}).length,
        })
      : failedCheck("production_vite_manifest_reachable", "Production Vite manifest is not reachable.", {
          status: manifest.status,
          error: manifest.error || manifestJson.error || "",
        }),
  );

  const bootstrap = await fetchText(
    fetchImpl,
    `${options.baseUrl}/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js`,
  );
  checks.push(
    bootstrap.status === 200 && bootstrap.text.includes("HomeAiViteProduction")
      ? passedCheck("production_vite_bootstrap_reachable", "Production Vite bootstrap JS is reachable.", {
          status: bootstrap.status,
          marker: "HomeAiViteProduction",
        })
      : failedCheck("production_vite_bootstrap_reachable", "Production Vite bootstrap JS is not valid.", {
          status: bootstrap.status,
          error: bootstrap.error || "marker_missing",
        }),
  );

  const publicConfig = await fetchText(fetchImpl, `${options.baseUrl}/api/public-config`);
  const publicConfigJson = publicConfig.ok ? safeJsonParse(publicConfig.text) : { ok: false, value: null, error: publicConfig.error };
  checks.push(
    publicConfig.status === 200 && publicConfigJson.ok
      ? passedCheck("production_public_config_reachable", "Public config route remains reachable.", {
          status: publicConfig.status,
          title: publicConfigJson.value.title || "",
        })
      : failedCheck("production_public_config_reachable", "Public config route is not reachable.", {
          status: publicConfig.status,
          error: publicConfig.error || publicConfigJson.error || "",
        }),
  );

  const ownerConsole = await fetchText(fetchImpl, `${options.baseUrl}/api/owner/system-console`);
  checks.push(
    ownerConsole.status === 401 || ownerConsole.status === 403
      ? passedCheck("production_owner_console_denies_unauthenticated", "Owner Console still denies unauthenticated access.", {
          status: ownerConsole.status,
        })
      : failedCheck("production_owner_console_denies_unauthenticated", "Owner Console did not deny unauthenticated access.", {
          status: ownerConsole.status,
          error: ownerConsole.error || "",
        }),
  );

  return checks;
}

function collectReadbackCheck(options) {
  if (!options.readbackJson) return [];
  const result = validateViteProductionReadback({
    readbackJson: options.readbackJson,
  });
  return [
    result.ok
      ? passedCheck("production_readback_packet", "Production readback packet remains valid.", {
          status: result.status,
          requiredCheckCount: result.requiredCheckCount,
          observedCheckCount: result.observedCheckCount,
        })
      : failedCheck("production_readback_packet", "Production readback packet is not valid.", {
          status: result.status,
          blockedReason: result.blockedReason || "",
          missing: result.missing || [],
          failedCount: Array.isArray(result.failed) ? result.failed.length : 0,
          weakEvidence: result.weakEvidence || [],
        }),
  ];
}

async function buildViteProductionStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const sourceChecks = collectSourceChecks(repoRoot);
  const productionChecks = await collectProductionChecks({
    ...options,
    baseUrl: normalizeBaseUrl(options.baseUrl || ""),
  });
  const readbackChecks = collectReadbackCheck(options);
  const checks = [...sourceChecks, ...productionChecks, ...readbackChecks];
  const failed = checks.filter((check) => check.ok !== true).map((check) => check.id);
  const forbiddenPrivacyFindings = scanForbiddenValues({
    checks,
    baseUrl: normalizeBaseUrl(options.baseUrl || ""),
  });
  const ok = failed.length === 0 && forbiddenPrivacyFindings.length === 0;

  return {
    ok,
    status: ok
      ? productionChecks.length > 0 || readbackChecks.length > 0
        ? "vite_production_status_verified"
        : "vite_production_source_status_verified"
      : "vite_production_status_incomplete",
    statusVersion: STATUS_CHECK_VERSION,
    sourceOnly: productionChecks.length === 0,
    productionWrites: false,
    deployExecuted: false,
    liveProbe: productionChecks.length > 0,
    readbackValidated: readbackChecks.length > 0,
    checkCount: checks.length,
    passedCount: checks.length - failed.length,
    failed,
    checks,
    privacy: {
      ok: forbiddenPrivacyFindings.length === 0,
      forbiddenFindings: forbiddenPrivacyFindings,
      rawSecretsIncluded: false,
    },
  };
}

function formatText(result) {
  const lines = [
    `ok: ${result.ok}`,
    `status: ${result.status}`,
    `statusVersion: ${result.statusVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `liveProbe: ${result.liveProbe}`,
    `readbackValidated: ${result.readbackValidated}`,
    `passedCount: ${result.passedCount}/${result.checkCount}`,
  ];
  if (result.failed && result.failed.length) {
    lines.push(`failed: ${result.failed.join(", ")}`);
  }
  return lines.join("\n");
}

async function main() {
  const options = parseArgs();
  const result = await buildViteProductionStatus(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }
  if (options.requireOk && !result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  STATUS_CHECK_VERSION,
  buildViteProductionStatus,
  collectSourceChecks,
  formatText,
  parseArgs,
};
