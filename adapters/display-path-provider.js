"use strict";

const path = require("node:path");

function stringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function createDisplayPathProvider(options = {}) {
  const ownerDriveRootNames = () => stringList(
    typeof options.ownerDriveRootNames === "function" ? options.ownerDriveRootNames() : (options.ownerDriveRootNames || "ChatGPT-Drive"),
  );
  const ownerRootFallbackLabel = () => String(
    typeof options.ownerRootFallbackLabel === "function" ? options.ownerRootFallbackLabel() : (options.ownerRootFallbackLabel || "Hermes Owner"),
  ).trim();
  const normalizeLocalPath = (value) => (
    typeof options.normalizeLocalPath === "function" ? options.normalizeLocalPath(value) : String(value || "")
  );

  function ownerDriveRootIndex(parts) {
    const roots = new Set(ownerDriveRootNames()
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean));
    return (parts || []).findIndex((part) => roots.has(String(part || "").trim().toLowerCase()));
  }

  function sharedProjectOwnerLabel(project) {
    return String(project?.sharedByLabel || project?.createdByLabel || project?.sharedBy || project?.createdBy || "").trim();
  }

  function sharedProjectRootOwnerLabel(project) {
    const root = String(project?.root || "").replaceAll("\\", "/");
    const parts = root.split("/").filter(Boolean);
    const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
    if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
    const driveIndex = ownerDriveRootIndex(parts);
    if (driveIndex >= 0) return ownerRootFallbackLabel();
    return "";
  }

  function sharedProjectDisplayLabel(project) {
    const label = project?.label || project?.id || "Project";
    return label;
  }

  function directoryRouteDisplayLabel(project, child = null) {
    const projectLabel = sharedProjectDisplayLabel(project);
    if (!child) return projectLabel;
    return `${projectLabel} / ${child.label || child.id || "Directory"}`;
  }

  function logicalUserPathFallback(rawPath, fallbackLabel = "") {
    const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    const lowerParts = parts.map((part) => part.toLowerCase());
    const driveIndex = ownerDriveRootIndex(parts);
    if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
    const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
    if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
    const documentsIndex = lowerParts.findIndex((part) => part === "documents");
    const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
    if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
    if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
    const usersIndex = lowerParts.findIndex((part) => part === "users");
    if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["\u7528\u6237\u76ee\u5f55", ...parts.slice(usersIndex + 2)].join(" / ");
    return fallbackLabel || path.basename(normalizeLocalPath(rawPath) || normalized) || "";
  }

  return {
    directoryRouteDisplayLabel,
    logicalUserPathFallback,
    ownerDriveRootIndex,
    sharedProjectDisplayLabel,
    sharedProjectOwnerLabel,
    sharedProjectRootOwnerLabel,
  };
}

module.exports = {
  createDisplayPathProvider,
};
