"use strict";

const DEFAULT_MAX_PARALLEL = 3;
const DEFAULT_MAX_CARDS = 8;

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function arrayOfStrings(value, limit = 12) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, limit);
}

function createKanbanPlanService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const defaultMaxParallel = Math.max(1, Number(options.defaultMaxParallel || DEFAULT_MAX_PARALLEL) || DEFAULT_MAX_PARALLEL);
  const maxParallelLimit = Math.max(defaultMaxParallel, Number(options.maxParallelLimit || options.maxParallel || 8) || 8);
  const maxCards = Math.max(1, Number(options.maxCards || DEFAULT_MAX_CARDS) || DEFAULT_MAX_CARDS);
  const validReasoningEfforts = options.validReasoningEfforts instanceof Set
    ? options.validReasoningEfforts
    : new Set(Array.isArray(options.validReasoningEfforts) ? options.validReasoningEfforts : []);
  const createPlanId = typeof options.createPlanId === "function"
    ? options.createPlanId
    : () => `kanban-plan-${Date.now()}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0").slice(0, 6)}`;
  const createSingleCaseId = typeof options.createSingleCaseId === "function"
    ? options.createSingleCaseId
    : () => `kanban-single-${Date.now()}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0").slice(0, 6)}`;

  function fallbackCards(sourceText) {
    const topic = compactText(sourceText, 80) || "Kanban work";
    return [
      {
        title: `Scope and acceptance: ${topic}`,
        description: "Clarify the objective, inputs, constraints, deliverables, and acceptance criteria before execution.",
        deliverables: ["Short execution brief", "Acceptance checklist"],
        acceptance: ["Scope is specific enough for worker cards", "Unknown inputs or risks are listed"],
        dependsOn: [],
      },
      {
        title: `Execute primary work: ${topic}`,
        description: "Perform the main implementation, research, cleanup, or production work described by the request.",
        deliverables: ["Primary output files or changes", "Progress notes"],
        acceptance: ["Main requested outcome is completed or blocked with evidence"],
        dependsOn: [1],
      },
      {
        title: `Verify and risk review: ${topic}`,
        description: "Validate the output, record evidence, and identify risks, missing inputs, and follow-up work.",
        deliverables: ["Verification notes", "Risk list"],
        acceptance: ["Validation evidence is attached to the card receipt"],
        dependsOn: [2],
      },
      {
        title: `Integrate final receipt: ${topic}`,
        description: "Read upstream card receipts and produce the final user-facing summary with deliverables and next steps.",
        deliverables: ["Final receipt", "Consolidated deliverable links"],
        acceptance: ["Final response references upstream outputs and unresolved risks"],
        dependsOn: [1, 2, 3],
      },
    ];
  }

  function dependencyRefs(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    return String(value).split(/[,;\n]+/g);
  }

  function normalizeMaxParallel(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultMaxParallel;
    return Math.max(1, Math.min(maxParallelLimit, Math.floor(parsed)));
  }

  function normalizeReasoningEffort(value) {
    const effort = String(value || "").trim().toLowerCase();
    return validReasoningEfforts.has(effort) ? effort : "";
  }

  function normalizePlan(raw, sourceText, workspaceId, optionsForPlan = {}) {
    const draft = raw && typeof raw === "object" ? raw : {};
    const maxParallel = normalizeMaxParallel(optionsForPlan.maxParallel ?? draft.maxParallel ?? draft.max_parallel);
    const reasoningEffort = normalizeReasoningEffort(
      optionsForPlan.reasoningEffort
      || optionsForPlan.reasoning_effort
      || draft.reasoningEffort
      || draft.reasoning_effort,
    );
    if (draft.needs_clarification || draft.needsClarification) {
      throw new Error(compactText(draft.clarification || draft.question || "Kanban plan needs clarification", 240));
    }
    const rawCards = Array.isArray(draft.cards) && draft.cards.length ? draft.cards : fallbackCards(sourceText);
    const cards = rawCards.slice(0, maxCards).map((item, index) => {
      const card = item && typeof item === "object" ? item : { title: String(item || "") };
      const title = compactText(card.title || card.content || card.name || card.task || `Kanban card ${index + 1}`, 160);
      return {
        clientId: String(card.clientId || card.id || `card-${index + 1}`).trim() || `card-${index + 1}`,
        title,
        description: compactText(card.description || card.details || card.goal || "", 1200),
        deliverables: arrayOfStrings(card.deliverables || card.outputs || card.artifacts, 6),
        acceptance: arrayOfStrings(card.acceptance || card.acceptanceCriteria || card.validation || card.verify, 6),
        assignee: String(card.assignee || "").trim(),
        dependencyRefs: dependencyRefs(card.dependsOn || card.depends_on || card.dependencies || card.blockedBy || card.after),
      };
    }).filter((card) => card.title);

    if (!cards.length) throw new Error("Hermes model did not produce Kanban plan cards");

    const byId = new Map(cards.map((card) => [card.clientId.toLowerCase(), card]));
    const byTitle = new Map(cards.map((card) => [card.title.toLowerCase(), card]));
    for (const [index, card] of cards.entries()) {
      const deps = [];
      for (const ref of card.dependencyRefs) {
        const text = String(ref || "").trim();
        if (!text) continue;
        const numeric = text.match(/\d+/)?.[0];
        const byNumber = numeric ? cards[Number(numeric) - 1] : null;
        const resolved = byId.get(text.toLowerCase())
          || byTitle.get(text.toLowerCase())
          || byNumber
          || cards.find((candidate) => candidate.title.toLowerCase().includes(text.toLowerCase()));
        if (resolved && resolved !== card && cards.indexOf(resolved) < index) deps.push(resolved.clientId);
      }
      card.dependsOn = dedupe(deps);
      delete card.dependencyRefs;
    }

    const initialRunnableIds = new Set();
    for (const card of cards) {
      if (card.dependsOn.length) continue;
      if (initialRunnableIds.size >= maxParallel) continue;
      initialRunnableIds.add(card.clientId);
    }
    for (const card of cards) card.initialRunnable = initialRunnableIds.has(card.clientId);

    return {
      id: String(draft.id || createPlanId()),
      mode: "multi-agent",
      workspaceId: String(workspaceId || "owner"),
      sourceText: compactText(draft.sourceText || sourceText, 4000),
      summary: compactText(draft.summary || draft.goal || sourceText, 500),
      maxParallel,
      reasoningEffort,
      cards,
    };
  }

  function dependencyLabelsForServer(plan, card) {
    const cards = Array.isArray(plan?.cards) ? plan.cards : [];
    const byId = new Map(cards.map((item) => [String(item.clientId || ""), item]));
    return (Array.isArray(card?.dependsOn) ? card.dependsOn : [])
      .map((id) => byId.get(String(id || ""))?.title || String(id || "").trim())
      .filter(Boolean);
  }

  function cardDescription(plan, card) {
    const dependencyLabels = dependencyLabelsForServer(plan, card);
    const maxParallel = normalizeMaxParallel(plan?.maxParallel);
    const reasoningEffort = normalizeReasoningEffort(plan?.reasoningEffort || plan?.reasoning_effort);
    return [
      `Multi-Agent plan: ${plan.summary || plan.sourceText || ""}`,
      `Source request:\n${plan.sourceText || ""}`,
      reasoningEffort ? `Requested reasoning effort: ${reasoningEffort}` : "",
      `Card goal:\n${card.description || card.title || ""}`,
      card.deliverables?.length ? `Expected deliverables:\n- ${card.deliverables.join("\n- ")}` : "",
      card.acceptance?.length ? `Acceptance criteria:\n- ${card.acceptance.join("\n- ")}` : "",
      dependencyLabels.length ? `Dependencies:\n- ${dependencyLabels.join("\n- ")}` : "",
      `Concurrency rule: Hermes Mobile may run at most ${maxParallel} first-wave cards from this plan in parallel. Cards outside that wave are blocked until dependencies complete or the Owner unblocks them.`,
    ].filter(Boolean).join("\n\n");
  }

  function singleCardCasePayload(content, description = "", sourceText = "") {
    const title = compactText(content || sourceText || "Kanban card", 180);
    const source = compactText(sourceText || description || content || "", 2000);
    return {
      caseId: createSingleCaseId(),
      caseMode: "single-card",
      caseSourceText: source,
      caseSummary: title,
      caseCardId: "single",
      caseCardIndex: 1,
      caseCardCount: 1,
      caseCardGoal: compactText(description || content || "", 1200),
    };
  }

  return Object.freeze({
    fallbackCards,
    dependencyRefs,
    normalizeMaxParallel,
    normalizeReasoningEffort,
    normalizePlan,
    cardDescription,
    dependencyLabelsForServer,
    singleCardCasePayload,
  });
}

module.exports = {
  createKanbanPlanService,
  dedupe,
  arrayOfStrings,
};
