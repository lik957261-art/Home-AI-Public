"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_VOICE = "zh_hifi_host";
const DEFAULT_LANGUAGE = "zh-CN";
const DEFAULT_MODE = "zero_shot";
const DEFAULT_PROVIDER = "cosyvoice";
const PROMPT_END_MARKER = "<|endofprompt|>";
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_TEXT = 1600;

function stringValue(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeToken(value, fallback = "profile", maxLength = 80) {
  const out = stringValue(value, maxLength).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return out || fallback;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function defaultDataDir(env = process.env) {
  return stringValue(env.HERMES_WEB_DATA_DIR)
    || stringValue(env.HERMES_MOBILE_DATA_DIR)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function statusError(status, code, message = code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizePromptText(value) {
  const text = stringValue(value, MAX_PROMPT_TEXT);
  if (!text) throw statusError(400, "tts_profile_prompt_text_required");
  if (text.includes(PROMPT_END_MARKER)) return text;
  return `${text}${PROMPT_END_MARKER}`;
}

function decodeAudioBase64(value) {
  let input = stringValue(value, Math.ceil(MAX_AUDIO_BYTES * 1.5) + 256);
  if (!input) throw statusError(400, "tts_profile_audio_required");
  const comma = input.indexOf(",");
  if (input.startsWith("data:") && comma >= 0) input = input.slice(comma + 1);
  const buffer = Buffer.from(input, "base64");
  if (!buffer.length) throw statusError(400, "tts_profile_audio_required");
  if (buffer.length > MAX_AUDIO_BYTES) throw statusError(413, "tts_profile_audio_too_large");
  return buffer;
}

function assertWav(buffer) {
  const riff = buffer.subarray(0, 4).toString("ascii");
  const wave = buffer.subarray(8, 12).toString("ascii");
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw statusError(400, "tts_profile_wav_required", "tts_profile_wav_required");
  }
}

function createHomeAiTtsProfileService(options = {}) {
  const env = options.env || process.env;
  const dataDir = path.resolve(stringValue(options.dataDir) || defaultDataDir(env));
  const rootDir = path.resolve(stringValue(options.rootDir) || stringValue(env.HOMEAI_TTS_DATA_DIR) || path.join(dataDir, "tts"));
  const dbPath = path.resolve(stringValue(options.dbPath) || stringValue(env.HOMEAI_TTS_DB_PATH) || path.join(rootDir, "home-ai-tts.sqlite"));
  const profileDir = path.resolve(stringValue(options.profileDir) || stringValue(env.HOMEAI_TTS_PROFILE_DIR) || path.join(rootDir, "profiles"));
  const now = typeof options.now === "function" ? options.now : () => new Date();
  let db = null;

  function ensureDb() {
    if (db) return db;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_ai_tts_profiles (
        workspace_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        label TEXT NOT NULL,
        language TEXT NOT NULL,
        provider TEXT NOT NULL,
        mode TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        prompt_text_hash TEXT NOT NULL,
        prompt_audio_path TEXT NOT NULL,
        prompt_audio_checksum TEXT NOT NULL,
        prompt_audio_mime TEXT NOT NULL,
        prompt_audio_bytes INTEGER NOT NULL,
        instruction TEXT NOT NULL,
        speaker TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, profile_id)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_home_ai_tts_profiles_default ON home_ai_tts_profiles(workspace_id, is_default)");
    return db;
  }

  function cacheKeyFor(row) {
    return sha256(JSON.stringify({
      workspace_id: row.workspace_id,
      profile_id: row.profile_id,
      prompt_text_hash: row.prompt_text_hash,
      prompt_audio_checksum: row.prompt_audio_checksum,
      mode: row.mode,
      instruction: row.instruction,
      speaker: row.speaker,
      updated_at: row.updated_at,
    }));
  }

  function rowToProfile(row, options = {}) {
    if (!row) return null;
    const profile = {
      ok: true,
      id: row.profile_id,
      profile_id: row.profile_id,
      workspace_id: row.workspace_id,
      label: row.label,
      language: row.language,
      provider: row.provider,
      mode: row.mode,
      prompt_text: row.prompt_text,
      prompt_text_hash: row.prompt_text_hash,
      prompt_audio_checksum: row.prompt_audio_checksum,
      prompt_audio_mime: row.prompt_audio_mime,
      prompt_audio_bytes: row.prompt_audio_bytes,
      instruction: row.instruction,
      speaker: row.speaker,
      is_default: Boolean(row.is_default),
      cache_key: cacheKeyFor(row),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    if (options.internal) {
      profile.prompt_audio_path = row.prompt_audio_path;
      profile.promptAudio = row.prompt_audio_path;
      profile.promptText = row.prompt_text;
    }
    return profile;
  }

  function workspaceIdFor(input = {}) {
    return safeToken(input.workspace_id || input.workspaceId || "owner", "owner", 120);
  }

  function getProfile(input = {}, options = {}) {
    const workspaceId = workspaceIdFor(input);
    const profileId = safeToken(input.profile_id || input.profileId || input.id, "", 120);
    if (!profileId) return null;
    return rowToProfile(ensureDb().prepare(`
      SELECT * FROM home_ai_tts_profiles
      WHERE workspace_id = ? AND profile_id = ?
    `).get(workspaceId, profileId), options);
  }

  function defaultProfile(input = {}, options = {}) {
    const workspaceId = workspaceIdFor(input);
    return rowToProfile(ensureDb().prepare(`
      SELECT * FROM home_ai_tts_profiles
      WHERE workspace_id = ? AND is_default = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(workspaceId), options);
  }

  function listProfiles(input = {}) {
    const workspaceId = workspaceIdFor(input);
    const rows = ensureDb().prepare(`
      SELECT * FROM home_ai_tts_profiles
      WHERE workspace_id = ?
      ORDER BY is_default DESC, updated_at DESC, profile_id ASC
      LIMIT 100
    `).all(workspaceId);
    return rows.map((row) => rowToProfile(row));
  }

  async function createProfile(input = {}) {
    const workspaceId = workspaceIdFor(input);
    const label = stringValue(input.label || input.name || input.profile_id || input.profileId || "TTS Profile", 120) || "TTS Profile";
    const profileId = safeToken(input.profile_id || input.profileId || input.id || label, "tts_profile", 120);
    const language = stringValue(input.language || DEFAULT_LANGUAGE, 40) || DEFAULT_LANGUAGE;
    const provider = safeToken(input.provider || DEFAULT_PROVIDER, DEFAULT_PROVIDER, 40);
    const mode = safeToken(input.mode || DEFAULT_MODE, DEFAULT_MODE, 40);
    const promptText = normalizePromptText(input.prompt_text || input.promptText);
    const audioBuffer = decodeAudioBase64(input.audio_base64 || input.audioBase64 || input.audio);
    assertWav(audioBuffer);
    const checksum = sha256(audioBuffer);
    const promptTextHash = sha256(promptText);
    const instruction = stringValue(input.instruction, 1200);
    const speaker = stringValue(input.speaker, 80);
    const createdAt = now().toISOString();
    const workspaceDir = path.join(profileDir, workspaceId);
    const audioPath = path.join(workspaceDir, `${profileId}.wav`);
    await fsp.mkdir(workspaceDir, { recursive: true });
    await fsp.writeFile(audioPath, audioBuffer);
    const existing = getProfile({ workspace_id: workspaceId, profile_id: profileId }, { internal: true });
    const finalCreatedAt = existing?.created_at || createdAt;
    const isDefault = Boolean(input.set_default || input.setDefault || input.is_default || input.isDefault);
    const database = ensureDb();
    if (isDefault) {
      database.prepare("UPDATE home_ai_tts_profiles SET is_default = 0 WHERE workspace_id = ?").run(workspaceId);
    }
    database.prepare(`
      INSERT INTO home_ai_tts_profiles (
        workspace_id, profile_id, label, language, provider, mode, prompt_text,
        prompt_text_hash, prompt_audio_path, prompt_audio_checksum, prompt_audio_mime,
        prompt_audio_bytes, instruction, speaker, is_default, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, profile_id) DO UPDATE SET
        label = excluded.label,
        language = excluded.language,
        provider = excluded.provider,
        mode = excluded.mode,
        prompt_text = excluded.prompt_text,
        prompt_text_hash = excluded.prompt_text_hash,
        prompt_audio_path = excluded.prompt_audio_path,
        prompt_audio_checksum = excluded.prompt_audio_checksum,
        prompt_audio_mime = excluded.prompt_audio_mime,
        prompt_audio_bytes = excluded.prompt_audio_bytes,
        instruction = excluded.instruction,
        speaker = excluded.speaker,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `).run(
      workspaceId,
      profileId,
      label,
      language,
      provider,
      mode,
      promptText,
      promptTextHash,
      audioPath,
      checksum,
      "audio/wav",
      audioBuffer.length,
      instruction,
      speaker,
      isDefault ? 1 : (existing?.is_default ? 1 : 0),
      finalCreatedAt,
      createdAt,
    );
    return getProfile({ workspace_id: workspaceId, profile_id: profileId });
  }

  function setDefaultProfile(input = {}) {
    const workspaceId = workspaceIdFor(input);
    const profileId = safeToken(input.profile_id || input.profileId || input.id, "", 120);
    if (!profileId) throw statusError(400, "tts_profile_id_required");
    const profile = getProfile({ workspace_id: workspaceId, profile_id: profileId }, { internal: true });
    if (!profile) throw statusError(404, "tts_profile_not_found");
    const updatedAt = now().toISOString();
    const database = ensureDb();
    database.prepare("UPDATE home_ai_tts_profiles SET is_default = 0 WHERE workspace_id = ?").run(workspaceId);
    database.prepare("UPDATE home_ai_tts_profiles SET is_default = 1, updated_at = ? WHERE workspace_id = ? AND profile_id = ?")
      .run(updatedAt, workspaceId, profileId);
    return getProfile({ workspace_id: workspaceId, profile_id: profileId });
  }

  async function deleteProfile(input = {}) {
    const workspaceId = workspaceIdFor(input);
    const profileId = safeToken(input.profile_id || input.profileId || input.id, "", 120);
    if (!profileId) throw statusError(400, "tts_profile_id_required");
    const profile = getProfile({ workspace_id: workspaceId, profile_id: profileId }, { internal: true });
    if (!profile) return { ok: true, deleted: false, profile_id: profileId, workspace_id: workspaceId };
    ensureDb().prepare("DELETE FROM home_ai_tts_profiles WHERE workspace_id = ? AND profile_id = ?").run(workspaceId, profileId);
    await fsp.rm(profile.prompt_audio_path, { force: true });
    return { ok: true, deleted: true, profile_id: profileId, workspace_id: workspaceId };
  }

  function resolveVoiceProfile(input = {}) {
    const workspaceId = workspaceIdFor(input);
    const voice = safeToken(input.voice || input.profile_id || input.profileId || DEFAULT_VOICE, DEFAULT_VOICE, 120);
    const exact = getProfile({ workspace_id: workspaceId, profile_id: voice }, { internal: true });
    if (exact) return exact;
    if (voice === DEFAULT_VOICE) return defaultProfile({ workspace_id: workspaceId }, { internal: true });
    return null;
  }

  function close() {
    if (db) db.close();
    db = null;
  }

  return {
    close,
    createProfile,
    defaultProfile,
    deleteProfile,
    getProfile,
    listProfiles,
    resolveVoiceProfile,
    setDefaultProfile,
    paths: () => ({ dbPath, profileDir, rootDir }),
  };
}

module.exports = {
  DEFAULT_TTS_PROFILE_VOICE: DEFAULT_VOICE,
  HOME_AI_TTS_PROMPT_END_MARKER: PROMPT_END_MARKER,
  createHomeAiTtsProfileService,
  normalizePromptText,
};
