"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const WARDROBE_ROUTE_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d)/i;
const WARDROBE_DIRECTORY_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\u8863\u6a71)/i;
const DEFAULT_MCP_TIMEOUT_MS = 45000;
const DEFAULT_MCP_SCRIPT = "C:\\ProgramData\\HermesMobile\\gateway-worker\\wardrobe-mcp\\scripts\\wardrobe-mcp.py";
const WARDROBE_DASHBOARD_TOOLS = Object.freeze([
  Object.freeze({ key: "overview", name: "wardrobe.stats_overview", arguments: { refresh: true, top_n: 6 } }),
  Object.freeze({ key: "inventory", name: "wardrobe.stats_inventory", arguments: { refresh: true, top_n: 8 } }),
  Object.freeze({ key: "brandInventory", name: "wardrobe.stats_inventory", arguments: { refresh: true, group_by: "brand", metric: "amount", top_n: 12 } }),
  Object.freeze({ key: "watch", name: "wardrobe.stats_watch", arguments: { refresh: true, group_by: "brand", metric: "amount", top_n: 8 } }),
  Object.freeze({ key: "wear", name: "wardrobe.stats_wear", arguments: { refresh: true, category: "wardrobe", group_by: "brand", top_n: 8 } }),
  Object.freeze({ key: "featuredLooks", name: "wardrobe.stats_featured_looks", arguments: { refresh: true, group_by: "brand", top_n: 8 } }),
  Object.freeze({ key: "history", name: "wardrobe.stats_history", arguments: { refresh: true, group_by: "day", top_n: 6 } }),
  Object.freeze({ key: "maintenance", name: "wardrobe.stats_maintenance", arguments: { refresh: true, top_n: 6 } }),
  Object.freeze({ key: "photos", name: "wardrobe.stats_photos", arguments: { refresh: true, top_n: 6 } }),
  Object.freeze({ key: "dataQuality", name: "wardrobe.stats_data_quality", arguments: { refresh: true, top_n: 6 } }),
  Object.freeze({ key: "items", name: "wardrobe.search_items", arguments: { kind: "wardrobe", limit: 80 } }),
]);

function stringValue(value) {
  return String(value || "").trim();
}

function routeText(item = {}) {
  return [
    item.id,
    item.projectId,
    item.subprojectId,
    item.label,
    item.name,
    item.root,
    item.path,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].map(stringValue).filter(Boolean).join(" ");
}

function itemLooksWardrobe(item = {}) {
  return WARDROBE_ROUTE_PATTERN.test(routeText(item));
}

function itemLooksWardrobeDirectory(item = {}) {
  return WARDROBE_DIRECTORY_PATTERN.test(routeText(item));
}

function hasWardrobeConfig(root = "") {
  const base = stringValue(root);
  if (!base) return false;
  try {
    return fs.existsSync(path.join(base, ".hermes-wardrobe", "config.json"));
  } catch (_) {
    return false;
  }
}

function childRouteText(child = {}) {
  const rootTail = path.basename(stringValue(child.root || child.path).replace(/[/\\]+$/, ""));
  return [
    child.id,
    child.projectId,
    child.subprojectId,
    child.label,
    child.name,
    rootTail,
    ...(Array.isArray(child.aliases) ? child.aliases : []),
  ].map(stringValue).filter(Boolean).join(" ");
}

