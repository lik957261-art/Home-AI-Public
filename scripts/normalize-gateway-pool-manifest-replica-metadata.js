#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  annotateGatewayManifestReplicaMetadata,
} = require("../adapters/gateway-pool-manifest-replica-metadata-service");

function usage() {
  return [
    "Usage:",
    "  node scripts/normalize-gateway-pool-manifest-replica-metadata.js --manifest <path> [--write] [--backup <path>]",
    "",
    "The script prints only bounded summary metadata. It never prints manifest worker bodies or API keys.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { manifestPath: "", write: false, backupPath: "" };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      out.manifestPath = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--write") {
      out.write = true;
    } else if (arg === "--dry-run") {
      out.write = false;
    } else if (arg === "--backup") {
      out.backupPath = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.manifestPath) throw new Error("--manifest is required");
  const manifestPath = path.resolve(args.manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const result = annotateGatewayManifestReplicaMetadata(manifest);
  let wrote = false;
  if (args.write && result.changed) {
    if (args.backupPath) {
      const backupPath = path.resolve(args.backupPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(manifestPath, backupPath);
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
    wrote = true;
  }
  console.log(JSON.stringify({
    ok: true,
    manifestPath,
    workerCount: result.workerCount,
    updatedWorkerCount: result.updatedWorkerCount,
    changed: result.changed,
    wrote,
    backupPath: args.backupPath ? path.resolve(args.backupPath) : "",
  }, null, 2));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(err?.message || String(err));
    console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
