"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function defaultCompactText(value, maxChars = 1000) {
  const text = cleanString(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

const PROGRAMMING_PATTERN = /programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|算法|编程|程式|程序|代码|代碼|开发|開發/i;

function isProgrammingAssessmentConfig(config = {}, card = {}) {
  const text = [
    config.template,
    config.kind,
    config.subject,
    config.subjectId,
    config.subject_id,
    config.courseLevel,
    card.kanbanCaseTemplate,
    card.kanban_case_template,
    card.kanbanCaseSummary,
    card.kanban_case_summary,
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.kanbanCaseSourceText,
    card.kanban_case_source_text,
    card.content,
    card.title,
  ].filter(Boolean).join("\n");
  return PROGRAMMING_PATTERN.test(text);
}

function normalizeProgrammingRequirement(input = {}, options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const source = input && typeof input === "object" ? input : {};
  const requirement = compactText(
    source.programmingRequirement
    || source.programming_requirement
    || source.requirement
    || source.prompt
    || source.goal
    || source.focus
    || source.teacherFocus
    || source.teacher_focus
    || source.teachingFocus
    || source.teaching_focus
    || "",
    4000,
  );
  const context = compactText(
    source.context
    || source.background
    || source.classroomPerformance
    || source.classroom_performance
    || source.teacherNotes
    || source.teacher_notes
    || source.notes
    || source.comment
    || "",
    3000,
  );
  const materials = compactText(
    source.materials
    || source.referenceMaterials
    || source.reference_materials
    || source.sourceText
    || source.source_text
    || "",
    5000,
  );
  return {
    requirement,
    context,
    materials,
  };
}

function programmingRequirementHasContent(requirement = {}) {
  return Boolean(cleanString(requirement.requirement) || cleanString(requirement.context) || cleanString(requirement.materials));
}

function programmingRequirementMarkdown(requirement = {}) {
  const lines = [];
  if (cleanString(requirement.requirement)) {
    lines.push("### Current Programming Requirement", "", requirement.requirement, "");
  }
  if (cleanString(requirement.context)) {
    lines.push("### Context / Teacher Notes", "", requirement.context, "");
  }
  if (cleanString(requirement.materials)) {
    lines.push("### Reference Materials", "", requirement.materials, "");
  }
  return lines.join("\n").trim();
}

function buildProgrammingAssessmentPromptLines(requirement = {}) {
  const requirementBlock = programmingRequirementMarkdown(requirement);
  return [
    "Programming assessment template:",
    "- Use the per-card programming requirement as the primary source for question design.",
    "- The requirement may come from teacher focus, classroom performance, project goals, code review needs, or a direct practice request.",
    "- Generate targeted programming exam questions, not generic subject trivia.",
    "- Prefer code-reading, output prediction, debugging, API/syntax choice, algorithm reasoning, and small design-decision questions that can be answered as multiple choice.",
    "- Calibrate difficulty to the stated learner level and the current requirement. If unclear, use a medium beginner-to-intermediate mix.",
    "- Each explanation must identify the programming concept, why the correct option is correct, and what misconception the item is testing.",
    requirementBlock ? `Per-card requirement and materials:\n${requirementBlock}` : "",
  ].filter(Boolean);
}

function answerLabel(question = {}, index) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= choices.length) return "not answered";
  return choices[value];
}

function buildProgrammingAssessmentLogMarkdown(input = {}) {
  const cardTitle = cleanString(input.cardTitle || input.exam?.title || "Programming assessment log");
  const cardId = cleanString(input.cardId || "");
  const exam = input.exam || {};
  const attempt = input.attempt || {};
  const requirement = normalizeProgrammingRequirement(input.requirement || {});
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const questionById = new Map(questions.map((question, index) => [cleanString(question.id || `q${index + 1}`), question]));
  const results = Array.isArray(attempt.results) ? attempt.results : [];
  const lines = [
    `# ${cardTitle}`,
    "",
    `- Card: ${cardId}`,
    `- Subject: ${cleanString(exam.subject || "")}`,
    `- Score: ${Number(attempt.score || 0)}/100`,
    `- Correct: ${Number(attempt.correctCount || 0)}/${Number(attempt.total || 0)}`,
    `- Passing score: ${Number(exam.passingScore || attempt.passingScore || 0)}/100`,
    `- Passed: ${attempt.passed ? "yes" : "no"}`,
    `- Submitted: ${cleanString(attempt.submittedAt || "")}`,
    "",
    "## Cleaned Programming Requirement",
    "",
    programmingRequirementMarkdown(requirement) || "No per-card requirement was recorded.",
    "",
    "## Result Summary",
    "",
    attempt.passed
      ? "This programming assessment reached the passing score. The card can be treated as completed."
      : "This programming assessment did not reach the passing score. Retake is required before the card can complete.",
    "",
    "## Question Analysis",
    "",
  ];
  if (!results.length) {
    lines.push("No question-level result was recorded.");
  } else {
    for (const [index, result] of results.entries()) {
      const id = cleanString(result.id || `q${index + 1}`);
      const question = questionById.get(id) || questions[index] || {};
      lines.push(
        `### ${index + 1}. ${cleanString(question.skill || result.skill || "Programming concept")}`,
        "",
        cleanString(question.prompt || id),
        "",
        `- Student answer: ${answerLabel(question, result.answerIndex)}`,
        `- Correct answer: ${answerLabel(question, result.correctIndex)}`,
        `- Result: ${result.correct ? "correct" : "incorrect"}`,
        `- Explanation: ${cleanString(result.explanation || question.explanation || "Review this concept.")}`,
        "",
      );
    }
  }
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}

module.exports = {
  buildProgrammingAssessmentLogMarkdown,
  buildProgrammingAssessmentPromptLines,
  isProgrammingAssessmentConfig,
  normalizeProgrammingRequirement,
  programmingRequirementHasContent,
  programmingRequirementMarkdown,
};