function directoryCandidates(projects = []) {
  const candidates = [];
  for (const project of projects || []) {
    if (!project?.root) continue;
    const projectHasConfig = hasWardrobeConfig(project.root);
    if (projectHasConfig || itemLooksWardrobeDirectory(project)) {
      candidates.push({ project, child: null, score: projectHasConfig ? 20 : 4 });
    }
    for (const child of project.children || []) {
      if (!child?.root) continue;
      const text = childRouteText(child);
      const childHasConfig = hasWardrobeConfig(child.root);
      if (!childHasConfig && !WARDROBE_DIRECTORY_PATTERN.test(text)) continue;
      candidates.push({ project, child, score: childHasConfig ? 20 : 4 });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function findWardrobeDirectory(projects = []) {
  const candidate = directoryCandidates(projects)[0] || null;
  if (!candidate) return null;
  const root = candidate.child?.root || candidate.project.root || "";
  const label = candidate.child
    ? `${candidate.project.label || candidate.project.id || ""} / ${candidate.child.label || candidate.child.id || ""}`
    : (candidate.project.label || candidate.project.id || "Wardrobe");
  return {
    projectId: candidate.project.id || "",
    subprojectId: candidate.child?.id || "",
    label,
    root,
  };
}

function sanitizeErrorText(value = "", limit = 800) {
  return stringValue(value)
    .replace(/access[-_ ]?key["'=:\s]+[^\s,;}]+/gi, "access_key:<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .slice(0, limit);
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sumObjectValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, item) => sum + numericValue(item), 0);
}

function countFromGroups(groups = []) {
  return Array.isArray(groups)
    ? groups.reduce((sum, item) => sum + numericValue(item?.count), 0)
    : 0;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numericValue(value);
    if (number) return number;
  }
  return 0;
}

function toolKeyFromId(id = "") {
  return String(id || "").replace(/^tool:/, "");
}

function parseJsonLine(line = "") {
  try {
    return JSON.parse(line);
  } catch (_) {
    return null;
  }
}

function mcpResultPayload(response = {}) {
  const result = response.result || {};
  if (result.isError) {
    const structured = result.structuredContent || {};
    const message = structured.message || structured.error || result.content?.[0]?.text || "wardrobe_mcp_tool_error";
    throw new Error(sanitizeErrorText(message));
  }
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const text = result.content?.find?.((item) => item?.type === "text")?.text || "";
  const parsed = parseJsonLine(text);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function defaultPythonCommand() {
  if (process.env.HERMES_MOBILE_WARDROBE_MCP_PYTHON) return process.env.HERMES_MOBILE_WARDROBE_MCP_PYTHON;
  if (process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "python.exe")
        : "",
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "AppData", "Local", "Microsoft", "WindowsApps", "python.exe")
        : "",
    ];
    try {
      const usersRoot = `${process.env.SystemDrive || "C:"}\\Users`;
      for (const userDir of fs.readdirSync(usersRoot, { withFileTypes: true })) {
        if (!userDir.isDirectory()) continue;
        candidates.push(path.join(usersRoot, userDir.name, "AppData", "Local", "Microsoft", "WindowsApps", "python.exe"));
      }
    } catch (_) {
      // Fall through to PATH lookup below.
    }
    const resolved = candidates.find((item) => item && fs.existsSync(item));
    if (resolved) return resolved;
  }
  return "python";
}

function pythonPathDirectory(command = "") {
  const text = stringValue(command);
  if (/\\Microsoft\\WindowsApps\\python\.exe$/i.test(text)) return path.dirname(text);
  if (/^python(?:\.exe)?$/i.test(text) && process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps")
        : "",
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "AppData", "Local", "Microsoft", "WindowsApps")
        : "",
    ];
    return candidates.find((item) => item && fs.existsSync(path.join(item, "python.exe"))) || "";
  }
  return "";
}

function windowsPathToWsl(value = "") {
  const text = String(value || "");
  const drive = text.match(/^([A-Za-z]):\\(.*)$/);
  if (!drive) return text.replace(/\\/g, "/");
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
}

