"use strict";

const {
  normalizeGatewayWorkerReplica,
} = require("./gateway-profile-replica-model");

function cleanString(value) {
  return String(value ?? "").trim();
}

function workerReplicaMetadata(worker = {}, hints = {}) {
  const replica = normalizeGatewayWorkerReplica(worker, hints);
  return {
    replicaId: cleanString(worker.replicaId || worker.replica_id || replica.replicaId),
    profileAlias: cleanString(worker.profileAlias || worker.profile_alias || replica.profileAlias),
    profileTemplateKey: replica.profileTemplateKey,
    poolKey: replica.poolKey,
  };
}

function annotateGatewayWorkerReplicaMetadata(worker = {}, hints = {}) {
  if (!worker || typeof worker !== "object" || Array.isArray(worker)) return worker;
  return Object.assign({}, worker, workerReplicaMetadata(worker, hints));
}

function metadataChanged(before = {}, after = {}) {
  return cleanString(before.replicaId || before.replica_id) !== cleanString(after.replicaId)
    || cleanString(before.profileAlias || before.profile_alias) !== cleanString(after.profileAlias)
    || cleanString(before.profileTemplateKey || before.profile_template_key || before.templateKey || before.template_key) !== cleanString(after.profileTemplateKey)
    || cleanString(before.poolKey || before.pool_key) !== cleanString(after.poolKey);
}

function annotateGatewayManifestReplicaMetadata(manifest = {}, hints = {}) {
  const sourceWorkers = Array.isArray(manifest?.workers) ? manifest.workers : [];
  let updatedWorkerCount = 0;
  const workers = sourceWorkers.map((worker) => {
    const annotated = annotateGatewayWorkerReplicaMetadata(worker, hints);
    if (metadataChanged(worker, annotated)) updatedWorkerCount += 1;
    return annotated;
  });
  return {
    manifest: Object.assign({}, manifest, { workers }),
    workerCount: workers.length,
    updatedWorkerCount,
    changed: updatedWorkerCount > 0,
  };
}

module.exports = {
  annotateGatewayManifestReplicaMetadata,
  annotateGatewayWorkerReplicaMetadata,
  workerReplicaMetadata,
};
