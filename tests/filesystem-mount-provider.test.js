"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFilesystemMountProvider } = require("../adapters/filesystem-mount-provider");

function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-filesystem-provider-"));
  const windowsHome = path.join(tempRoot, "home");
  const mirrorRoot = path.join(tempRoot, "synology");
  const shareFile = path.join(mirrorRoot, "Hermes-Test", "folder", "file.txt");
  fs.mkdirSync(path.dirname(shareFile), { recursive: true });
  fs.writeFileSync(shareFile, "ok");

  const provider = createFilesystemMountProvider({
    wslDistro: "Ubuntu-Test",
    windowsHome,
    repoRoot: tempRoot,
    dataDir: path.join(tempRoot, "data"),
    volume1WindowsRoot: mirrorRoot,
    disabledVolume1Shares: [],
    allowedArtifactRoots: [mirrorRoot],
  });

  assert.equal(provider.windowsPathToWsl("C:\\Users\\xuxin\\Documents\\file.txt"), "/mnt/c/Users/xuxin/Documents/file.txt");
  assert.equal(provider.volume1WindowsMirrorPath("/volume1/Hermes-Test/folder/file.txt"), shareFile);
  assert.equal(provider.normalizeLocalPath("/mnt/c/Users/xuxin/file.txt"), "C:\\Users\\xuxin\\file.txt");
  assert.equal(provider.normalizeLocalPath("/volume1/Hermes-Test/folder/file.txt"), shareFile);
  assert.equal(provider.isPathAllowed(shareFile), true);

  const disabled = createFilesystemMountProvider({
    wslDistro: "Ubuntu-Test",
    windowsHome,
    repoRoot: tempRoot,
    dataDir: path.join(tempRoot, "data"),
    volume1WindowsRoot: mirrorRoot,
    disabledVolume1Shares: ["Hermes-Test"],
  });
  assert.equal(disabled.volume1WindowsMirrorPath("/volume1/Hermes-Test/folder/file.txt"), "");
}

run();
console.log("filesystem-mount-provider contract passed.");
