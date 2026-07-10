"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "create-macos-disaster-backup.js");
const mountScriptPath = path.join(repoRoot, "scripts", "mount-macos-nas-backup-destination.sh");
const runScriptPath = path.join(repoRoot, "scripts", "run-macos-disaster-backup-to-nas.sh");
const cronScriptPath = path.join(repoRoot, "scripts", "homeai-disaster-backup-cron.sh");
const mountWatchdogScriptPath = path.join(repoRoot, "scripts", "homeai-nas-backup-mount-watchdog.sh");
const backup = require(scriptPath);
const { createMobileSqliteStore } = require(path.join(repoRoot, "adapters", "mobile-sqlite-store"));

function writeFile(file, content = "") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makeSqlite(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const code = [
    "import sqlite3, sys",
    "db = sqlite3.connect(sys.argv[1])",
    "db.execute('create table t(id integer primary key, value text)')",
    "db.execute('insert into t(value) values (?)', ('ok',))",
    "db.commit()",
    "db.close()",
  ].join("\n");
  const result = childProcess.spawnSync("/usr/bin/python3", ["-c", code, file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeHomeAiRuntimeSqlite(file) {
  const store = createMobileSqliteStore({ dbPath: file });
  store.replaceRuntimeState({
    schemaVersion: 1,
    threads: [],
    artifacts: [],
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    voiceInput: {
      phrasebook: [{
        id: "voice_phrase_backup_1",
        actorId: "owner",
        workspaceId: "owner",
        surfaceType: "chat",
        pluginId: "codex-mobile",
        term: "Home AI",
        source: "sent_text",
        status: "active",
        supportCount: 2,
        aliases: ["home ai"],
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:01.000Z",
      }],
    },
  });
  store.close();
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-macos-backup-test-"));
  const root = path.join(dir, "prod");
  const dest = path.join(dir, "nas");
  const operatorHome = path.join(dir, "operator");
  writeFile(path.join(root, "app", "server.js"), "console.log('home ai');\n");
  writeFile(path.join(root, "data", "drive", "users", "owner", "Hermes", "note.md"), "user data\n");
  writeFile(path.join(root, "data", "skill-profiles", "owner-full", "skills", "custom", "SKILL.md"), "owner skill\n");
  writeFile(path.join(root, "data", "skill-profiles", "owner-full", "memories", "profile.md"), "owner memory\n");
  writeFile(path.join(root, "data", "skill-profiles", "weixin_wuping", "skills", "health", "SKILL.md"), "health skill\n");
  writeFile(path.join(root, "data", "skill-profiles", "weixin_wuping", "memories", "summary.md"), "memory\n");
  writeFile(path.join(root, "data", "hermes-home", "SOUL.md"), "home soul\n");
  writeFile(path.join(root, "data", "production-drift-audit", "latest.json"), "{}\n");
  writeFile(path.join(root, "data", "music", "library", "index.json"), "{}\n");
  writeFile(path.join(root, "data", "music", "audio-mounts", "Music", "album", "track.flac"), "audio\n");
  writeFile(path.join(root, "data", "music", "audio-mounts", "Music", "album", "Thumbs.db"), "not sqlite\n");
  writeFile(path.join(root, "gateway-worker", "telemetry", "hm-owner-openai-1", "events.json"), "{}\n");
  writeFile(path.join(root, "gateway-worker", "telemetry", "profiles", "hm-owner-openai-1", "SOUL.md"), "gateway soul\n");
  writeFile(path.join(root, "plugins", "finance", "server.js"), "finance\n");
  writeFile(path.join(root, "plugins", "finance", "data", "receipt.txt"), "receipt\n");
  writeFile(path.join(root, "plugins", "note", "data", "attachment.bin"), "attachment\n");
  makeHomeAiRuntimeSqlite(path.join(root, "data", "hermes-mobile.sqlite3"));
  makeSqlite(path.join(root, "plugins", "finance", "data", "finance.sqlite3"));
  writeFile(path.join(operatorHome, ".hermes", "SOUL.md"), "operator soul\n");
  writeFile(path.join(operatorHome, ".hermes", "skills", "custom-agent", "SKILL.md"), "agent skill\n");
  writeFile(path.join(operatorHome, ".hermes", "profiles", "officialclean1", "SOUL.md"), "profile soul\n");
  writeFile(path.join(operatorHome, ".hermes", "profiles", "officialclean1", "skills", "custom", "SKILL.md"), "profile skill\n");
  writeFile(path.join(operatorHome, ".hermes", "profiles", "officialclean1", "memories", "m.md"), "profile memory\n");
  writeFile(path.join(operatorHome, ".codex", "skills", "codex-skill", "SKILL.md"), "codex skill\n");
  writeFile(path.join(operatorHome, ".codex-mobile-web", "codex-profiles.json"), "{}\n");
  writeFile(path.join(operatorHome, ".codex-mobile-web", "chrome-pro-bridge", "Default", "Cache", "blob.bin"), "cache\n");
  writeFile(path.join(operatorHome, ".codex-mobile-web", "thread-detail-projections", "projection.json"), "{}\n");
  return { dir, root, dest, operatorHome };
}

{
  const fixture = makeFixture();
  const receiptDir = path.join(fixture.root, "data", "backups", "disaster-recovery-receipts");
  const oldReceipt = path.join(receiptDir, "disaster-recovery-receipt-old.md");
  const recentReceipt = path.join(receiptDir, "disaster-recovery-receipt-recent.md");
  writeFile(oldReceipt, "old\n");
  writeFile(recentReceipt, "recent\n");
  const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldReceipt, oldDate, oldDate);
  const canonicalManifest = path.join(fixture.root, "data", "gateway-pool-manifest-mac.json");
  const transientManifestBackup = path.join(fixture.root, "data", "gateway-pool-manifest-mac.json.before-current-environment-20260618T042138Z.bak");
  writeFile(canonicalManifest, "{}\n");
  writeFile(transientManifestBackup, "{}\n");
  fs.chmodSync(transientManifestBackup, 0o000);
  try {
    const result = backup.runBackup({
      root: fixture.root,
      destination: fixture.dest,
      operatorHome: fixture.operatorHome,
      receiptDir,
      label: "unit",
      checkOnly: false,
      json: true,
      includeOperatorState: true,
    });

    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "production", "data", "gateway-pool-manifest-mac.json")), true);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "production", "data", path.basename(transientManifestBackup))), false);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "production", "data", "production-drift-audit", "latest.json")), false);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "production", "data", "music", "library", "index.json")), true);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "production", "data", "music", "audio-mounts", "Music", "album", "track.flac")), false);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "operator-home", path.basename(fixture.operatorHome), ".codex-mobile-web", "codex-profiles.json")), true);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "operator-home", path.basename(fixture.operatorHome), ".codex-mobile-web", "chrome-pro-bridge", "Default", "Cache", "blob.bin")), false);
    assert.equal(fs.existsSync(path.join(result.currentRoot, "operator-home", path.basename(fixture.operatorHome), ".codex-mobile-web", "thread-detail-projections", "projection.json")), false);
    assert.equal(result.receiptRetentionDays, 3);
    assert.equal(result.prunedReceiptCount, 1);
    assert.equal(fs.existsSync(oldReceipt), false);
    assert.equal(fs.existsSync(recentReceipt), true);
    assert.equal(fs.existsSync(result.receiptPath), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.currentRoot, "DISASTER-RECOVERY-MANIFEST.json"), "utf8"));
    const skipped = manifest.steps.find((step) => step.name === `production-data-file:${path.basename(transientManifestBackup)}`);
    assert.equal(skipped.reason, "transient-production-data-backup");
  } finally {
    fs.chmodSync(transientManifestBackup, 0o600);
  }
}

