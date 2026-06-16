"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function numberArg(name, fallback) {
  const value = Number(argValue(name, ""));
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args = []) {
  return spawnSync(command, args, {
    cwd: "/",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function userExists(user) {
  return run("/usr/bin/id", ["-u", user]).status === 0;
}

function testAsUser(user, targetPath, writeSmoke) {
  const smokeName = `.hermes-worker-acl-smoke-${Date.now()}-${process.pid}.tmp`;
  const smokePath = path.join(targetPath, smokeName);
  const script = [
    `test -e ${shellQuote(targetPath)}; echo exists=$?`,
    `test -r ${shellQuote(targetPath)}; echo readable=$?`,
    `test -w ${shellQuote(targetPath)}; echo writable=$?`,
    writeSmoke
      ? `printf acl-smoke > ${shellQuote(smokePath)} && test -f ${shellQuote(smokePath)} && rm -f ${shellQuote(smokePath)}; echo write_smoke=$?`
      : "echo write_smoke=0",
  ].join("; ");
  const result = run("/usr/bin/sudo", ["-n", "-u", user, "/bin/sh", "-lc", script]);
  const fields = {};
  for (const line of String(result.stdout || "").split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+)=(\d+)$/);
    if (match) fields[match[1]] = Number(match[2]);
  }
  return {
    commandStatus: result.status,
    exists: fields.exists === 0,
    readable: fields.readable === 0,
    writable: fields.writable === 0,
    writeSmoke: fields.write_smoke === 0,
    stderr: String(result.stderr || "").trim().slice(0, 240),
  };
}

function compactPath(root, value) {
  return String(value).replace(root, "<HERMES_MOBILE_ROOT>");
}

function modeOctal(stat) {
  return `0${(stat.mode & 0o777).toString(8).padStart(3, "0")}`;
}

function scanDriveDirectoriesMissingOwnerWrite(root, options = {}) {
  const driveUsersRoot = path.join(root, "data", "drive", "users");
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 200;
  const findings = [];
  let scanned = 0;
  let truncated = false;

  function walk(dir) {
    if (findings.length >= limit) {
      truncated = true;
      return;
    }
    let stat;
    try {
      stat = fs.lstatSync(dir);
    } catch (err) {
      findings.push({
        path: compactPath(root, dir),
        reason: "stat_failed",
        error: String(err.message || err).slice(0, 160),
      });
      return;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    scanned += 1;
    if ((stat.mode & 0o200) === 0) {
      findings.push({
        path: compactPath(root, dir),
        reason: "owner_write_missing",
        mode: modeOctal(stat),
      });
      if (findings.length >= limit) {
        truncated = true;
        return;
      }
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      findings.push({
        path: compactPath(root, dir),
        reason: "list_failed",
        error: String(err.message || err).slice(0, 160),
      });
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      walk(path.join(dir, entry.name));
      if (findings.length >= limit) {
        truncated = true;
        return;
      }
    }
  }

  if (!fs.existsSync(driveUsersRoot)) {
    return {
      checked: false,
      status: "skipped",
      reason: "drive_users_root_missing",
      path: compactPath(root, driveUsersRoot),
      scanned,
      findings,
      truncated,
    };
  }

  walk(driveUsersRoot);
  return {
    checked: true,
    status: findings.length ? "failed" : "ok",
    path: compactPath(root, driveUsersRoot),
    scanned,
    findings,
    truncated,
  };
}

function defaultChecks(root) {
  const dataDir = path.join(root, "data");
  const drive = path.join(dataDir, "drive");
  const uploads = path.join(dataDir, "uploads");
  return [
    {
      user: "hm-owner",
      label: "owner-drive",
      paths: [drive, uploads, path.join(drive, "\u63d2\u4ef6", "\u8863\u6a71")],
      required: true,
    },
    {
      user: "hm-wuping",
      label: "wuping-drive",
      paths: [path.join(drive, "users", "weixin_wuping"), uploads],
      required: false,
    },
    {
      user: "hm-stephen",
      label: "stephen-drive",
      paths: [path.join(drive, "users", "weixin_stephen"), uploads],
      required: false,
    },
    {
      user: "hm-xuyan",
      label: "xuyan-drive",
      paths: [path.join(drive, "users", "user-981731fe"), uploads],
      required: false,
    },
    {
      user: "hm-xulu",
      label: "xulu-drive",
      paths: [path.join(drive, "users", "user-a87aaa61"), uploads],
      required: false,
    },
    {
      user: "hm-test",
      label: "test-drive",
      paths: [path.join(drive, "users", "test"), path.join(drive, "users", "weixin_test_1"), uploads],
      required: false,
    },
  ];
}

function defaultDenyChecks(root) {
  const dataDir = path.join(root, "data");
  const drive = path.join(dataDir, "drive");
  const skillProfiles = path.join(dataDir, "skill-profiles");
  return [
    {
      user: "hm-wuping",
      label: "deny-owner-skill-store",
      paths: [path.join(skillProfiles, "owner-full", "skills"), path.join(skillProfiles, "owner-full", "memories")],
    },
    {
      user: "hm-stephen",
      label: "deny-wuping-plugin-private",
      paths: [path.join(drive, "users", "weixin_wuping", ".hermes-wardrobe"), path.join(drive, "users", "weixin_wuping", ".hermes-finance")],
    },
    {
      user: "hm-wuping",
      label: "deny-xuyan-drive",
      paths: [path.join(drive, "users", "user-981731fe")],
    },
    {
      user: "hm-xuyan",
      label: "deny-wuping-plugin-private",
      paths: [path.join(drive, "users", "weixin_wuping", ".hermes-wardrobe")],
    },
  ];
}

function main() {
  const root = path.resolve(argValue("--root", process.env.HERMES_MOBILE_ROOT || "/Users/hermes-host/HermesMobile"));
  const json = hasArg("--json");
  const writeSmoke = !hasArg("--no-write-smoke");
  const driveWriteScanLimit = numberArg("--drive-write-scan-limit", 200);
  const results = [];
  let failed = false;

  if (process.platform !== "darwin") {
    console.error("macos_worker_filesystem_access_harness requires macOS.");
    process.exit(2);
  }

  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    console.error("macos_worker_filesystem_access_harness must run with sudo so it can sudo -u worker users without prompting.");
    process.exit(2);
  }

  for (const check of defaultChecks(root)) {
    const exists = userExists(check.user);
    if (!exists) {
      results.push({ user: check.user, label: check.label, status: check.required ? "failed" : "skipped", reason: "worker_user_missing" });
      if (check.required) failed = true;
      continue;
    }
    for (const targetPath of check.paths) {
      if (!fs.existsSync(targetPath)) {
        results.push({
          user: check.user,
          label: check.label,
          path: compactPath(root, targetPath),
          status: check.required ? "failed" : "skipped",
          reason: "host_path_missing",
        });
        if (check.required) failed = true;
        continue;
      }
      const access = testAsUser(check.user, targetPath, writeSmoke);
      const ok = access.commandStatus === 0 && access.exists && access.readable && access.writable && access.writeSmoke;
      if (!ok) failed = true;
      results.push({
        user: check.user,
        label: check.label,
        path: compactPath(root, targetPath),
        status: ok ? "ok" : "failed",
        exists: access.exists,
        readable: access.readable,
        writable: access.writable,
        writeSmoke: access.writeSmoke,
        stderr: access.stderr,
      });
    }
  }

  for (const check of defaultDenyChecks(root)) {
    const exists = userExists(check.user);
    if (!exists) {
      results.push({ user: check.user, label: check.label, status: "skipped", reason: "worker_user_missing" });
      continue;
    }
    for (const targetPath of check.paths) {
      if (!fs.existsSync(targetPath)) {
        results.push({
          user: check.user,
          label: check.label,
          path: compactPath(root, targetPath),
          status: "skipped",
          reason: "host_path_missing",
        });
        continue;
      }
      const access = testAsUser(check.user, targetPath, false);
      const ok = access.commandStatus === 0 && !access.readable && !access.writable;
      if (!ok) failed = true;
      results.push({
        user: check.user,
        label: check.label,
        path: compactPath(root, targetPath),
        status: ok ? "ok" : "failed",
        expectedDenied: true,
        exists: access.exists,
        readable: access.readable,
        writable: access.writable,
        stderr: access.stderr,
      });
    }
  }

  const driveWriteScan = scanDriveDirectoriesMissingOwnerWrite(root, { limit: driveWriteScanLimit });
  if (driveWriteScan.status === "failed") failed = true;
  results.push({
    user: "hermes-host",
    label: "drive-directory-owner-write",
    path: driveWriteScan.path,
    status: driveWriteScan.status,
    reason: driveWriteScan.reason || "",
    scanned: driveWriteScan.scanned,
    findingCount: driveWriteScan.findings.length,
    truncated: driveWriteScan.truncated,
    findings: driveWriteScan.findings,
  });

  if (json) {
    console.log(JSON.stringify({ ok: !failed, root: compactPath(root, root), results }, null, 2));
  } else {
    console.log(`macos_worker_filesystem_access_harness ok=${!failed}`);
    for (const item of results) {
      console.log([
        item.status,
        `user=${item.user}`,
        `label=${item.label}`,
        item.path ? `path=${item.path}` : "",
        item.reason ? `reason=${item.reason}` : "",
        item.exists != null ? `exists=${item.exists}` : "",
        item.readable != null ? `readable=${item.readable}` : "",
        item.writable != null ? `writable=${item.writable}` : "",
        item.writeSmoke != null ? `writeSmoke=${item.writeSmoke}` : "",
        item.stderr ? `stderr=${item.stderr}` : "",
      ].filter(Boolean).join(" "));
    }
  }

  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  compactPath,
  defaultChecks,
  defaultDenyChecks,
  scanDriveDirectoriesMissingOwnerWrite,
};