function createWardrobeMcpClient(options = {}) {
  const spawnImpl = options.spawn || spawn;
  const command = options.command || defaultPythonCommand();
  const spawnCommand = /\\Microsoft\\WindowsApps\\python\.exe$/i.test(command) ? "python" : command;
  const powershellPythonCommand = /\\Microsoft\\WindowsApps\\python\.exe$/i.test(command) ? command : spawnCommand;
  const pythonDir = pythonPathDirectory(command);
  const scriptPath = options.scriptPath || process.env.HERMES_MOBILE_WARDROBE_MCP_SCRIPT || DEFAULT_MCP_SCRIPT;
  const timeoutMs = Number(options.timeoutMs || process.env.HERMES_MOBILE_WARDROBE_MCP_TIMEOUT_MS || DEFAULT_MCP_TIMEOUT_MS);

  function callTools(input = {}) {
    const workspaceRoot = stringValue(input.workspaceRoot);
    const calls = Array.isArray(input.calls) ? input.calls : [];
    if (!workspaceRoot) return Promise.reject(new Error("wardrobe_mcp_workspace_required"));
    if (!calls.length) return Promise.resolve({});

    return new Promise((resolve, reject) => {
      const env = Object.assign({}, process.env);
      if (pythonDir) {
        const currentPath = env.Path || env.PATH || "";
        env.PATH = `${pythonDir}${path.delimiter}${currentPath}`;
        env.Path = env.PATH;
      }
      const usePowerShellShim = process.platform === "win32" && /^python(?:\.exe)?$/i.test(spawnCommand);
      const useWslPython = process.platform === "win32" && /^wsl:/i.test(command);
      const child = useWslPython
        ? spawnImpl("wsl.exe", [command.replace(/^wsl:/i, "") || "python3", windowsPathToWsl(scriptPath), "--workspace", windowsPathToWsl(workspaceRoot), "--no-workspace-override"], {
          cwd: path.dirname(scriptPath),
          env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        })
        : usePowerShellShim
        ? spawnImpl("powershell.exe", ["-NoProfile", "-Command", "&", powershellPythonCommand, scriptPath, "--workspace", workspaceRoot, "--no-workspace-override"], {
          cwd: path.dirname(scriptPath),
          env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        })
        : spawnImpl(spawnCommand, [scriptPath, "--workspace", workspaceRoot, "--no-workspace-override"], {
        cwd: path.dirname(scriptPath),
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const responses = new Map();
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill?.();
        reject(new Error(`wardrobe_mcp_timeout_${timeoutMs}ms`));
      }, Math.max(5000, timeoutMs || DEFAULT_MCP_TIMEOUT_MS));

      function finish(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        try {
          const output = {};
          for (const call of calls) {
            const response = responses.get(`tool:${call.key}`);
            if (!response) throw new Error(`wardrobe_mcp_missing_response:${call.key}`);
            output[call.key] = mcpResultPayload(response);
          }
          resolve(output);
        } catch (parseErr) {
          reject(parseErr);
        }
      }

      child.on("error", (err) => finish(new Error(`wardrobe_mcp_spawn_failed:${sanitizeErrorText(err?.message || err)}`)));
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || "";
        for (const line of lines) {
          const response = parseJsonLine(line.trim());
          if (!response?.id) continue;
          responses.set(String(response.id), response);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 2000) stderr = stderr.slice(-2000);
      });
      child.on("close", (code) => {
        if (stdout.trim()) {
          const response = parseJsonLine(stdout.trim());
          if (response?.id) responses.set(String(response.id), response);
        }
        if (code !== 0) {
          finish(new Error(`wardrobe_mcp_exit_${code}:${sanitizeErrorText(stderr || stdout || "")}`));
          return;
        }
        finish(null);
      });

      const initialize = {
        jsonrpc: "2.0",
        id: "initialize",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "hermes-mobile-wardrobe-dashboard", version: "1" },
        },
      };
      child.stdin.write(`${JSON.stringify(initialize)}\n`);
      for (const call of calls) {
        const args = Object.assign({}, call.arguments || {});
        const request = {
          jsonrpc: "2.0",
          id: `tool:${call.key}`,
          method: "tools/call",
          params: { name: call.name, arguments: args },
        };
        child.stdin.write(`${JSON.stringify(request)}\n`);
      }
      child.stdin.end();
    });
  }

  return { callTools };
}

function normalizeOverview(raw = {}) {
  const items = raw.items || {};
  const photos = raw.photos || {};
  const maintenance = raw.maintenance || {};
  const quality = raw.data_quality || raw.quality || {};
  return {
    itemCount: firstNumber(raw.item_count, raw.total_items, items.total, raw.items_total),
    wardrobeCount: firstNumber(items.wardrobe, raw.wardrobe_count),
    watchCount: firstNumber(items.watch, raw.watch_count),
    featuredLookCount: firstNumber(raw.featured_looks?.total, raw.look_count, raw.featured_look_count),
    historyCount: firstNumber(raw.wear_history?.total, raw.history_count, raw.record_count),
    photoCount: firstNumber(photos.total, photos.with_photo, raw.photo_count),
    maintenanceIssueCount: firstNumber(maintenance.issue_count, numericValue(maintenance.red) + numericValue(maintenance.orange)),
    dataQualityIssueCount: firstNumber(quality.issue_count, sumObjectValues(quality.checks)),
  };
}

function normalizeGroups(raw = {}) {
  return Array.isArray(raw.groups) ? raw.groups.slice(0, 8) : [];
}

function normalizeMaintenance(raw = {}) {
  const groups = normalizeGroups(raw);
  const dueItems = Array.isArray(raw.due_items)
    ? raw.due_items
    : (Array.isArray(raw.samples?.red) ? raw.samples.red : []);
  return {
    itemCount: firstNumber(raw.item_count, countFromGroups(groups)),
    groups,
    dueItems: dueItems.slice(0, 6),
  };
}

function normalizeDataQuality(raw = {}) {
  const quality = raw.quality || raw.data_quality || raw;
  return {
    itemCount: numericValue(quality.item_count || raw.item_count),
    issueCount: firstNumber(quality.issue_count, sumObjectValues(quality.checks)),
    checks: quality.checks || {},
    samples: quality.samples || {},
  };
}

