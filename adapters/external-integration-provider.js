"use strict";

const fs = require("node:fs");

function firstExistingPath(paths) {
  return (paths || []).find((item) => item && fs.existsSync(item)) || "";
}

function readFirstExistingText(paths) {
  const p = firstExistingPath(paths);
  if (!p) return "";
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return "";
  }
}

function parseEnvFileText(text) {
  const out = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function createExternalIntegrationProvider(options = {}) {
  const envPaths = options.envPaths || [];
  const configPaths = options.configPaths || [];
  const githubCliHostsPaths = options.githubCliHostsPaths || [];
  const googleTokenPaths = options.googleTokenPaths || [];
  const googleClientSecretPaths = options.googleClientSecretPaths || [];
  const outlookGraphTokenPaths = options.outlookGraphTokenPaths || [];

  function ownerInterfaceBindings() {
    const env = parseEnvFileText(readFirstExistingText(envPaths));
    const configText = readFirstExistingText(configPaths);
    const bindings = [];

    const githubHosts = readFirstExistingText(githubCliHostsPaths);
    if (/github\.com/i.test(githubHosts)) {
      bindings.push({ id: "owner_github", label: "GitHub", category: "外部接口", detail: "CLI" });
    }

    if (firstExistingPath(googleTokenPaths) && firstExistingPath(googleClientSecretPaths)) {
      bindings.push({ id: "owner_google", label: "Google", category: "外部接口", detail: "OAuth" });
    }

    const outlookConfigured = Boolean(env.MS_GRAPH_CLIENT_ID)
      || (/outlook_graph:\s*[\s\S]{0,400}?enabled:\s*true/i.test(configText) && firstExistingPath(outlookGraphTokenPaths));
    if (outlookConfigured) {
      bindings.push({ id: "owner_outlook", label: "Outlook", category: "邮箱", detail: "Graph" });
    }

    if (/aliyun|aliyun\.com|qiye\.aliyun\.com/i.test(`${env.EMAIL_IMAP_HOST || ""} ${env.EMAIL_SMTP_HOST || ""}`)) {
      bindings.push({ id: "owner_alimail", label: "阿里邮箱", category: "邮箱", detail: "IMAP/SMTP" });
    }

    if (/hotmail\.com/i.test(String(env.EMAIL_HOME_CHANNEL || env.EMAIL_HOME_ADDRESS || ""))) {
      bindings.push({ id: "owner_hotmail", label: "Hotmail", category: "邮箱", detail: "Home Channel" });
    }

    const seen = new Set();
    return bindings.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  return {
    ownerInterfaceBindings,
  };
}

module.exports = {
  createExternalIntegrationProvider,
};
