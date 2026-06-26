"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { createHomeAiTtsProfileService } = require("./home-ai-tts-profile-service");

const DEFAULT_VOICE = "zh_hifi_host";
const DEFAULT_LANGUAGE = "zh-CN";
const DEFAULT_FORMAT = "wav";
const DEFAULT_LOUDNESS = -18;
const SUPPORTED_FORMATS = new Set(["wav", "aiff", "mp3", "flac"]);
const PURPOSE_MAX = 80;
const TEXT_MAX = 8000;

function stringValue(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeToken(value, fallback = "item", maxLength = 80) {
  const out = stringValue(value, maxLength).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return out || fallback;
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assetIdFor(input) {
  return `tts_${sha256(JSON.stringify(input)).slice(0, 24)}`;
}

function mimeTypeFor(format) {
  if (format === "mp3") return "audio/mpeg";
  if (format === "flac") return "audio/flac";
  if (format === "aiff") return "audio/aiff";
  return "audio/wav";
}

function extensionFor(format) {
  return format === "aiff" ? "aiff" : format;
}

function statusError(status, code, message = code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function spawnFilePromise(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    execFile(command, args, Object.assign({ windowsHide: true }, options), (error) => {
      if (!error) resolve();
      else reject(statusError(500, "tts_command_failed", `${command} failed`));
    });
  });
}

async function spawnJsonPromise(command, args, payload, options = {}) {
  const maxStdout = Number.isFinite(Number(options.maxStdoutBytes)) ? Number(options.maxStdoutBytes) : 1024 * 1024;
  const maxStderr = Number.isFinite(Number(options.maxStderrBytes)) ? Number(options.maxStderrBytes) : 64 * 1024;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 10 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(statusError(504, "tts_command_timeout", `${command} timed out`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-maxStdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-maxStderr);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(statusError(500, "tts_command_failed", err?.message || `${command} failed`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(statusError(500, "tts_command_failed", `${command} exited ${code}`));
      try {
        const lines = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const jsonLine = lines.reverse().find((line) => line.startsWith("{") && line.endsWith("}"));
        resolve(jsonLine ? JSON.parse(jsonLine) : {});
      } catch (_) {
        reject(statusError(500, "tts_command_invalid_json", `${command} returned invalid json`));
      }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

function createMacosSayProvider(options = {}) {
  const sayCommand = stringValue(options.sayCommand || process.env.HOMEAI_TTS_SAY_COMMAND) || "/usr/bin/say";
  const afconvertCommand = stringValue(options.afconvertCommand || process.env.HOMEAI_TTS_AFCONVERT_COMMAND) || "/usr/bin/afconvert";
  const voiceMap = Object.assign({
    zh_hifi_host: stringValue(process.env.HOMEAI_TTS_MACOS_VOICE) || "Tingting",
    macos_system: "",
  }, options.voiceMap || {});

  async function synthesize(input = {}) {
    const text = stringValue(input.text, TEXT_MAX);
    if (!text) throw statusError(400, "tts_text_required");
    const format = input.format === "aiff" ? "aiff" : DEFAULT_FORMAT;
    const outPath = input.outputPath;
    const tmpAiff = format === "aiff" ? outPath : path.join(os.tmpdir(), `homeai-tts-${process.pid}-${crypto.randomUUID()}.aiff`);
    const args = ["-o", tmpAiff];
    const voice = voiceMap[input.voice] || input.voice || "";
    if (voice) args.push("-v", voice);
    args.push(text);
    await spawnFilePromise(sayCommand, args);
    if (format !== "aiff") {
      await spawnFilePromise(afconvertCommand, ["-f", "WAVE", "-d", "LEI16", tmpAiff, outPath]);
      await fsp.rm(tmpAiff, { force: true });
    }
    return {
      provider: "macos_say",
      durationSeconds: 0,
    };
  }

  return { synthesize };
}

function createCosyVoiceCommandProvider(options = {}) {
  const env = options.env || process.env;
  const python = stringValue(options.python || env.HOMEAI_TTS_COSYVOICE_PYTHON) || "python3";
  const script = stringValue(options.script || env.HOMEAI_TTS_COSYVOICE_SCRIPT)
    || path.join(process.cwd(), "scripts", "homeai-cosyvoice-synthesize.py");
  const repoDir = stringValue(options.repoDir || env.HOMEAI_TTS_COSYVOICE_REPO_DIR);
  const modelDir = stringValue(options.modelDir || env.HOMEAI_TTS_COSYVOICE_MODEL_DIR);
  const promptAudio = stringValue(options.promptAudio || env.HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO);
  const promptText = stringValue(options.promptText || env.HOMEAI_TTS_COSYVOICE_PROMPT_TEXT, 1200);
  const cacheDir = stringValue(options.cacheDir || env.HOMEAI_TTS_COSYVOICE_CACHE_DIR);
  const mode = stringValue(options.mode || env.HOMEAI_TTS_COSYVOICE_MODE || "zero_shot", 40);
  const instruction = stringValue(options.instruction || env.HOMEAI_TTS_COSYVOICE_INSTRUCTION, 1200);
  const speaker = stringValue(options.speaker || env.HOMEAI_TTS_COSYVOICE_SPEAKER || "中文女", 80);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs || env.HOMEAI_TTS_COSYVOICE_TIMEOUT_MS))
    ? Number(options.timeoutMs || env.HOMEAI_TTS_COSYVOICE_TIMEOUT_MS)
    : 10 * 60 * 1000;

  async function synthesize(input = {}) {
    const text = stringValue(input.text, TEXT_MAX);
    if (!text) throw statusError(400, "tts_text_required");
    const outputPath = stringValue(input.outputPath);
    if (!outputPath) throw statusError(500, "tts_output_path_required");
    const profile = input.ttsProfile && typeof input.ttsProfile === "object" ? input.ttsProfile : {};
    const effectiveMode = stringValue(profile.mode || mode || "zero_shot", 40);
    const effectivePromptAudio = stringValue(profile.promptAudio || profile.prompt_audio_path || promptAudio);
    const effectivePromptText = stringValue(profile.promptText || profile.prompt_text || promptText, 1600);
    const effectiveInstruction = stringValue(profile.instruction || instruction, 1200);
    const effectiveSpeaker = stringValue(profile.speaker || speaker || "中文女", 80);
    const args = [script, "--output", outputPath, "--format", input.format || DEFAULT_FORMAT, "--mode", effectiveMode];
    if (repoDir) args.push("--repo-dir", repoDir);
    if (modelDir) args.push("--model-dir", modelDir);
    if (cacheDir) args.push("--cache-dir", cacheDir);
    if (effectivePromptAudio) args.push("--prompt-audio", effectivePromptAudio);
    if (effectivePromptText) args.push("--prompt-text", effectivePromptText);
    if (effectiveInstruction) args.push("--instruction", effectiveInstruction);
    if (effectiveSpeaker) args.push("--speaker", effectiveSpeaker);
    const result = await spawnJsonPromise(python, args, {
      text,
      voice: input.voice || DEFAULT_VOICE,
      language: input.language || DEFAULT_LANGUAGE,
      format: input.format || DEFAULT_FORMAT,
      target_loudness_lufs: input.targetLoudnessLufs ?? DEFAULT_LOUDNESS,
    }, { env, cwd: repoDir || process.cwd(), timeoutMs });
    return {
      provider: result?.provider || "cosyvoice",
      durationSeconds: Number.isFinite(Number(result?.duration_seconds)) ? Number(result.duration_seconds) : 0,
    };
  }

  return { synthesize };
}

function createDefaultProvider(options = {}) {
  const env = options.env || process.env;
  const provider = stringValue(options.providerName || env.HOMEAI_TTS_PROVIDER || env.HOMEAI_TTS_BACKEND, 80).toLowerCase();
  if (provider === "cosyvoice" || provider === "cosyvoice-command" || provider === "cosyvoice3") {
    return createCosyVoiceCommandProvider(options);
  }
  return createMacosSayProvider(options);
}

function normalizeSynthesizeInput(input = {}) {
  const text = stringValue(input.text, TEXT_MAX);
  if (!text) throw statusError(400, "tts_text_required");
  const format = stringValue(input.format || DEFAULT_FORMAT, 20).toLowerCase();
  if (!SUPPORTED_FORMATS.has(format)) throw statusError(400, "tts_format_not_supported");
  const voice = safeToken(input.voice || DEFAULT_VOICE, DEFAULT_VOICE);
  const language = stringValue(input.language || DEFAULT_LANGUAGE, 40) || DEFAULT_LANGUAGE;
  const purpose = safeToken(input.purpose || "general", "general", PURPOSE_MAX);
  const loudness = Number(input.target_loudness_lufs);
  const targetLoudnessLufs = Number.isFinite(loudness) ? Math.max(-30, Math.min(-10, loudness)) : DEFAULT_LOUDNESS;
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? JSON.parse(JSON.stringify(input.metadata))
    : {};
  return { text, voice, language, format, targetLoudnessLufs, purpose, metadata };
}

function createHomeAiTtsService(options = {}) {
  const env = options.env || process.env;
  const dataDir = path.resolve(stringValue(options.dataDir) || defaultDataDir(env));
  const rootDir = path.resolve(stringValue(options.rootDir) || stringValue(env.HOMEAI_TTS_DATA_DIR) || path.join(dataDir, "tts"));
  const assetDir = path.resolve(stringValue(options.assetDir) || stringValue(env.HOMEAI_TTS_ASSET_DIR) || path.join(rootDir, "assets"));
  const watchedFolder = path.resolve(stringValue(options.watchedFolder) || stringValue(env.HOMEAI_TTS_ROON_WATCHED_FOLDER) || path.join(rootDir, "roon-watched", "HomeAI Narration"));
  const dbPath = path.resolve(stringValue(options.dbPath) || stringValue(env.HOMEAI_TTS_DB_PATH) || path.join(rootDir, "home-ai-tts.sqlite"));
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const provider = options.provider || createDefaultProvider(Object.assign({}, options, { env }));
  const profileService = options.profileService === null
    ? null
    : (options.profileService || createHomeAiTtsProfileService({
      dataDir,
      rootDir,
      dbPath,
      env,
      now,
    }));
  const ownsProfileService = Boolean(profileService && !options.profileService);
  let db = null;

  function ensureDb() {
    if (db) return db;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_ai_tts_assets (
        asset_id TEXT PRIMARY KEY,
        text_hash TEXT NOT NULL,
        voice TEXT NOT NULL,
        language TEXT NOT NULL,
        format TEXT NOT NULL,
        purpose TEXT NOT NULL,
        target_loudness_lufs REAL NOT NULL,
        mime_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        watched_path TEXT NOT NULL,
        checksum TEXT NOT NULL,
        duration_seconds REAL NOT NULL,
        provider TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_home_ai_tts_assets_metadata_plugin ON home_ai_tts_assets(json_extract(metadata_json, '$.plugin_id'))");
    db.exec("CREATE INDEX IF NOT EXISTS idx_home_ai_tts_assets_metadata_demo ON home_ai_tts_assets(json_extract(metadata_json, '$.demo_id'))");
    return db;
  }

  function rowToAsset(row) {
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || "{}"); } catch (_) {}
    return {
      ok: true,
      asset_id: row.asset_id,
      voice: row.voice,
      language: row.language,
      format: row.format,
      purpose: row.purpose,
      target_loudness_lufs: row.target_loudness_lufs,
      duration_seconds: row.duration_seconds,
      mime_type: row.mime_type,
      provider: row.provider,
      file_url: `/api/v1/home-ai/tts/assets/${encodeURIComponent(row.asset_id)}/file`,
      local_path: row.file_path,
      roon_watched_path: row.watched_path,
      checksum: row.checksum,
      status: row.status,
      metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function findAsset(assetId) {
    const id = stringValue(assetId, 96);
    if (!id) return null;
    return rowToAsset(ensureDb().prepare("SELECT * FROM home_ai_tts_assets WHERE asset_id = ?").get(id));
  }

  async function synthesize(input = {}) {
    const normalized = normalizeSynthesizeInput(input);
    const workspaceId = stringValue(normalized.metadata.workspace_id || normalized.metadata.workspaceId || input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const ttsProfile = profileService && typeof profileService.resolveVoiceProfile === "function"
      ? profileService.resolveVoiceProfile({ workspace_id: workspaceId, voice: normalized.voice })
      : null;
    if (ttsProfile) {
      normalized.metadata = Object.assign({}, normalized.metadata || {}, {
        tts_profile_id: ttsProfile.profile_id || ttsProfile.id,
        tts_profile_label: ttsProfile.label || "",
      });
    }
    const textHash = sha256(normalized.text);
    const cacheKey = {
      textHash,
      voice: normalized.voice,
      ttsProfileId: ttsProfile?.profile_id || ttsProfile?.id || "",
      ttsProfileCacheKey: ttsProfile?.cache_key || "",
      language: normalized.language,
      format: normalized.format,
      targetLoudnessLufs: normalized.targetLoudnessLufs,
      purpose: normalized.purpose,
    };
    const assetId = assetIdFor(cacheKey);
    const existing = findAsset(assetId);
    if (existing && fs.existsSync(existing.local_path)) return Object.assign({}, existing, { cached: true });
    const createdAt = now().toISOString();
    const ext = extensionFor(normalized.format);
    const fileName = `${assetId}.${ext}`;
    const filePath = path.join(assetDir, fileName);
    const watchedPath = path.join(watchedFolder, fileName);
    await fsp.mkdir(assetDir, { recursive: true });
    await fsp.mkdir(watchedFolder, { recursive: true });
    const result = await provider.synthesize(Object.assign({}, normalized, { outputPath: filePath, ttsProfile }));
    await fsp.copyFile(filePath, watchedPath);
    const fileBuffer = await fsp.readFile(filePath);
    const checksum = sha256(fileBuffer);
    const mimeType = mimeTypeFor(normalized.format);
    const durationSeconds = Number.isFinite(Number(result?.durationSeconds)) ? Number(result.durationSeconds) : 0;
    ensureDb().prepare(`
      INSERT INTO home_ai_tts_assets (
        asset_id, text_hash, voice, language, format, purpose, target_loudness_lufs,
        mime_type, file_path, watched_path, checksum, duration_seconds, provider,
        metadata_json, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        metadata_json = excluded.metadata_json,
        file_path = excluded.file_path,
        watched_path = excluded.watched_path,
        checksum = excluded.checksum,
        duration_seconds = excluded.duration_seconds,
        provider = excluded.provider,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      assetId,
      textHash,
      normalized.voice,
      normalized.language,
      normalized.format,
      normalized.purpose,
      normalized.targetLoudnessLufs,
      mimeType,
      filePath,
      watchedPath,
      checksum,
      durationSeconds,
      result?.provider || "unknown",
      JSON.stringify(normalized.metadata || {}),
      "ready",
      createdAt,
      createdAt,
    );
    return Object.assign({}, findAsset(assetId), { cached: false });
  }

  function getAsset(assetId) {
    const asset = findAsset(assetId);
    if (!asset) throw statusError(404, "tts_asset_not_found");
    return asset;
  }

  function fileForAsset(assetId) {
    const asset = getAsset(assetId);
    if (!fs.existsSync(asset.local_path)) throw statusError(404, "tts_asset_file_not_found");
    return asset;
  }

  async function deleteAsset(assetId) {
    const asset = findAsset(assetId);
    if (!asset) return { ok: true, deleted: false, asset_id: stringValue(assetId, 96) };
    await fsp.rm(asset.local_path, { force: true });
    await fsp.rm(asset.roon_watched_path, { force: true });
    ensureDb().prepare("DELETE FROM home_ai_tts_assets WHERE asset_id = ?").run(asset.asset_id);
    return { ok: true, deleted: true, asset_id: asset.asset_id };
  }

  async function synthesizeDemoPlan(input = {}) {
    const demoId = stringValue(input.demo_id || input.demoId || input.metadata?.demo_id, 160);
    if (!demoId) throw statusError(400, "tts_demo_id_required");
    const tracks = Array.isArray(input.tracks) ? input.tracks : [];
    const assets = [];
    for (const track of tracks) {
      const trackIndex = Number.isFinite(Number(track.index)) ? Number(track.index) : assets.length + 1;
      const text = [
        track.intro_script,
        track.transition_note,
        Array.isArray(track.listen_points) ? track.listen_points.join("；") : track.listen_points,
        track.recommended_volume ? `建议音量：${track.recommended_volume}` : "",
      ].map((item) => stringValue(item, 2000)).filter(Boolean).join("\n");
      if (!text) {
        assets.push({ index: trackIndex, status: "skipped", reason: "empty_script" });
        continue;
      }
      const asset = await synthesize(Object.assign({}, input, {
        text,
        purpose: input.purpose || "music_demo_narration",
        metadata: Object.assign({}, input.metadata || {}, {
          plugin_id: "music",
          demo_id: demoId,
          track_index: trackIndex,
          script_type: "before_track",
        }),
      }));
      assets.push({
        index: trackIndex,
        status: "ready",
        before_track_asset_id: asset.asset_id,
        before_track_file_url: asset.file_url,
        duration_seconds: asset.duration_seconds,
      });
    }
    return { ok: true, demo_id: demoId, assets, narrations: assets };
  }

  function listAssets(input = {}) {
    const pluginId = stringValue(input.plugin_id || input.pluginId, 120);
    const demoId = stringValue(input.demo_id || input.demoId, 160);
    let sql = "SELECT * FROM home_ai_tts_assets";
    const params = [];
    const clauses = [];
    if (pluginId) {
      clauses.push("json_extract(metadata_json, '$.plugin_id') = ?");
      params.push(pluginId);
    }
    if (demoId) {
      clauses.push("json_extract(metadata_json, '$.demo_id') = ?");
      params.push(demoId);
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    sql += " ORDER BY created_at DESC LIMIT 200";
    return ensureDb().prepare(sql).all(...params).map(rowToAsset);
  }

  function requireProfileService() {
    if (!profileService) throw statusError(503, "tts_profile_service_unavailable");
    return profileService;
  }

  function close() {
    if (db) db.close();
    db = null;
    if (ownsProfileService && typeof profileService.close === "function") profileService.close();
  }

  return {
    createProfile: (...args) => requireProfileService().createProfile(...args),
    deleteProfile: (...args) => requireProfileService().deleteProfile(...args),
    listProfiles: (...args) => requireProfileService().listProfiles(...args),
    setDefaultProfile: (...args) => requireProfileService().setDefaultProfile(...args),
    synthesize,
    synthesizeDemoPlan,
    getAsset,
    fileForAsset,
    deleteAsset,
    listAssets,
    close,
    paths: () => ({ rootDir, assetDir, watchedFolder, dbPath }),
  };
}

module.exports = {
  createCosyVoiceCommandProvider,
  createDefaultProvider,
  createHomeAiTtsService,
  createMacosSayProvider,
  normalizeSynthesizeInput,
};
