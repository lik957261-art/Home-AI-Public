"use strict";

const {
  templateSkillInstruction,
} = require("./study-template-skill-service");

const PROGRAMMING_TEMPLATE_SKILL_ID = "programming-assessment";
const PROGRAMMING_PATTERN = /programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|算法|编程|程式|程序|代码|代碼|开发|開發|绠楁硶|缂栫▼|绋嬪紡|绋嬪簭|浠ｇ爜|浠ｇ⒓|寮€鍙憒闁嬬櫦/i;

function cleanString(value) {
  return String(value ?? "").trim();
}

function defaultCompactText(value, maxChars = 1000) {
  const text = cleanString(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

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
    lines.push("### 本次编程要求", "", requirement.requirement, "");
  }
  if (cleanString(requirement.context)) {
    lines.push("### 课堂/老师反馈", "", requirement.context, "");
  }
  if (cleanString(requirement.materials)) {
    lines.push("### 参考材料", "", requirement.materials, "");
  }
  return lines.join("\n").trim();
}

function buildProgrammingAssessmentPromptLines(requirement = {}, options = {}) {
  const requirementBlock = programmingRequirementMarkdown(requirement);
  const loadSkill = typeof options.templateSkillInstruction === "function"
    ? options.templateSkillInstruction
    : templateSkillInstruction;
  const skillInstruction = cleanString(loadSkill(PROGRAMMING_TEMPLATE_SKILL_ID, {
    compactText: options.compactText,
    maxChars: options.maxSkillChars || 6000,
    repoRoot: options.repoRoot,
  }));
  return [
    "Programming assessment template:",
    skillInstruction ? `Fixed template Skill rules:\n${skillInstruction}` : "",
    "- Use the per-card programming requirement as the primary source for question design.",
    "- The requirement may come from teacher focus, classroom performance, project goals, code review needs, or a direct practice request.",
    "- Generate targeted programming exam questions, not generic subject trivia.",
    "- Prefer code-reading, output prediction, debugging, API/syntax choice, algorithm reasoning, and small design-decision questions that can be answered as multiple choice.",
    "- Calibrate difficulty to the stated learner level and the current requirement. If unclear, use a medium beginner-to-intermediate mix.",
    "- Each explanation must identify the programming concept, why the correct option is correct, and what misconception the item is testing.",
    requirementBlock ? `Per-card requirement and materials:\n${requirementBlock}` : "",
  ].filter(Boolean);
}

function choiceLetter(index) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= 26) return "";
  return String.fromCharCode(65 + value);
}

function answerLabel(question = {}, index) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= choices.length) return "未作答";
  const letter = choiceLetter(value);
  return `${letter ? `${letter}. ` : ""}${choices[value]}`;
}

function programmingSkillName(value) {
  return cleanString(value) || "未标注技能点";
}

function resultRows(exam = {}, attempt = {}) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const questionById = new Map(questions.map((question, index) => [cleanString(question.id || `q${index + 1}`), question]));
  const results = Array.isArray(attempt.results) ? attempt.results : [];
  return results.map((result, index) => {
    const id = cleanString(result.id || `q${index + 1}`);
    const question = questionById.get(id) || questions[index] || {};
    return {
      number: index + 1,
      id,
      result,
      question,
      skill: programmingSkillName(question.skill || result.skill),
      prompt: cleanString(question.prompt || id),
      explanation: cleanString(result.explanation || question.explanation || "请复盘这个知识点，并用自己的话说明为什么正确答案成立。"),
      correct: Boolean(result.correct),
    };
  });
}

function skillStats(rows = []) {
  const bySkill = new Map();
  for (const row of rows) {
    const skill = programmingSkillName(row.skill);
    const item = bySkill.get(skill) || { skill, total: 0, correct: 0, wrong: 0 };
    item.total += 1;
    if (row.correct) item.correct += 1;
    else item.wrong += 1;
    bySkill.set(skill, item);
  }
  return [...bySkill.values()].sort((left, right) => {
    if (right.wrong !== left.wrong) return right.wrong - left.wrong;
    const leftRate = left.correct / Math.max(1, left.total);
    const rightRate = right.correct / Math.max(1, right.total);
    if (leftRate !== rightRate) return leftRate - rightRate;
    return left.skill.localeCompare(right.skill);
  });
}

function accuracyPercent(item = {}) {
  return Math.round((Number(item.correct || 0) / Math.max(1, Number(item.total || 0))) * 100);
}

function wrongQuestionNumbers(rows = []) {
  const numbers = rows.filter((row) => !row.correct).map((row) => `第 ${row.number} 题`);
  return numbers.length ? numbers.join("、") : "无";
}

function weakPointSummary(stats = []) {
  const weak = stats.filter((item) => item.wrong > 0).map((item) => item.skill).slice(0, 5);
  return weak.length ? weak.join("、") : "本次未暴露明显薄弱点";
}