{
  const fixture = makeFixture();
  const result = backup.runBackup({
    root: fixture.root,
    destination: fixture.dest,
    operatorHome: fixture.operatorHome,
    receiptDir: path.join(fixture.root, "data", "backups", "disaster-recovery-receipts"),
    label: "unit",
    checkOnly: true,
    json: true,
    includeOperatorState: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.checkOnly, true);
  assert.equal(result.coverage.plugins, true);
  assert.equal(result.coverage.workspaceSkillStores, true);
  assert.equal(result.coverage.workspaceMemoryStores, true);
  assert.equal(result.coverage.memorySoulFiles, true);
  assert.equal(result.coverage.hermesAgentCustomSkillsStore, true);
  assert.equal(result.sqliteFileCount, 2);
  assert.equal(result.soulFileCount, 4);
  assert.equal(fs.existsSync(fixture.dest), false, "check-only must not create destination files");

  const stepNames = backup.buildSteps({
    root: fixture.root,
    destination: fixture.dest,
    operatorHome: fixture.operatorHome,
    receiptDir: path.join(fixture.root, "data", "backups", "disaster-recovery-receipts"),
    label: "unit",
    checkOnly: true,
    json: true,
    includeOperatorState: true,
  }, "unit").steps.map((step) => step().name);
  assert.ok(stepNames.includes("production-plugins-all"));
  assert.ok(stepNames.some((name) => name.startsWith("production-data:drive:users:owner:Hermes")));
  assert.ok(stepNames.includes("operator-hermes-agent-custom-store"));
  assert.ok(stepNames.some((name) => name.startsWith("sqlite-snapshot:data/hermes-mobile.sqlite3")));
  assert.ok(stepNames.some((name) => name.startsWith("sqlite-snapshot:plugins/finance/data/finance.sqlite3")));
}

{
  const fixture = makeFixture();
  const soulPath = path.join(fixture.root, "gateway-worker", "telemetry", "profiles", "hm-owner-openai-1", "SOUL.md");
  fs.chmodSync(soulPath, 0o000);
  try {
    const result = backup.runBackup({
      root: fixture.root,
      destination: fixture.dest,
      operatorHome: fixture.operatorHome,
      receiptDir: path.join(fixture.root, "data", "backups", "disaster-recovery-receipts"),
      label: "unit",
      checkOnly: false,
      json: true,
      includeOperatorState: true,
    });

    assert.equal(result.ok, false);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.currentRoot, "DISASTER-RECOVERY-MANIFEST.json"), "utf8"));
    assert.ok(manifest.failures.some((failure) => /soul_file_unreadable:profiles\/hm-owner-openai-1\/SOUL\.md/.test(failure)));
  } finally {
    fs.chmodSync(soulPath, 0o600);
  }
}

