const TASK_ARTIFACT_HELPER_MODEL_VERSION = "20260704-vite-task-artifact-helper-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function artifactDisplayName(artifact = {}) {
  return cleanString(
    artifact.displayName || artifact.title || artifact.label || artifact.name || artifact.id || "document",
    240,
  );
}

function artifactKind(artifact = {}) {
  const name = cleanString(artifact.name || artifact.id || "", 300).toLowerCase();
  const mime = cleanString(artifact.mime || "", 300).toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("html") || name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return "word";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("vnd.ms-excel") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx")
  ) {
    return "spreadsheet";
  }
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    name.endsWith(".ppt") ||
    name.endsWith(".pptx")
  ) {
    return "presentation";
  }
  if (mime.includes("markdown") || name.endsWith(".md")) return "markdown";
  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return "text";
  }
  return "file";
}

function artifactStem(artifact = {}) {
  return artifactDisplayName(artifact).replace(/\.[^.]+$/, "").toLowerCase();
}

function artifactDisplayRank(artifact = {}) {
  const kind = artifactKind(artifact);
  if (kind === "markdown") return 0;
  if (kind === "text") return 1;
  if (kind === "pdf" || kind === "word" || kind === "spreadsheet" || kind === "presentation") return 2;
  return 3;
}

function isMarkdownArtifact(artifact = {}) {
  return artifactKind(artifact) === "markdown";
}

function isTaskListPrimaryDocument(artifact = {}) {
  const kind = artifactKind(artifact);
  if (kind === "pdf" || kind === "word" || kind === "spreadsheet" || kind === "presentation") return true;
  const name = cleanString(artifact.name || artifact.id || "", 300).toLowerCase();
  return name.endsWith(".md") || name.endsWith(".txt");
}

function displayArtifacts(artifacts = []) {
  const items = Array.isArray(artifacts) ? artifacts.filter(Boolean) : [];
  const markdownStems = new Set(items.filter(isMarkdownArtifact).map(artifactStem).filter(Boolean));
  return Object.freeze(items
    .filter((artifact) => {
      const kind = artifactKind(artifact);
      if ((kind === "pdf" || kind === "word" || kind === "spreadsheet") && markdownStems.has(artifactStem(artifact))) return false;
      return true;
    })
    .sort((a, b) => (
      artifactDisplayRank(a) - artifactDisplayRank(b)
      || artifactDisplayName(a).localeCompare(artifactDisplayName(b))
    )));
}

function latestTaskListDocumentPlan(artifacts = []) {
  const items = Array.isArray(artifacts) ? artifacts.filter(Boolean) : [];
  const markdownDocuments = items.filter(isMarkdownArtifact);
  const candidates = markdownDocuments.length ? markdownDocuments : items.filter(isTaskListPrimaryDocument);
  return candidates[candidates.length - 1] || null;
}

export {
  TASK_ARTIFACT_HELPER_MODEL_VERSION,
  artifactDisplayName,
  artifactDisplayRank,
  artifactKind,
  artifactStem,
  cleanString,
  displayArtifacts,
  isMarkdownArtifact,
  isTaskListPrimaryDocument,
  latestTaskListDocumentPlan,
};
