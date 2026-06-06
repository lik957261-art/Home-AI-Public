"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    appiumUrl: "http://127.0.0.1:4723",
    udid: "C2EB6D31-F485-4DAE-BFB4-25E27FC65389",
    deviceName: "HomeAI iPhone 17 Pro",
    url: "https://example.com/",
    outDir: path.join(process.env.HOME || ".", ".homeai-qa", "artifacts"),
    longPress: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => argv[++index] || "";
    if (item === "--appium-url") args.appiumUrl = next();
    else if (item === "--udid") args.udid = next();
    else if (item === "--device-name") args.deviceName = next();
    else if (item === "--url") args.url = next();
    else if (item === "--out-dir") args.outDir = next();
    else if (item === "--long-press") args.longPress = next();
    else if (item === "--help") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${item}`);
    }
  }
  return args;
}

function printHelp() {
  console.log([
    "Usage: node scripts/macos-ios-appium-smoke.js [options]",
    "",
    "Options:",
    "  --appium-url <url>       Appium server URL. Default: http://127.0.0.1:4723",
    "  --udid <sim-udid>        iOS Simulator UDID.",
    "  --device-name <name>     Simulator device name.",
    "  --url <url>              URL to open in Safari.",
    "  --out-dir <path>         Artifact directory.",
    "  --long-press x,y,ms      Optional normalized viewport long press, e.g. 0.90,0.87,1200.",
  ].join("\n"));
}

async function request(appiumUrl, method, route, body = null) {
  const response = await fetch(`${appiumUrl}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Appium ${method} ${route} failed: HTTP ${response.status} ${text.slice(0, 400)}`);
  }
  return json;
}

function parseLongPress(value) {
  if (!value) return null;
  const parts = String(value).split(",").map((item) => Number(item.trim()));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    throw new Error("--long-press must be x,y,ms");
  }
  const [x, y, duration] = parts;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    duration: Math.max(100, Math.round(duration)),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const longPress = parseLongPress(args.longPress);
  let sessionId = "";
  const startedAt = Date.now();
  try {
    const session = await request(args.appiumUrl, "POST", "/session", {
      capabilities: {
        alwaysMatch: {
          platformName: "iOS",
          browserName: "Safari",
          "appium:automationName": "XCUITest",
          "appium:deviceName": args.deviceName,
          "appium:udid": args.udid,
          "appium:wdaLocalPort": 8101,
          "appium:newCommandTimeout": 120,
          "appium:noReset": true,
        },
      },
    });
    sessionId = session?.value?.sessionId || session?.sessionId || "";
    if (!sessionId) throw new Error("Appium did not return a session id");

    await request(args.appiumUrl, "POST", `/session/${sessionId}/url`, { url: args.url });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    let longPressPoint = null;
    if (longPress) {
      const rect = await request(args.appiumUrl, "GET", `/session/${sessionId}/window/rect`);
      const viewport = rect?.value || {};
      const width = Number(viewport.width || 0) || 1;
      const height = Number(viewport.height || 0) || 1;
      const x = Math.round(width * longPress.x);
      const y = Math.round(height * longPress.y);
      longPressPoint = { x, y, duration: longPress.duration, width, height };
      await request(args.appiumUrl, "POST", `/session/${sessionId}/actions`, {
        actions: [{
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: "touch" },
          actions: [
            { type: "pointerMove", duration: 0, origin: "viewport", x, y },
            { type: "pointerDown", button: 0 },
            { type: "pause", duration: longPress.duration },
            { type: "pointerUp", button: 0 },
          ],
        }],
      });
      await request(args.appiumUrl, "DELETE", `/session/${sessionId}/actions`).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    fs.mkdirSync(args.outDir, { recursive: true });
    const screenshot = await request(args.appiumUrl, "GET", `/session/${sessionId}/screenshot`);
    const screenshotPath = path.join(args.outDir, "macos-ios-appium-smoke.png");
    fs.writeFileSync(screenshotPath, Buffer.from(String(screenshot?.value || ""), "base64"));
    const source = await request(args.appiumUrl, "GET", `/session/${sessionId}/source`);
    const sourcePath = path.join(args.outDir, "macos-ios-appium-smoke-source.xml");
    fs.writeFileSync(sourcePath, String(source?.value || ""));

    console.log(JSON.stringify({
      ok: true,
      sessionMs: Date.now() - startedAt,
      openedUrl: args.url,
      screenshotPath,
      sourcePath,
      sourceLength: String(source?.value || "").length,
      longPressPoint,
    }, null, 2));
  } finally {
    if (sessionId) {
      await request(args.appiumUrl, "DELETE", `/session/${sessionId}`).catch(() => null);
    }
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