{
  const fixture = makeFixture();
  const telemetryPath = path.join(fixture.root, "gateway-worker", "telemetry", "hm-owner-openai-1");
  fs.chmodSync(telemetryPath, 0o000);
  try {
    const result = backup.runBackup({
      root: fixture.root,
      destination: fixture.dest,
      operatorHome: fixture.operatorHome,
      receiptDir: path.join(fixture.root, "data", "backups", "disaster-recovery-receipts"),
      label: "unit",
      checkOnly: false,
      json: true,
      includeOperatorState: true,
    });

    assert.equal(result.ok, false);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.currentRoot, "DISASTER-RECOVERY-MANIFEST.json"), "utf8"));
    assert.ok(manifest.failures.some((failure) => /gateway-worker\/telemetry\/hm-owner-openai-1|hm-owner-openai-1/.test(failure)));
  } finally {
    fs.chmodSync(telemetryPath, 0o700);
  }
}

{
  const source = fs.readFileSync(scriptPath, "utf8");
  const mountSource = fs.readFileSync(mountScriptPath, "utf8");
  const runSource = fs.readFileSync(runScriptPath, "utf8");
  const cronSource = fs.readFileSync(cronScriptPath, "utf8");
  const mountWatchdogSource = fs.readFileSync(mountWatchdogScriptPath, "utf8");
  for (const shellScript of [mountScriptPath, runScriptPath, cronScriptPath, mountWatchdogScriptPath]) {
    const syntax = childProcess.spawnSync("/bin/bash", ["-n", shellScript], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  }
  assert.match(source, /data\/skill-profiles/);
  assert.match(source, /workspace Skill stores/);
  assert.match(source, /workspace Memory stores/);
  assert.match(source, /Memory Soul files/);
  assert.match(source, /operator-hermes-agent-custom-store/);
  assert.match(source, /"\.codegraph\/"/);
  assert.match(source, /"logs_\*\.sqlite\*"/);
  assert.match(source, /"\*\.sqlite-wal"/);
  assert.match(source, /HOMEAI_DISASTER_BACKUP_DESTINATION/);
  assert.match(source, /HOMEAI_DISASTER_BACKUP_RECEIPT_RETENTION_DAYS/);
  assert.match(source, /--receipt-retention-days/);
  assert.match(source, /pruneDisasterRecoveryReceipts/);
  assert.match(source, /PRODUCTION_DATA_EXCLUDES/);
  assert.match(source, /"audio-mounts\/"/);
  assert.match(source, /"chrome-pro-bridge\/"/);
  assert.match(source, /production-drift-audit/);
  assert.match(source, /thumbs\.db/);
  assert.match(source, /runtime.*not copied by this daily backup/s);
  assert.doesNotMatch(source, /create-hermes-mobile-disaster-backup\.ps1/);
  assert.match(mountSource, /192\.168\.10\.99/);
  assert.match(mountSource, /export HOMEAI_NAS_BACKUP_MOUNT/);
  assert.match(mountSource, /export HOMEAI_NAS_NFS_EXPORT/);
  assert.match(mountSource, /export HOMEAI_DISASTER_BACKUP_DESTINATION/);
  assert.match(mountSource, /\/volume1\/备份/);
  assert.match(mountSource, /HomeAI-Production-Backups\/mac-production/);
  assert.match(mountSource, /mount_nfs/);
  assert.match(mountSource, /EUID/);
  assert.match(mountSource, /\/sbin\/mount_nfs -o resvport,nolocks/);
  assert.match(mountSource, /NFS does not use the NAS/);
  assert.doesNotMatch(mountSource, /mount_smbfs|NAS_SMB|NAS_PASSWORD/i);
  assert.match(mountWatchdogSource, /homeai_nas_backup_mount_ok/);
  assert.match(mountWatchdogSource, /homeai_nas_backup_mount_repaired/);
  assert.match(mountWatchdogSource, /mount-macos-nas-backup-destination\.sh/);
  assert.doesNotMatch(mountWatchdogSource, /SUDO_PASSWORD|HOMEAI_MAC_SUDO_PASSWORD_FILE|expect|ssh -p/i);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_TRANSPORT:-auto/);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_SSH_TARGET/);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_SSH_DESTINATION/);
  assert.match(runSource, /SCRIPT_DIR="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)"/);
  assert.match(runSource, /APP_SCRIPT="\$\{HOMEAI_DISASTER_BACKUP_SCRIPT:-\$\{SCRIPT_DIR\}\/create-macos-disaster-backup\.js\}"/);
  assert.match(runSource, /local-staging-to-nfs/);
  assert.match(runSource, /local-staging-to-ssh/);
  assert.match(runSource, /HomeAI-Disaster-Staging\/mac-production/);
  assert.doesNotMatch(`${mountSource}\n${runSource}\n${cronSource}\n${mountWatchdogSource}`, /\/Users\/example\/path/);
  assert.match(runSource, /sudo reads Mac production/);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_USE_SUDO/);
  assert.match(runSource, /HOMEAI_NAS_BACKUP_OP_TIMEOUT_SECONDS/);
  assert.match(runSource, /HOMEAI_BACKUP_SSH_OP_TIMEOUT_SECONDS/);
  assert.match(runSource, /nfs_destination_write_unavailable/);
  assert.match(runSource, /nfs_prepare_current_dir/);
  assert.match(runSource, /nfs_destination_current_unwritable/);
  assert.match(runSource, /\.homeai-nfs-inaccessible-current-/);
  assert.match(runSource, /\.homeai-ssh-inaccessible-current-/);
  assert.match(runSource, /nfs_destination_rsync_failed/);
  assert.match(runSource, /ssh_remote_prepare/);
  assert.match(runSource, /ssh_destination_write_unavailable/);
  assert.match(runSource, /ssh_destination_rsync_failed/);
  assert.match(runSource, /--rsync-path=\/usr\/bin\/rsync/);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_RSYNC_ATTEMPTS:-3/);
  assert.match(runSource, /HOMEAI_DISASTER_BACKUP_KEEP_STAGING:-0/);
  assert.match(runSource, /cleanup_staging_current/);
  assert.match(runSource, /sudo_cmd rm -rf "\$\{STAGING%\/\}\/current"/);
  assert.match(runSource, /rsync_with_retries "\$SSH_RSYNC_TIMEOUT_SECONDS" \/usr\/bin\/rsync -rlpt --delete --links --safe-links[\s\S]*-e "ssh -o BatchMode=yes -o ConnectTimeout=15 \$SSH_OPTIONS"/);
  assert.match(runSource, /rsync_with_retries "\$NFS_RSYNC_TIMEOUT_SECONDS" \/usr\/bin\/rsync -rlpt --delete --links --safe-links/);
  assert.doesNotMatch(runSource, /rsync -rlpt --delete --links --safe-links --inplace/);
  assert.doesNotMatch(runSource, /expect|NAS_SSH|ssh -p|mount_smbfs|NAS_SMB/i);
  assert.match(cronSource, /HOMEAI_DISASTER_BACKUP_USE_SUDO=0/);
  assert.match(cronSource, /HOMEAI_DISASTER_BACKUP_KEEP_STAGING=1/);
  assert.match(cronSource, /rm -rf "\$\{STAGING%\/\}\/current"/);
  assert.match(cronSource, /HOMEAI_DISASTER_BACKUP_TRANSPORT:-auto/);
  assert.match(cronSource, /\[\[ "\$TRANSPORT" == "nfs" \]\] && ! mount/);
  assert.match(cronSource, /manifest="\$\{STAGING%\/\}\/current\/DISASTER-RECOVERY-MANIFEST\.json"/);
  assert.match(cronSource, /Home AI NAS backup success/);
  assert.match(cronSource, /NFS mount is not available/);
  assert.match(cronSource, /run-macos-disaster-backup-to-nas\.sh/);
  assert.doesNotMatch(cronSource, /(^|\s)sudo(\s|-)|SUDO_PASSWORD|HOMEAI_MAC_SUDO_PASSWORD_FILE|expect|ssh -p/i);
}

{
  const fixture = makeFixture();
  const result = backup.runBackup({
    root: fixture.root,
    destination: fixture.dest,
    operatorHome: fixture.operatorHome,
    receiptDir: path.join(fixture.root, "data", "backups", "disaster-recovery-receipts"),
    label: "unit",
    checkOnly: false,
    json: true,
    includeOperatorState: true,
  });

  assert.equal(result.ok, true);
  const backedUpDb = path.join(fixture.dest, "current", "production", "sqlite-snapshots", "data", "hermes-mobile.sqlite3");
  assert.equal(fs.existsSync(backedUpDb), true);
  const db = new DatabaseSync(backedUpDb, { open: true, readOnly: true });
  try {
    const row = db.prepare("SELECT term, source FROM voice_input_phrasebook WHERE id = ?").get("voice_phrase_backup_1");
    assert.equal(row.term, "Home AI");
    assert.equal(row.source, "sent_text");
  } finally {
    db.close();
  }
}