function buildProgrammingAssessmentLogMarkdown(input = {}) {
  const cardTitle = cleanString(input.cardTitle || input.exam?.title || "Programming assessment log");
  const cardId = cleanString(input.cardId || "");
  const exam = input.exam || {};
  const attempt = input.attempt || {};
  const requirement = normalizeProgrammingRequirement(input.requirement || {});
  const rows = resultRows(exam, attempt);
  const wrongRows = rows.filter((row) => !row.correct);
  const stats = skillStats(rows);
  const total = Number(attempt.total || rows.length || 0);
  const correctCount = Number(attempt.correctCount || rows.filter((row) => row.correct).length || 0);
  const score = Number(attempt.score || 0);
  const passingScore = Number(exam.passingScore || attempt.passingScore || 0);
  const lines = [
    `# ${cardTitle}`,
    "",
    "## 结论",
    "",
    `- 卡片：${cardId || "未记录"}`,
    `- 科目：${cleanString(exam.subject || "") || "编程"}`,
    `- 成绩：${score}/100`,
    `- 答对：${correctCount}/${total}`,
    `- 通过线：${passingScore}/100`,
    `- 是否通过：${attempt.passed ? "是" : "否"}`,
    `- 提交时间：${cleanString(attempt.submittedAt || "") || "未记录"}`,
    `- 错题：${wrongQuestionNumbers(rows)}`,
    `- 主要薄弱点：${weakPointSummary(stats)}`,
    "",
    wrongRows.length
      ? `本次共错 ${wrongRows.length} 题。建议先看错题清单，再按薄弱点复盘，最后回到逐题讲解确认每一道题的原因。`
      : "本次没有错题。建议保留逐题讲解作为复盘记录，并在下一张卡片继续提高题目难度或代码情境复杂度。",
    "",
    "## 本次输入要求清洗",
    "",
    programmingRequirementMarkdown(requirement) || "未记录本次卡片的具体编程要求、课堂反馈或参考材料。",
    "",
    "## 错题清单",
    "",
  ];
  if (!wrongRows.length) {
    lines.push("本次没有错题。");
  } else {
    for (const [index, row] of wrongRows.entries()) {
      lines.push(
        `### 错题 ${index + 1}：第 ${row.number} 题 - ${row.skill}`,
        "",
        row.prompt,
        "",
        `- 学生答案：${answerLabel(row.question, row.result.answerIndex)}`,
        `- 正确答案：${answerLabel(row.question, row.result.correctIndex)}`,
        `- 关键讲解：${row.explanation}`,
        `- 复盘重点：回到「${row.skill}」这个知识点，用一句话说明正确答案为什么成立，再做 1-2 道同类题。`,
        "",
      );
    }
  }

  lines.push("", "## 薄弱点总结", "");
  if (!stats.length) {
    lines.push("未记录可统计的技能点。");
  } else {
    for (const item of stats) {
      lines.push(`- ${item.skill}：${item.correct}/${item.total} 正确，正确率 ${accuracyPercent(item)}%。${item.wrong > 0 ? "这是需要优先复盘的薄弱点。" : "本次表现稳定，可在后续提高复杂度。"}`);
    }
  }

  lines.push("", "## 后续复习建议", "");
  if (wrongRows.length) {
    lines.push(
      `1. 先复盘 ${wrongQuestionNumbers(rows)}，每题写出“错因”和“正确思路”。`,
      `2. 优先补强：${weakPointSummary(stats)}。每个薄弱点至少做 2 道同类变式题。`,
      "3. 下一次生成题目前，把仍不确定的代码片段、课堂重点或项目需求写进卡片输入框，题目会更有针对性。",
    );
  } else {
    lines.push(
      "1. 保留本次逐题讲解，作为后续编程日志的一部分。",
      "2. 下一张卡片可以增加代码长度、边界条件或调试题比例。",
      "3. 如果有老师课堂反馈或项目代码，可以在下一次出题前提交，让题目更贴近当前学习内容。",
    );
  }

  lines.push("", "## 逐题讲解", "");
  if (!rows.length) {
    lines.push("未记录逐题结果。");
  } else {
    for (const row of rows) {
      lines.push(
        `### 第 ${row.number} 题：${row.skill}`,
        "",
        row.prompt,
        "",
        `- 结果：${row.correct ? "正确" : "错误"}`,
        `- 学生答案：${answerLabel(row.question, row.result.answerIndex)}`,
        `- 正确答案：${answerLabel(row.question, row.result.correctIndex)}`,
        `- 讲解：${row.explanation}`,
        "",
      );
    }
  }
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}

module.exports = {
  PROGRAMMING_TEMPLATE_SKILL_ID,
  buildProgrammingAssessmentLogMarkdown,
  buildProgrammingAssessmentPromptLines,
  isProgrammingAssessmentConfig,
  normalizeProgrammingRequirement,
  programmingRequirementHasContent,
  programmingRequirementMarkdown,
};
