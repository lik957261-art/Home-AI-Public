const NAVIGATION_SEARCH_MODEL_VERSION = "20260704-navigation-search-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function normalizeSingleWindowModePlan(value) {
  return cleanString(value, 40).toLowerCase() === "task" ? "task" : "chat";
}

function chatSearchAvailablePlan(input = {}) {
  return Boolean((input.singleWindowChatView || input.taskDetailView) && input.hasCurrentThread);
}

function normalizeArtifactSearchText(artifact = {}) {
  return [
    artifact.name,
    artifact.path,
    artifact.mime,
  ].map((item) => cleanString(item, 600)).filter(Boolean).join(" ");
}

function chatSearchContentForMessagePlan(input = {}) {
  const message = input.message || input;
  const roleLabel = message.role === "user" ? "You" : "Home AI";
  const content = cleanString(input.displayText ?? input.text ?? message.content ?? "", 12000).toLowerCase();
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts.map(normalizeArtifactSearchText).filter(Boolean).join("\n").toLowerCase()
    : "";
  return [
    roleLabel,
    content,
    cleanString(message.error || "", 1200),
    artifacts,
  ].filter(Boolean).join("\n").toLowerCase();
}

function chatSearchMatchesPlan(input = {}) {
  if (!input.available) return Object.freeze({ matches: Object.freeze([]), index: 0, totalMatches: 0 });
  const query = cleanString(input.query, 400).toLowerCase();
  if (!query) return Object.freeze({ matches: Object.freeze([]), index: 0, totalMatches: 0 });
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const matches = messages
    .filter((message) => message?.id && chatSearchContentForMessagePlan(message).includes(query))
    .map((message) => cleanString(message.id, 240))
    .filter(Boolean);
  const requestedIndex = Number(input.index || 0) || 0;
  const index = matches.length && requestedIndex >= 0 && requestedIndex < matches.length ? requestedIndex : 0;
  const previousTotal = Number(input.previousTotalMatches || 0) || 0;
  return Object.freeze({
    matches: Object.freeze(matches),
    index,
    totalMatches: Math.max(previousTotal, matches.length),
  });
}

function chatSearchCommitActionPlan(input = {}) {
  const draft = cleanString(input.draft, 400);
  const currentQuery = cleanString(input.currentQuery, 400);
  const sameCommittedQuery = Boolean(
    draft
    && draft === currentQuery
    && Number(input.matchCount || 0) > 0
    && !input.draftChangedSinceSearch
  );
  return Object.freeze({
    draft,
    action: sameCommittedQuery ? "move_next" : "commit_query",
    query: draft,
    loading: Boolean(draft),
    nextIndex: 0,
  });
}

function chatSearchMoveIndexPlan(input = {}) {
  const total = Number(input.total || 0) || 0;
  if (!total) return Object.freeze({ ok: false, index: 0 });
  const current = Number(input.index || 0) || 0;
  const delta = Number(input.delta || 0) || 0;
  return Object.freeze({
    ok: true,
    index: (current + delta + total) % total,
  });
}

function chatSearchStatusPlan(input = {}) {
  const searchMode = Boolean(input.searchMode);
  const query = cleanString(input.query, 400);
  if (!searchMode || !query) {
    return Object.freeze({
      statusHidden: true,
      statusText: "",
      navVisible: false,
      navEnabled: false,
    });
  }
  const changed = Boolean(input.changed);
  const total = Number(input.matchCount || 0) || 0;
  let statusText = "0/0";
  let statusHidden = changed;
  if (input.loading) {
    statusText = "searching";
    statusHidden = false;
  } else if (total && !changed) {
    const fullTotal = Math.max(total, Number(input.totalMatches || 0) || 0);
    statusText = fullTotal > total ? `${Number(input.index || 0) + 1}/${total}+` : `${Number(input.index || 0) + 1}/${total}`;
  }
  return Object.freeze({
    statusHidden,
    statusText,
    navVisible: !changed && total > 1,
    navEnabled: !changed && total > 1,
  });
}

export {
  NAVIGATION_SEARCH_MODEL_VERSION,
  chatSearchAvailablePlan,
  chatSearchCommitActionPlan,
  chatSearchContentForMessagePlan,
  chatSearchMatchesPlan,
  chatSearchMoveIndexPlan,
  chatSearchStatusPlan,
  cleanString,
  normalizeSingleWindowModePlan,
};