function cleanFilterValue(value = "", limit = 80) {
  return stringValue(value).slice(0, limit);
}

function dashboardFilters(input = {}) {
  const q = cleanFilterValue(input.q || input.query || input.search || "");
  const brand = cleanFilterValue(input.brand || "");
  const section = ["overview", "watch", "maintenance", "wear", "looks", "log"].includes(input.section)
    ? input.section
    : "overview";
  return { q, brand, section };
}

function toolCallsForDashboard(filters = {}) {
  return WARDROBE_DASHBOARD_TOOLS.map((call) => {
    const args = Object.assign({}, call.arguments || {});
    if (call.key === "inventory" || call.key === "items" || call.key === "watch" || call.key === "wear" || call.key === "featuredLooks") {
      if (filters.q) args.q = filters.q;
      if (filters.brand) args.brand = filters.brand;
    }
    if (call.key === "items" && filters.section === "watch") args.kind = "watch";
    return Object.freeze(Object.assign({}, call, { arguments: args }));
  });
}

function parseCurrencyValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = stringValue(value).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function normalizeWardrobeItem(item = {}) {
  return {
    id: item.id || item.code || "",
    code: stringValue(item.code),
    brand: stringValue(item.brand),
    section: stringValue(item.section || item.display_name || item.name),
    role: stringValue(item.layer_role || item.role),
    loc: stringValue(item.loc || item.location),
    status: stringValue(item.status),
    priceCny: parseCurrencyValue(item.price_cny),
    priceLabel: stringValue(item.price_cny || item.price_original),
    wearTotal: numericValue(item.wear_total),
    photoCount: numericValue(item.photo_count),
  };
}

function normalizeItemList(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    count: numericValue(raw.count || items.length),
    limit: numericValue(raw.limit),
    items: items.map(normalizeWardrobeItem),
  };
}

function createWardrobeProjectionService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const mcpClient = options.mcpClient || createWardrobeMcpClient(options.mcp || {});

  async function overview(input = {}) {
    const projects = Array.isArray(input.projects) ? input.projects : [];
    const filters = dashboardFilters(input.filters || input);
    const directory = input.directory || findWardrobeDirectory(projects);
    if (!directory?.root) {
      return {
        ok: false,
        available: false,
        code: "wardrobe_directory_not_found",
        checkedAt: nowIso(),
        directory: null,
      };
    }

    const tools = await mcpClient.callTools({
      workspaceRoot: directory.root,
      calls: toolCallsForDashboard(filters),
    });
    const itemList = normalizeItemList(tools.items || {});

    return {
      ok: true,
      available: true,
      checkedAt: nowIso(),
      directory,
      source: {
        mode: "wardrobe_mcp_stats",
        toolCount: WARDROBE_DASHBOARD_TOOLS.length,
        tools: WARDROBE_DASHBOARD_TOOLS.map((item) => item.name),
      },
      filters,
      overview: normalizeOverview(tools.overview || {}),
      inventory: {
        itemCount: numericValue(tools.inventory?.item_count),
        totals: tools.inventory?.totals || {},
        groups: normalizeGroups(tools.inventory || {}),
        brandGroups: normalizeGroups(tools.brandInventory || {}),
      },
      watch: {
        itemCount: numericValue(tools.watch?.item_count),
        totals: tools.watch?.totals || {},
        groups: normalizeGroups(tools.watch || {}),
      },
      wear: {
        itemCount: numericValue(tools.wear?.item_count),
        totals: tools.wear?.totals || {},
        groups: normalizeGroups(tools.wear || {}),
      },
      featuredLooks: {
        lookCount: numericValue(tools.featuredLooks?.look_count),
        withPhotos: numericValue(tools.featuredLooks?.with_photos),
        groups: normalizeGroups(tools.featuredLooks || {}),
      },
      items: itemList,
      recentHistory: {
        recordCount: numericValue(tools.history?.record_count),
        groups: normalizeGroups(tools.history || {}),
      },
      maintenance: normalizeMaintenance(tools.maintenance || {}),
      photos: tools.photos || {},
      dataQuality: normalizeDataQuality(tools.dataQuality || {}),
      mcp: tools,
    };
  }

  return {
    findWardrobeDirectory,
    overview,
  };
}

module.exports = {
  WARDROBE_DASHBOARD_TOOLS,
  createWardrobeMcpClient,
  createWardrobeProjectionService,
  findWardrobeDirectory,
};
