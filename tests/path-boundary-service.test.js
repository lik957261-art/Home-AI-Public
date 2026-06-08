"use strict";

const assert = require("node:assert/strict");
const {
  comparablePath,
  normalizePathForBoundary,
  pathDirectChildOfRoot,
  pathInsideAnyRoot,
  pathRelativePartsUnderRoot,
} = require("../adapters/path-boundary-service");

assert.equal(comparablePath("C:\\Users\\Owner\\File.md"), "c:/users/owner/file.md");
assert.equal(comparablePath("C:/Users/Owner/../Shared/"), "c:/users/shared");
assert.equal(pathInsideAnyRoot("C:/a/b/c.txt", ["C:/a/b"]), true);
assert.equal(pathInsideAnyRoot("C:/a/bad/c.txt", ["C:/a/b"]), false);
assert.equal(pathInsideAnyRoot("C:/allowed/../secret/file.txt", ["C:/allowed"]), false);

assert.equal(comparablePath("\\\\server\\share\\Folder", { slashFirst: true }), "/server/share/folder");
assert.equal(comparablePath("\\\\server\\share\\Folder"), "//server/share/folder");
assert.equal(normalizePathForBoundary("/volume1/Hermes/../Data"), "/volume1/Data");

const runtimeOptions = {
  slashFirst: true,
  stripWslPrefix: true,
  mapWslMountDrive: true,
};
const wslMountedUserPath = ["//wsl.localhost/Ubuntu", "mnt/c", "Users", "Owner", "File.md"].join("/");
assert.equal(comparablePath(wslMountedUserPath, runtimeOptions), "c:/users/owner/file.md");
assert.equal(comparablePath("/mnt/d/Hermes/Work", runtimeOptions), "d:/hermes/work");
assert.deepEqual(pathRelativePartsUnderRoot("/mnt/d/Hermes/Work/a/b.txt", "D:/Hermes/Work", runtimeOptions), ["a", "b.txt"]);
assert.equal(pathDirectChildOfRoot("/mnt/d/Hermes/Work/a", "D:/Hermes/Work", runtimeOptions), true);
assert.equal(pathDirectChildOfRoot("/mnt/d/Hermes/Work/a/b", "D:/Hermes/Work", runtimeOptions), false);

console.log("path boundary service tests passed");
