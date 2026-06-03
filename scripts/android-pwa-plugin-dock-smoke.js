"use strict";

const fs = require("fs");
const http = require("http");
const { execFileSync } = require("child_process");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function adb(serial, args, options = {}) {
  const baseArgs = serial ? ["-s", serial, ...args] : args;
  return execFileSync("adb", baseArgs, Object.assign({ encoding: "utf8" }, options));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

function numericPageId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

async function connectDevTools(url, cdpPort) {
  const pages = await getJson(`http://127.0.0.1:${cdpPort}/json`);
  const page = pages
    .filter((item) => item.type === "page" && String(item.url || "").startsWith(url))
    .sort((a, b) => numericPageId(b.id) - numericPageId(a.id))[0];
  if (!page?.webSocketDebuggerUrl) throw new Error(`Hermes Mobile page was not found for ${url}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const current = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) current.reject(new Error(JSON.stringify(message.error)));
    else current.resolve(message.result || {});
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("DevTools websocket open timed out")), 8000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(event.error || new Error("DevTools websocket error"));
    }, { once: true });
  });

  function send(method, params = {}, timeoutMs = 15000) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(err) {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  return { page, ws, send };
}

async function main() {
  const serial = argValue("--serial", process.env.ANDROID_SERIAL || "");
  const url = argValue("--url", process.env.HERMES_ANDROID_PWA_URL || "https://hermes-xuxin.synology.me:8445/hermes-mobile/?source=pwa");
  const originPrefix = argValue("--origin-prefix", process.env.HERMES_ANDROID_PWA_ORIGIN_PREFIX || "https://hermes-xuxin.synology.me:8445/hermes-mobile/");
  const accessKeyPath = argValue("--access-key-path", process.env.HERMES_ANDROID_ACCESS_KEY_PATH || "");
  const expectVersion = argValue("--expect-version", process.env.HERMES_ANDROID_EXPECT_VERSION || "");
  const screenshotPath = argValue("--screenshot", "");
  const cdpPort = Number(argValue("--cdp-port", process.env.HERMES_ANDROID_CDP_PORT || "9222")) || 9222;

  if (!accessKeyPath) throw new Error("--access-key-path or HERMES_ANDROID_ACCESS_KEY_PATH is required");
  const accessKey = fs.readFileSync(accessKeyPath, "utf8").trim();
  if (!accessKey) throw new Error("access key file is empty");
  if (typeof WebSocket !== "function") throw new Error("Node global WebSocket is required for CDP smoke");

  adb(serial, ["forward", `tcp:${cdpPort}`, "localabstract:chrome_devtools_remote"]);
  adb(serial, ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url]);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const devtools = await connectDevTools(originPrefix, cdpPort);
  try {
    await devtools.send("Runtime.evaluate", {
      expression: `(() => {
        const key = ${JSON.stringify(accessKey)};
        localStorage.setItem("hermesWebKey", key);
        document.cookie = "hermes_web_key=" + encodeURIComponent(key) + "; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
        return true;
      })()`,
      returnByValue: true,
    });
    await devtools.send("Page.reload", { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await devtools.send("Runtime.evaluate", {
      expression: `(() => {
        const tasks = document.getElementById("bottomTasksMode");
        if (tasks && !tasks.classList.contains("active")) tasks.click();
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const result = await devtools.send("Runtime.evaluate", {
      expression: `(() => {
        const dock = document.getElementById("topicPluginDock");
        const strip = dock?.querySelector(".plugin-app-strip");
        const cards = Array.from(strip?.querySelectorAll(".plugin-app-card") || []);
        const cardRects = cards.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.innerText.trim(),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        });
        const stripRect = strip?.getBoundingClientRect();
        return {
          version: document.documentElement.dataset.clientVersion || "",
          loginHidden: document.getElementById("login")?.classList.contains("hidden"),
          appHidden: document.getElementById("app")?.classList.contains("hidden"),
          dockHidden: Boolean(dock?.hidden),
          cardCount: cards.length,
          rowCount: new Set(cardRects.map((item) => item.top)).size,
          strip: stripRect ? {
            top: Math.round(stripRect.top),
            height: Math.round(stripRect.height),
            clientWidth: Math.round(strip.clientWidth),
            scrollWidth: Math.round(strip.scrollWidth),
            overflowX: getComputedStyle(strip).overflowX,
            flexWrap: getComputedStyle(strip).flexWrap
          } : null,
          cards: cardRects
        };
      })()`,
      returnByValue: true,
    });

    const value = result.result.value;
    if (expectVersion && value.version !== expectVersion) {
      throw new Error(`client version mismatch: expected ${expectVersion}, got ${value.version}`);
    }
    if (!value.loginHidden || value.appHidden) throw new Error("Hermes Mobile did not enter the authenticated app shell");
    if (value.dockHidden) throw new Error("plugin Dock is hidden");
    if (!value.strip) throw new Error("plugin Dock strip is missing");
    if (value.strip.flexWrap !== "nowrap") throw new Error(`plugin Dock flex-wrap must be nowrap, got ${value.strip.flexWrap}`);
    if (value.strip.overflowX !== "auto") throw new Error(`plugin Dock overflow-x must be auto, got ${value.strip.overflowX}`);
    if (value.rowCount !== 1) throw new Error(`plugin Dock must render as one row, got ${value.rowCount}`);
    if (value.cardCount < 1) throw new Error("plugin Dock has no plugin cards");

    if (screenshotPath) {
      const remotePath = "/sdcard/hermes-plugin-dock-smoke.png";
      adb(serial, ["shell", "screencap", "-p", remotePath]);
      adb(serial, ["pull", remotePath, screenshotPath], { stdio: "ignore" });
      adb(serial, ["shell", "rm", remotePath]);
      value.screenshot = screenshotPath;
    }

    console.log(JSON.stringify(value, null, 2));
  } finally {
    devtools.ws.close();
    if (hasArg("--remove-forward")) {
      try {
        adb(serial, ["forward", "--remove", `tcp:${cdpPort}`]);
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
