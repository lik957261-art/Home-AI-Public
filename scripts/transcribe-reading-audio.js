"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

function argValue(names, fallback = "") {
  const list = Array.isArray(names) ? names : [names];
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    for (const name of list) {
      if (item === name && index + 1 < process.argv.length) return process.argv[index + 1];
      if (item.startsWith(`${name}=`)) return item.slice(name.length + 1);
    }
  }
  return fallback;
}

function normalizeLanguage(value) {
  let text = String(value || "auto").trim();
  if (!text || /^(auto|detect|none|null)$/i.test(text)) return "";
  if (/^(zh-CN|zh_CN|cn|chinese)$/i.test(text)) text = "zh";
  if (/^(en-US|en_GB|en-GB|english)$/i.test(text)) text = "en";
  return text;
}

function compactError(value, maxChars = 800) {
  const text = String(value || "").trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function postMultipart({ audioPath, serviceUrl, language, timeoutSeconds }) {
  return new Promise((resolve, reject) => {
    const boundary = `----HermesMobileWhisper${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const fileName = path.basename(audioPath);
    const fileBytes = fs.readFileSync(audioPath);
    const fields = [
      ["response_format", "json"],
    ];
    const normalizedLanguage = normalizeLanguage(language);
    if (normalizedLanguage) fields.push(["language", normalizedLanguage]);

    const chunks = [];
    for (const [name, value] of fields) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName.replace(/"/g, "_")}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    chunks.push(fileBytes);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);

    const target = new URL(serviceUrl);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
        Accept: "application/json",
      },
      timeout: Math.max(5, Number(timeoutSeconds || 240)) * 1000,
    }, (res) => {
      const parts = [];
      res.on("data", (chunk) => parts.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Whisper large v3 turbo service returned HTTP ${res.statusCode}: ${compactError(text)}`));
          return;
        }
        resolve(text);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Whisper large v3 turbo service timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

async function main() {
  const audioPath = argValue(["--audio-path", "--AudioPath", "-AudioPath"]);
  const serviceUrl = argValue(["--service-url", "--ServiceUrl", "-ServiceUrl"], process.env.HERMES_READING_TRANSCRIBE_URL || "http://127.0.0.1:8001/v1/audio/transcriptions");
  const language = argValue(["--language", "--Language", "-Language"], "auto");
  const timeoutSeconds = argValue(["--timeout-seconds", "--TimeoutSeconds", "-TimeoutSeconds"], "240");
  if (!audioPath) throw new Error("Missing --audio-path");
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const started = Date.now();
  const body = await postMultipart({ audioPath, serviceUrl, language, timeoutSeconds });
  const parsed = JSON.parse(body || "{}");
  const segments = Array.isArray(parsed.segments)
    ? parsed.segments.map((segment) => ({
      start: Math.round(Number(segment?.start || 0) * 100) / 100,
      end: Math.round(Number(segment?.end || 0) * 100) / 100,
      text: String(segment?.text || ""),
    }))
    : [];
  const result = {
    ok: true,
    text: String(parsed.text || ""),
    segments,
    language: String(parsed.language || ""),
    duration: Math.round(Number(parsed.duration || 0) * 100) / 100,
    elapsedSeconds: Math.round(((Date.now() - started) / 1000) * 100) / 100,
    model: "large-v3-turbo",
    provider: "whisper-large-v3-turbo-service",
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: compactError(err?.message || err) })}\n`);
  process.exitCode = 1;
});
