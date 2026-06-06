"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  compactPath,
  containsLegacyDrivePath,
  macDriveUsersPrefix,
  parseArgs,
  remapLegacyDriveString,
  repair,
} = require("../scripts/macos-directory-path-migration-repair");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-macos-dir-path-repair-"));
const dbPath = path.join(root, "data", "hermes-mobile.sqlite3");
const driveUsers = macDriveUsersPrefix(root);
const normalizedDriveUsers = driveUsers.replace(/\\/g, "/");
const exactSharedFrom = path.join(root, "data", "drive", "users", "weixin_wuping", "Hermes-Wuping", "Health", "Report").replace(/\\/g, "/");
const exactSharedTo = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Wuping.Health", "Report").replace(/\\/g, "/");

function writeFixtureDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Project"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Plugins", "Wardrobe"), { recursive: true });
  fs.mkdirSync(exactSharedTo, { recursive: true });
  fs.mkdirSync(path.join(root, "data", "drive", "Plugins", "Wardrobe"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Project", "report.md"), "ok\n", "utf8");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE messages(
      id TEXT PRIMARY KEY,
      directory_route_json TEXT,
      directory_aliases_json TEXT,
      artifacts_json TEXT,
      raw_json TEXT
    );
    CREATE TABLE threads(
      id TEXT PRIMARY KEY,
      task_group_meta_json TEXT,
      raw_json TEXT
    );
    CREATE TABLE artifacts(
      id TEXT PRIMARY KEY,
      path TEXT,
      raw_json TEXT
    );
  `);
  db.prepare("INSERT INTO messages(id, directory_route_json, directory_aliases_json, artifacts_json, raw_json) VALUES (?, ?, ?, ?, ?)").run(
    "msg_1",
    JSON.stringify({
      label: "Project",
      root: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner",
      path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
    }),
    JSON.stringify([
      {
        label: "Project",
        root: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner",
        path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
      },
    ]),
    JSON.stringify([
      {
        name: "report",
        path: "C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\Hermes-Owner\\Project\\report.md",
      },
    ]),
    JSON.stringify({
      id: "msg_1",
      directoryRoute: {
        label: "Project",
        root: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner",
        path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
      },
      directoryAliases: [
        {
          label: "Project",
          root: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner",
          path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
        },
      ],
    }),
  );
  db.prepare("INSERT INTO messages(id, directory_route_json, directory_aliases_json, artifacts_json, raw_json) VALUES (?, ?, ?, ?, ?)").run(
    "msg_rootless",
    JSON.stringify({
      label: "Wardrobe",
      canonicalRoot: path.join(root, "data", "drive", "users", "owner", "Hermes-Owner"),
      root: path.join(root, "data", "drive", "Plugins"),
      path: path.join(root, "data", "drive", "Plugins", "Wardrobe"),
    }),
    JSON.stringify([
      {
        label: "Wardrobe",
        canonicalRoot: path.join(root, "data", "drive", "users", "owner", "Hermes-Owner"),
        root: path.join(root, "data", "drive", "Plugins"),
        path: path.join(root, "data", "drive", "Plugins", "Wardrobe"),
      },
    ]),
    JSON.stringify([]),
    JSON.stringify({
      id: "msg_rootless",
      directoryRoute: {
        label: "Wardrobe",
        canonicalRoot: path.join(root, "data", "drive", "users", "owner", "Hermes-Owner"),
        root: path.join(root, "data", "drive", "Plugins"),
        path: path.join(root, "data", "drive", "Plugins", "Wardrobe"),
      },
    }),
  );
  db.prepare("INSERT INTO messages(id, directory_route_json, directory_aliases_json, artifacts_json, raw_json) VALUES (?, ?, ?, ?, ?)").run(
    "msg_exact",
    JSON.stringify({
      label: "Health Report",
      root: path.dirname(exactSharedFrom),
      path: exactSharedFrom,
    }),
    JSON.stringify([
      {
        label: "Health Report",
        root: path.dirname(exactSharedFrom),
        path: exactSharedFrom,
      },
    ]),
    JSON.stringify([]),
    JSON.stringify({
      id: "msg_exact",
      directoryRoute: {
        label: "Health Report",
        root: path.dirname(exactSharedFrom),
        path: exactSharedFrom,
      },
    }),
  );
  db.prepare("INSERT INTO threads(id, task_group_meta_json, raw_json) VALUES (?, ?, ?)").run(
    "thread_1",
    JSON.stringify({
      task_1: {
        directoryRoute: {
          path: "C:/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
        },
      },
    }),
    JSON.stringify({
      id: "thread_1",
      taskGroupMeta: {
        task_1: {
          directoryRoute: {
            path: "C:/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project",
          },
        },
      },
    }),
  );
  db.prepare("INSERT INTO artifacts(id, path, raw_json) VALUES (?, ?, ?)").run(
    "artifact_1",
    "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project/report.md",
    JSON.stringify({
      path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project/report.md",
      displayPath: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Project/report.md",
    }),
  );
  db.prepare("INSERT INTO artifacts(id, path, raw_json) VALUES (?, ?, ?)").run(
    "artifact_missing",
    "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Missing.md",
    JSON.stringify({
      path: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-Owner/Missing.md",
    }),
  );
  db.close();
}

function readValue(sql, id) {
  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    return db.prepare(sql).get(id);
  } finally {
    db.close();
  }
}

try {
  writeFixtureDb();

  const parsed = parseArgs(["--root", root, "--json"]);
  assert.equal(parsed.root, root);
  assert.equal(parsed.dbPath, dbPath);
  assert.equal(parsed.json, true);
  assert.equal(parseArgs(["--root", root, "--repair-rootless-drive"]).repairRootlessDrive, true);
  assert.equal(parseArgs(["--root", root, "--reset-state-snapshot"]).resetStateSnapshot, true);
  assert.deepEqual(parseArgs(["--root", root, "--replace-path", exactSharedFrom, exactSharedTo]).exactPathReplacements, [{ from: exactSharedFrom, to: exactSharedTo }]);
  assert.equal(compactPath(`${driveUsers}owner/Hermes-Owner`, root), "$DRIVE/users/owner/Hermes-Owner");
  assert.equal(containsLegacyDrivePath("/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/a"), true);
  assert.equal(
    remapLegacyDriveString("C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\Hermes-Owner\\Project", root).value,
    `${normalizedDriveUsers}owner/Hermes-Owner/Project`,
  );

  const dryRun = repair({ root, dbPath, write: false, sampleLimit: 10 });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.changed, true);
  assert.equal(dryRun.wrote, false);
  assert.equal(dryRun.backups.length, 0);
  assert.equal(dryRun.results["messages.directory_route_json"].affectedRows, 1);
  assert.equal(dryRun.results["messages.directory_aliases_json"].affectedRows, 1);
  assert.equal(dryRun.results["messages.artifacts_json"].affectedRows, 1);
  assert.equal(dryRun.results["messages.raw_json"].affectedRows, 1);
  assert.equal(dryRun.results["threads.task_group_meta_json"].affectedRows, 1);
  assert.equal(dryRun.results["threads.raw_json"].affectedRows, 1);
  assert.equal(dryRun.results["artifacts.path"].affectedRows, 2);
  assert.equal(dryRun.results["artifacts.raw_json"].affectedRows, 2);
  assert.equal(dryRun.totals.missingAfterRemap >= 1, true);

  const unchanged = readValue("SELECT directory_route_json FROM messages WHERE id = ?", "msg_1").directory_route_json;
  assert.match(unchanged, /\/mnt\/c\/ProgramData\/HermesMobile/);

  const written = repair({ root, dbPath, write: true, sampleLimit: 10 });
  assert.equal(written.ok, true);
  assert.equal(written.mode, "write");
  assert.equal(written.changed, true);
  assert.equal(written.wrote, true);
  assert.equal(written.backups.length, 1);
  assert.equal(fs.existsSync(written.backups[0].replace("<root>", root)), true);

  const message = readValue("SELECT directory_route_json, directory_aliases_json, artifacts_json, raw_json FROM messages WHERE id = ?", "msg_1");
  assert.doesNotMatch(message.directory_route_json, /\/mnt\/c\/ProgramData\/HermesMobile/);
  assert.doesNotMatch(message.directory_aliases_json, /\/mnt\/c\/ProgramData\/HermesMobile/);
  assert.doesNotMatch(message.artifacts_json, /C:\\\\ProgramData/);
  assert.doesNotMatch(message.raw_json, /\/mnt\/c\/ProgramData\/HermesMobile/);
  assert.match(JSON.parse(message.directory_route_json).path, /\/data\/drive\/users\/owner\/Hermes-Owner\/Project/);
  assert.match(JSON.parse(message.raw_json).directoryRoute.path, /\/data\/drive\/users\/owner\/Hermes-Owner\/Project/);

  const thread = readValue("SELECT task_group_meta_json, raw_json FROM threads WHERE id = ?", "thread_1");
  assert.match(JSON.parse(thread.task_group_meta_json).task_1.directoryRoute.path, /\/data\/drive\/users\/owner\/Hermes-Owner\/Project/);
  assert.match(JSON.parse(thread.raw_json).taskGroupMeta.task_1.directoryRoute.path, /\/data\/drive\/users\/owner\/Hermes-Owner\/Project/);

  const artifact = readValue("SELECT path, raw_json FROM artifacts WHERE id = ?", "artifact_1");
  assert.equal(artifact.path, `${normalizedDriveUsers}owner/Hermes-Owner/Project/report.md`);
  assert.equal(JSON.parse(artifact.raw_json).displayPath, `${normalizedDriveUsers}owner/Hermes-Owner/Project/report.md`);

  const secondDryRun = repair({ root, dbPath, write: false, sampleLimit: 10 });
  assert.equal(secondDryRun.changed, false);
  assert.equal(secondDryRun.totals.affectedRows, 0);

  const rootlessDryRun = repair({ root, dbPath, write: false, sampleLimit: 10, repairRootlessDrive: true });
  assert.equal(rootlessDryRun.changed, true);
  assert.equal(rootlessDryRun.repairRootlessDrive, true);
  assert.equal(rootlessDryRun.results["messages.directory_route_json"].affectedRows, 1);
  assert.equal(rootlessDryRun.results["messages.directory_aliases_json"].affectedRows, 1);
  assert.equal(rootlessDryRun.results["messages.raw_json"].affectedRows, 1);

  const statePath = path.join(root, "data", "state.json");
  fs.writeFileSync(statePath, JSON.stringify({ schemaVersion: 1, threads: [] }), "utf8");
  const rootlessWritten = repair({ root, dbPath, write: true, sampleLimit: 10, repairRootlessDrive: true, resetStateSnapshot: true });
  assert.equal(rootlessWritten.ok, true);
  assert.equal(rootlessWritten.changed, true);
  assert.equal(rootlessWritten.wrote, true);
  assert.equal(rootlessWritten.stateSnapshot.reset, true);
  assert.equal(rootlessWritten.stateSnapshot.path, "<root>/data/state.json");
  assert.equal(fs.existsSync(statePath), false);
  assert.equal(fs.existsSync(rootlessWritten.stateSnapshot.backup.replace("<root>", root)), true);
  const rootlessMessage = readValue("SELECT directory_route_json, directory_aliases_json, raw_json FROM messages WHERE id = ?", "msg_rootless");
  assert.equal(
    JSON.parse(rootlessMessage.directory_route_json).path,
    path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Plugins", "Wardrobe").replace(/\\/g, "/"),
  );
  assert.equal(
    JSON.parse(rootlessMessage.directory_aliases_json)[0].path,
    path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Plugins", "Wardrobe").replace(/\\/g, "/"),
  );
  assert.equal(
    JSON.parse(rootlessMessage.raw_json).directoryRoute.path,
    path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Plugins", "Wardrobe").replace(/\\/g, "/"),
  );
  const rootlessSecondDryRun = repair({ root, dbPath, write: false, sampleLimit: 10, repairRootlessDrive: true });
  assert.equal(rootlessSecondDryRun.changed, false);
  assert.equal(rootlessSecondDryRun.totals.affectedRows, 0);

  const exactDryRun = repair({
    root,
    dbPath,
    write: false,
    sampleLimit: 10,
    exactPathReplacements: [{ from: exactSharedFrom, to: exactSharedTo }],
  });
  assert.equal(exactDryRun.changed, true);
  assert.equal(exactDryRun.results["messages.directory_route_json"].affectedRows, 1);
  assert.equal(exactDryRun.results["messages.directory_aliases_json"].affectedRows, 1);
  assert.equal(exactDryRun.results["messages.raw_json"].affectedRows, 1);

  const exactWritten = repair({
    root,
    dbPath,
    write: true,
    sampleLimit: 10,
    exactPathReplacements: [{ from: exactSharedFrom, to: exactSharedTo }],
  });
  assert.equal(exactWritten.ok, true);
  assert.equal(exactWritten.changed, true);
  const exactMessage = readValue("SELECT directory_route_json, directory_aliases_json, raw_json FROM messages WHERE id = ?", "msg_exact");
  assert.equal(JSON.parse(exactMessage.directory_route_json).path, exactSharedTo);
  assert.equal(JSON.parse(exactMessage.directory_aliases_json)[0].path, exactSharedTo);
  assert.equal(JSON.parse(exactMessage.raw_json).directoryRoute.path, exactSharedTo);
  const exactSecondDryRun = repair({
    root,
    dbPath,
    write: false,
    sampleLimit: 10,
    exactPathReplacements: [{ from: exactSharedFrom, to: exactSharedTo }],
  });
  assert.equal(exactSecondDryRun.changed, false);
  assert.equal(exactSecondDryRun.totals.affectedRows, 0);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("macOS directory path migration repair tests passed");
