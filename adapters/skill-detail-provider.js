"use strict";

function defaultCompactText(value, maxChars = 800) {
  const text = String(value || "");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function errorWithStatus(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function createChildBridge(options) {
  const spawnFn = options.spawn;
  if (typeof spawnFn !== "function") throw new TypeError("spawn is required");
  const bridgeCommand = options.bridgeCommand;
  if (typeof bridgeCommand !== "function") throw new TypeError("bridgeCommand is required");
  const timeoutMs = Number(options.timeoutMs ?? 12000);
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const maxStdoutChars = Number(options.maxStdoutChars ?? 1_000_000);
  const maxStderrChars = Number(options.maxStderrChars ?? 200_000);

  return function runBridge(payload) {
    return new Promise((resolve, reject) => {
      const spec = bridgeCommand(payload) || {};
      const command = spec.command;
      const args = Array.isArray(spec.args) ? spec.args : [];
      if (!command) {
        reject(errorWithStatus("Skill bridge command is not configured", 500));
        return;
      }
      const child = spawnFn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(errorWithStatus("Skill bridge timed out", 504));
      }, timeoutMs > 0 ? timeoutMs : 12000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > maxStdoutChars) stdout = stdout.slice(-maxStdoutChars);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > maxStderrChars) stderr = stderr.slice(-maxStderrChars);
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let result = null;
        try {
          result = JSON.parse(stdout.trim() || "{}");
        } catch (err) {
          reject(errorWithStatus(`Skill bridge returned invalid JSON: ${err.message || String(err)}`, 502));
          return;
        }
        if (code !== 0 && !result.error) {
          reject(errorWithStatus(stderr.trim() || `Skill bridge exited with ${code}`, 502));
          return;
        }
        if (stderr.trim()) result.stderr = compactText(stderr.trim(), 1200);
        resolve(result);
      });
      child.stdin.end(JSON.stringify(payload || {}));
    });
  };
}

function createSkillDetailProvider(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const runBridge = typeof options.runBridge === "function" ? options.runBridge : createChildBridge(options);

  async function detail(skill) {
    const requestedSkill = String(skill || "").trim();
    if (!requestedSkill) {
      throw errorWithStatus("Skill is required", 400);
    }
    const result = await runBridge({ skill: requestedSkill });
    if (!result?.ok) {
      throw errorWithStatus(
        compactText(result?.error || "Skill was not found", 800),
        result?.status || 404,
        { skill: result?.skill || requestedSkill },
      );
    }
    return result.skill || null;
  }

  return { detail };
}

module.exports = {
  createSkillDetailProvider,
};
