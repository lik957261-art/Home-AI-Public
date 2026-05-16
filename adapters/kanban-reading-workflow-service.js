"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function defaultCompactText(value, maxChars = 1000) {
  const text = String(value ?? "").trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function createKanbanReadingWorkflowService(deps = {}) {
  const artifactService = deps.artifactService;
  if (!artifactService) throw new Error("kanban reading workflow service requires artifactService");
  const compactText = typeof deps.compactText === "function" ? deps.compactText : defaultCompactText;
  const safeFileName = typeof deps.safeFileName === "function" ? deps.safeFileName : (value) => path.basename(String(value || "file")).replace(/[^A-Za-z0-9_.-]+/g, "_") || "file";
  const safeStorageSegment = typeof deps.safeStorageSegment === "function" ? deps.safeStorageSegment : (value) => String(value || "item").replace(/[^A-Za-z0-9_.-]+/g, "_") || "item";
  const mimeFor = typeof deps.mimeFor === "function" ? deps.mimeFor : () => "";
  const dataDir = path.resolve(deps.dataDir || process.env.HERMES_WEB_DATA_DIR || path.join(process.cwd(), "workspace"));
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const maxUploadBytes = Math.max(1, Number(deps.maxUploadBytes || 100 * 1024 * 1024));
  const maxCoverBytes = Math.max(1, Math.min(maxUploadBytes, Number(deps.maxCoverBytes || deps.kanbanReadingCoverMaxBytes || process.env.HERMES_MOBILE_READING_COVER_MAX_BYTES || process.env.HERMES_WEB_READING_COVER_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
  const maxSourceDocumentBytes = Math.max(1, Math.min(maxUploadBytes, Number(deps.maxSourceDocumentBytes || deps.kanbanSourceDocumentMaxBytes || process.env.HERMES_MOBILE_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || process.env.HERMES_WEB_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
  const maxFilePreviewChars = Math.max(1, Number(deps.maxFilePreviewChars || process.env.HERMES_WEB_MAX_FILE_PREVIEW_CHARS || "180000") || 180000);
  const analysisTimeoutMs = Number(deps.analysisTimeoutMs || 120000);
  const transcribeTimeoutMs = Number(deps.transcribeTimeoutMs || 240000);
  const transcribeScript = path.resolve(deps.transcribeScript || path.join(process.cwd(), "scripts", "transcribe-reading-audio.ps1"));
  const quizTargetingVersion = String(deps.quizTargetingVersion || "reading-quiz-v1");
  const logger = deps.logger || console;
  const learningCoinAwardService = deps.learningCoinAwardService || null;

  function requireFunction(name) {
    if (typeof deps[name] !== "function") throw new Error(`kanban reading workflow service requires ${name}`);
    return deps[name];
  }

  const runProcessText = requireFunction("runProcessText");
  const extractJsonObject = requireFunction("extractJsonObject");
  const kanbanCardProvider = deps.kanbanCardProvider || {};
  if (typeof kanbanCardProvider.listCards !== "function" || typeof kanbanCardProvider.mutateCard !== "function") {
    throw new Error("kanban reading workflow service requires kanbanCardProvider");
  }
  const visibleKanbanCaseCards = requireFunction("visibleKanbanCaseCards");
  const kanbanCardRevisionOf = requireFunction("kanbanCardRevisionOf");
  const kanbanCardEffectiveCaseIndex = requireFunction("kanbanCardEffectiveCaseIndex");
  const kanbanCardUsesReadingTemplate = requireFunction("kanbanCardUsesReadingTemplate");
  const hermesModelText = requireFunction("hermesModelText");
  const sanitizePolicy = requireFunction("sanitizePolicy");
  const findWorkspace = requireFunction("findWorkspace");
  const publicTodo = requireFunction("publicTodo");
  const kanbanWorkflowStateCompleted = requireFunction("kanbanWorkflowStateCompleted");
  const isKanbanStudyCaseMode = requireFunction("isKanbanStudyCaseMode");
  const extractDocxText = requireFunction("extractDocxText");
  const textFilePreview = requireFunction("textFilePreview");
  const maybeReconcileKanbanDependencyBlocks = requireFunction("maybeReconcileKanbanDependencyBlocks");

  function awardReadingQuizPassed(workspaceId, cardId, currentCard, result = {}) {
    if (!learningCoinAwardService || typeof learningCoinAwardService.safeAwardEvent !== "function") return null;
    return learningCoinAwardService.safeAwardEvent("reading_quiz_passed", {
      workspaceId,
      cardId,
      card: currentCard,
      score: result.score,
      correctCount: result.correctCount,
      total: result.total,
      passed: true,
    });
  }

  function isReadingAudioUpload(filename, mime) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    return /^audio\//i.test(String(mime || "")) || [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".opus", ".amr"].includes(ext);
  }

  function isReadingCoverImageUpload(filename, mime) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    const allowedExt = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif"];
    const normalizedMime = String(mime || "").toLowerCase();
    return allowedExt.includes(ext) && /^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(normalizedMime || mimeFor(filename));
  }

  function isStudyTextUpload(filename, mime) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    const type = String(mime || "").toLowerCase();
    return /^text\//i.test(type)
      || ["application/json", "application/csv"].includes(type)
      || [".txt", ".md", ".markdown", ".csv", ".json", ".docx"].includes(ext);
  }

  function readingArtifactDirectory(workspaceId, caseId, cardId) {
    return artifactService.readingArtifactDirectory(workspaceId, caseId, cardId);
  }

  function caseDeliverableDirectory(workspaceId, caseId, cardId) {
    if (typeof artifactService.caseDeliverableDirectory === "function") {
      return artifactService.caseDeliverableDirectory(workspaceId, caseId, cardId);
    }
    return readingArtifactDirectory(workspaceId, caseId, cardId);
  }

  function saveKanbanReadingCoverUpload(workspaceId, planId, rawCover = null) {
    if (!rawCover || typeof rawCover !== "object" || Array.isArray(rawCover)) return null;
    const data = String(rawCover.dataBase64 || rawCover.data_base64 || "");
    if (!data) return null;
    const filename = safeFileName(rawCover.filename || rawCover.name || "book-cover.jpg");
    const mime = String(rawCover.type || rawCover.mime || rawCover.mimeType || rawCover.mime_type || mimeFor(filename) || "").trim();
    if (!isReadingCoverImageUpload(filename, mime)) {
      const err = new Error("Study plan cover must be a PNG, JPEG, WebP, GIF, HEIC, or HEIF image");
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxCoverBytes) {
      const err = new Error("Invalid or too-large study plan cover image");
      err.status = 400;
      throw err;
    }
    const dir = readingArtifactDirectory(workspaceId, planId, "cover");
    const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    return { path: filePath, name: filename, mime, size: buffer.length };
  }

  function saveKanbanReadingAudioUpload(workspaceId, cardId, body = {}, currentCard = null) {
    const filename = safeFileName(body.filename || "reading-audio.m4a");
    const mime = String(body.type || body.mime || body.mimeType || body.mime_type || mimeFor(filename) || "").trim();
    if (!isReadingAudioUpload(filename, mime)) {
      const err = new Error("Reading submission must be an audio file");
      err.status = 400;
      throw err;
    }
    const data = String(body.dataBase64 || body.data_base64 || "");
    if (!data) {
      const err = new Error("Missing dataBase64");
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxUploadBytes) {
      const err = new Error("Invalid or too-large upload");
      err.status = 400;
      throw err;
    }
    const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
    const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    return { path: filePath, name: filename, mime, size: buffer.length };
  }

  function saveKanbanStudySubmissionUpload(workspaceId, cardId, body = {}, currentCard = null) {
    const inlineText = compactText(body.submissionText || body.submission_text || body.text || "", 60000);
    if (inlineText) {
      const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
      const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-study-submission.txt`);
      fs.writeFileSync(filePath, inlineText, "utf8");
      return {
        path: filePath,
        name: "study-submission.txt",
        mime: "text/plain; charset=utf-8",
        size: Buffer.byteLength(inlineText, "utf8"),
        kind: "text",
      };
    }
    const filename = safeFileName(body.filename || "study-submission");
    const mime = String(body.type || body.mime || body.mimeType || body.mime_type || mimeFor(filename) || "").trim();
    if (isReadingAudioUpload(filename, mime)) {
      return Object.assign(saveKanbanReadingAudioUpload(workspaceId, cardId, body, currentCard), { kind: "audio" });
    }
    if (!isStudyTextUpload(filename, mime)) {
      const err = new Error("Study submission must be an audio file, plain text/Markdown/CSV/JSON, or DOCX file");
      err.status = 400;
      throw err;
    }
    const data = String(body.dataBase64 || body.data_base64 || "");
    if (!data) {
      const err = new Error("Missing dataBase64");
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxUploadBytes) {
      const err = new Error("Invalid or too-large upload");
      err.status = 400;
      throw err;
    }
    const dir = readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
    const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    return { path: filePath, name: filename, mime, size: buffer.length, kind: path.extname(filename).toLowerCase() === ".docx" ? "docx" : "text" };
  }

  function isKanbanSourceDocumentUpload(filename, mime) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    return /^text\//i.test(type)
      || ["application/json", "application/csv", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(type)
      || [".txt", ".md", ".markdown", ".csv", ".json", ".docx"].includes(ext);
  }

  function saveKanbanSourceDocumentUpload(workspaceId, body = {}) {
    const filename = safeFileName(body.filename || body.name || "kanban-source.txt");
    const mime = String(body.type || body.mime || body.mimeType || body.mime_type || mimeFor(filename) || "").trim();
    if (!isKanbanSourceDocumentUpload(filename, mime)) {
      const err = new Error("Kanban source document must be DOCX, Markdown, plain text, CSV, or JSON");
      err.status = 400;
      throw err;
    }
    const data = String(body.dataBase64 || body.data_base64 || "");
    if (!data) {
      const err = new Error("Missing dataBase64");
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxSourceDocumentBytes) {
      const err = new Error("Invalid or too-large Kanban source document");
      err.status = 400;
      throw err;
    }
    const dir = path.join(dataDir, "uploads", "kanban-source", safeStorageSegment(workspaceId || "owner"));
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${filename}`);
    fs.writeFileSync(filePath, buffer);
    return {
      path: filePath,
      name: filename,
      mime,
      size: buffer.length,
      kind: path.extname(filename).toLowerCase() === ".docx" ? "docx" : "text",
    };
  }

  function extractKanbanSourceDocumentText(upload) {
    const ext = path.extname(upload?.path || upload?.name || "").toLowerCase();
    const preview = ext === ".docx" || upload?.kind === "docx"
      ? extractDocxText(upload.path)
      : textFilePreview(upload.path);
    const text = compactText(preview.text || "", maxFilePreviewChars);
    if (!text.trim()) throw new Error("Kanban source document extraction returned empty text");
    return {
      text,
      totalChars: preview.totalChars || text.length,
      truncated: Boolean(preview.truncated),
    };
  }

  async function transcribeKanbanReadingAudio(audioPath) {
    if (!fs.existsSync(transcribeScript)) {
      throw new Error(`Reading audio transcription script is not installed: ${transcribeScript}`);
    }
    const result = await runProcessText("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      transcribeScript,
      "-AudioPath",
      audioPath,
      "-TimeoutSeconds",
      String(Math.ceil(transcribeTimeoutMs / 1000)),
    ], {
      timeoutMs: transcribeTimeoutMs + 15000,
      maxOutputBytes: 4_000_000,
    });
    const parsed = extractJsonObject(result.stdout || "{}");
    if (!parsed?.ok) throw new Error(compactText(parsed?.error || result.stderr || "Reading audio transcription failed", 800));
    const text = compactText(parsed.text || "", 20000);
    if (!text) throw new Error("Reading audio transcription returned empty text");
    return Object.assign({}, parsed, { text });
  }

  async function extractKanbanStudySubmissionEvidence(upload) {
    if (upload.kind === "audio" || isReadingAudioUpload(upload.name, upload.mime)) {
      const transcription = await transcribeKanbanReadingAudio(upload.path);
      return Object.assign({}, transcription, { sourceKind: "audio", sourcePath: upload.path });
    }
    if (upload.kind === "docx" || path.extname(upload.path).toLowerCase() === ".docx") {
      const preview = extractDocxText(upload.path);
      const text = compactText(preview.text || "", 30000);
      if (!text) throw new Error("DOCX extraction returned empty text");
      return { text, language: "", sourceKind: "docx", sourcePath: upload.path };
    }
    const preview = textFilePreview(upload.path);
    const text = compactText(preview.text || "", 30000);
    if (!text) throw new Error("Text extraction returned empty text");
    return { text, language: "", sourceKind: "text", sourcePath: upload.path };
  }

  async function readingContextForCard(workspaceId, cardId) {
    const listed = await kanbanCardProvider.listCards({
      workspaceId,
      includeCompleted: true,
      scope: "mine",
      limit: 500,
    });
    const cards = Array.isArray(listed?.data) ? listed.data : [];
    const rawCurrent = cards.find((card) => String(card.id) === String(cardId)) || null;
    const caseId = String(rawCurrent?.kanbanCaseId || "").trim();
    const rawSiblings = caseId
      ? cards
        .filter((card) => String(card.kanbanCaseId || "") === caseId)
        .sort((a, b) => (Number(a.kanbanCaseCardIndex || 0) - Number(b.kanbanCaseCardIndex || 0)) || String(a.id).localeCompare(String(b.id)))
      : [];
    const siblings = visibleKanbanCaseCards(rawSiblings);
    const replacement = rawCurrent && !kanbanCardRevisionOf(rawCurrent)
      ? siblings.find((card) => kanbanCardRevisionOf(card) === String(rawCurrent.id))
      : null;
    const current = siblings.find((card) => String(card.id) === String(cardId)) || replacement || rawCurrent;
    const byId = new Map(rawSiblings.map((card) => [String(card.id || ""), card]));
    const currentIndex = kanbanCardEffectiveCaseIndex(current, byId) || Number(current?.kanbanCaseCardIndex || 0) || 0;
    const prior = siblings.filter((card) => kanbanCardEffectiveCaseIndex(card, byId) < currentIndex);
    return { current, siblings, rawSiblings, prior };
  }

  async function analyzeKanbanReadingSubmission(workspaceId, cardId, currentCard, priorCards, transcription, notes = "") {
    const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
    const previousContext = (priorCards || [])
      .filter((card) => String(card.kanbanResult || "").trim())
      .map((card) => [
        `Session ${card.kanbanCaseCardIndex || "?"}: ${card.content || card.id}`,
        compactText(card.kanbanResult, 1200),
      ].join("\n"))
      .slice(-8)
      .join("\n\n---\n\n");
    const prompt = [
      readingTemplate
        ? "You are evaluating a child's book-reading retelling submission for a Hermes Mobile study plan."
        : "You are evaluating a child's study-plan submission for Hermes Mobile.",
      "Return Markdown only, concise but specific. Do not include JSON or code fences.",
      readingTemplate
        ? "Use the current transcript as primary evidence. Use previous session feedback only as context for continuity."
        : "Use the current extracted submission text as primary evidence. Use previous session feedback only as context for continuity.",
      readingTemplate
        ? "Include a score out of 100. Break the score down by fluency, grammar, vocabulary, comprehension, organization, and continuity. Base the score on the transcript; do not claim acoustic pronunciation evidence unless it is supported by transcription notes."
        : "Include a score out of 100. Break the score down according to the subject/domain, accuracy, method, completeness, clarity, and continuity. Base the score only on the submitted evidence and parent notes.",
      "Make the score actionable: list the main deductions, quote or paraphrase transcript evidence for each weakness, and explain which skill each deduction affects.",
      "Include a dedicated quiz-target section with 3-5 concrete targets derived only from today's transcript and analysis. For each target include category, transcript evidence, why it affected the score, desired correction/practice pattern, and difficulty level.",
      "Do not invent weaknesses, grammar mistakes, vocabulary gaps, or story details that are not supported by the transcript, parent notes, current card, or previous-session context.",
      readingTemplate
        ? "Required analysis sections include: score out of 100, deductions, today's weakness and error patterns, quiz targets, comprehension, retelling quality, English grammar/expression, vocabulary/sentence patterns, comparison with previous sessions, next-session advice, and parent observation points."
        : "Required analysis sections include: score out of 100, deductions, today's weakness and error patterns, quiz targets, subject accuracy, method/process quality, expression/clarity, comparison with previous sessions, next-session advice, and parent observation points.",
      "Use Chinese Markdown headings exactly for the main sections; do not use English headings such as Expression/clarity.",
      readingTemplate
        ? "Include these Markdown sections: ## 本次评分（100分）, ## 本次理解, ## 复述质量, ## 英语表达与语法, ## 词汇与句型, ## 与前次相比, ## 下一次建议, ## 家长可观察点."
        : "Include these Markdown sections: ## 本次评分（100分）, ## 本次理解, ## 复述质量, ## 表达与逻辑, ## 与前次相比, ## 下一次建议, ## 家长可观察点.",
      readingTemplate
        ? "If this is the final session in the reading template, also include sections: ## 整本书总结 and ## 总分（100分）."
        : "",
      `${readingTemplate ? "Reading study plan" : "Study plan"}: ${currentCard?.kanbanCaseSummary || ""}`,
      `Current card: ${currentCard?.content || cardId}`,
      `Session: ${currentCard?.kanbanCaseCardIndex || ""}/${currentCard?.kanbanCaseCardCount || ""}`,
      currentCard?.kanbanCaseSourceText ? `Original requirement:\n${currentCard.kanbanCaseSourceText}` : "",
      previousContext ? `Previous completed session context:\n${previousContext}` : "Previous completed session context: none yet.",
      notes ? `Parent notes:\n${compactText(notes, 2000)}` : "",
      `${readingTemplate ? "Transcript" : "Submission evidence"}:\n${transcription.text}`,
    ].filter(Boolean).join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: deps.automationCreateModel,
      reasoning_effort: "medium",
      conversation: `hermes_web_reading_analysis_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      instructions: readingTemplate ? "Evaluate the reading retelling transcript. Return Markdown only." : "Evaluate the study submission. Return Markdown only.",
      access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
    }, analysisTimeoutMs);
    return repairReadingAnalysisMarkdown(compactText(output || "", 12000));
  }

  function repairReadingAnalysisMarkdown(markdown = "") {
    const replacements = [
      ["鏈璇勫垎锛?00鍒嗭級", "本次评分（100分）"],
      ["鏈鐞嗚В", "本次理解"],
      ["澶嶈堪璐ㄩ噺", "复述质量"],
      ["鑻辫琛ㄨ揪涓庤娉?", "英语表达与语法"],
      ["璇嶆眹涓庡彞鍨?", "词汇与句型"],
      ["涓庡墠娆＄浉姣?", "与前次相比"],
      ["涓嬩竴娆″缓璁?", "下一次建议"],
      ["瀹堕暱鍙瀵熺偣", "家长可观察点"],
      ["鏁存湰涔︽€荤粨", "整本书总结"],
      ["鎬诲垎锛?00鍒嗭級", "总分（100分）"],
      ["琛ㄨ揪涓庨€昏緫", "表达与逻辑"],
    ];
    let text = String(markdown || "");
    for (const [from, to] of replacements) {
      text = text.split(from).join(to);
    }
    return text;
  }

  function normalizeKanbanReadingQuiz(raw = {}) {
    const questions = (Array.isArray(raw.questions) ? raw.questions : [])
      .map((item, index) => {
        const choices = (Array.isArray(item?.choices) ? item.choices : [])
          .map((choice) => compactText(choice, 260))
          .filter(Boolean)
          .slice(0, 4);
        const answerIndex = Number(item?.answerIndex ?? item?.answer_index ?? item?.correctIndex ?? item?.correct_index);
        return {
          id: compactText(item?.id || `q${index + 1}`, 40),
          prompt: compactText(item?.prompt || item?.question || "", 600),
          choices,
          answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length ? answerIndex : -1,
          explanation: compactText(item?.explanation || "", 600),
          skill: compactText(item?.skill || item?.category || "", 80),
        };
      })
      .filter((item) => item.prompt && item.choices.length >= 2 && item.answerIndex >= 0)
      .slice(0, 10);
    if (questions.length !== 10) throw new Error(`Reading quiz generation returned ${questions.length} valid questions; expected 10`);
    return {
      title: compactText(raw.title || "Reading practice quiz", 160),
      passingScore: 100,
      questions,
    };
  }

  function publicKanbanReadingQuiz(quiz = {}) {
    return artifactService.publicReadingQuiz(quiz);
  }

  async function generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, analysis, notes = "") {
    const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
    const prompt = [
      readingTemplate
        ? "Generate a practice quiz for a child's book-reading retelling session inside a Hermes Mobile study plan."
        : "Generate a practice quiz for a child's study-plan session.",
      "Return JSON only. No Markdown, no comments, no code fences.",
      "The quiz must contain exactly 10 single-answer multiple-choice questions.",
      readingTemplate
        ? "This is a targeted remediation quiz, not a generic book quiz. Every question must be traceable to today's score deductions, weakness/error patterns, quiz targets, transcript evidence, or parent notes."
        : "This is a targeted remediation quiz, not a generic subject quiz. Every question must be traceable to today's score deductions, weakness/error patterns, quiz targets, submitted evidence, or parent notes.",
      readingTemplate
        ? "At least 7 of 10 questions must directly train weaknesses or mistakes found in today's transcript/analysis. Up to 2 questions may check today's story comprehension or sequence, and up to 1 question may train next-retelling structure."
        : "At least 7 of 10 questions must directly train weaknesses or mistakes found in today's submission/analysis. Up to 2 questions may check core subject understanding, and up to 1 question may train better study/reporting structure.",
      readingTemplate
        ? "Do not invent unrelated trivia, random grammar drills, or vocabulary that is not connected to the transcript, the analysis, or the current reading card."
        : "Do not invent unrelated trivia or random drills that are not connected to the submitted evidence, the analysis, or the current study card.",
      "Calibrate difficulty from the analysis score: below 70 should focus on basic comprehension, sequence, and simple sentence correction; 70-84 should use applied grammar/vocabulary choices and sentence ordering; 85 or above should use nuanced grammar, vocabulary precision, retelling structure, and inference. If no score is clear, use medium difficulty but still target explicit weaknesses.",
      "The skill field must be a concise focus label, for example grammar: tense error from today's retelling, vocabulary: precise action verb, comprehension: missing event order, or organization: clearer retelling sequence.",
      "Each explanation must say why the correct answer addresses the specific weakness or error from today's analysis.",
      "Use this exact schema: {\"title\":\"...\",\"questions\":[{\"id\":\"q1\",\"skill\":\"specific weakness focus\",\"prompt\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\"}]}",
      "Each question must have 4 choices and one 0-based answerIndex.",
      "Do not reveal answer keys in prompt text or choices.",
      `Current card: ${currentCard?.content || cardId}`,
      `Session: ${currentCard?.kanbanCaseCardIndex || ""}/${currentCard?.kanbanCaseCardCount || ""}`,
      currentCard?.kanbanCaseSourceText ? `Original requirement:\n${currentCard.kanbanCaseSourceText}` : "",
      notes ? `Parent notes:\n${compactText(notes, 2000)}` : "",
      `Analysis:\n${compactText(analysis, 6000)}`,
      `${readingTemplate ? "Transcript" : "Submission evidence"}:\n${compactText(transcription.text, 8000)}`,
    ].filter(Boolean).join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: false,
      store: false,
      model: deps.automationCreateModel,
      reasoning_effort: "medium",
      conversation: `hermes_web_reading_quiz_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      instructions: "Generate exactly 10 multiple-choice quiz questions as JSON.",
      access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
    }, analysisTimeoutMs);
    return normalizeKanbanReadingQuiz(extractJsonObject(output || ""));
  }

  function readingQuizUrl(workspaceId, cardId) {
    return artifactService.readingQuizUrl(workspaceId, cardId);
  }

  function readKanbanReadingSubmissionState(workspaceId, cardId, currentCard = null) {
    return artifactService.readReadingSubmissionState(workspaceId, cardId, currentCard);
  }

  function writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, state) {
    return artifactService.writeReadingSubmissionState(workspaceId, cardId, currentCard, state);
  }

  function kanbanReadingCardTimestamp(card = {}) {
    const parsed = Date.parse(card.updatedAt || card.completedAt || card.createdAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function findKanbanReadingSubmissionState(workspaceId, cardId, context = {}) {
    const requestedId = String(cardId || "").trim();
    const current = context.current || { id: requestedId, content: requestedId };
    const siblings = Array.isArray(context.siblings) ? context.siblings : [];
    const candidates = [];
    if (current) candidates.push(current);
    const revisions = siblings
      .filter((card) => String(card?.kanbanRevisionOf || "").trim() === requestedId)
      .sort((left, right) => kanbanReadingCardTimestamp(right) - kanbanReadingCardTimestamp(left));
    candidates.push(...revisions);
    const seen = new Set();
    for (const candidate of candidates) {
      const candidateId = String(candidate?.id || requestedId).trim();
      if (!candidateId || seen.has(candidateId)) continue;
      seen.add(candidateId);
      const state = readKanbanReadingSubmissionState(workspaceId, candidateId, candidate);
      if (state?.quiz) return { state, card: candidate, cardId: candidateId };
    }
    return { state: null, card: current, cardId: requestedId };
  }

  function kanbanReadingStateCompleted(workspaceId, card = {}) {
    const cardId = String(card?.id || card?.cardId || "").trim();
    if (!cardId) return false;
    const state = readKanbanReadingSubmissionState(workspaceId, cardId, card);
    if (String(state?.status || "") === "completed" && !state?.completionError) return true;
    const status = String(card?.kanbanStatus || card?.kanban_status || card?.status || "").trim().toLowerCase();
    return kanbanWorkflowStateCompleted(state || {}, status === "done" || status === "completed");
  }

  function kanbanReadingPriorComplete(workspaceId, priorCards = []) {
    return (priorCards || [])
      .filter((card) => isKanbanStudyCaseMode(card?.kanbanCaseMode || card?.kanban_case_mode || "")
        && String(card?.kanbanCaseTemplate || card?.kanban_case_template || "").trim() !== "final-assessment")
      .every((card) => kanbanReadingStateCompleted(workspaceId, card));
  }

  function kanbanReadingArchived(card = {}) {
    const kanbanStatus = String(card?.kanbanStatus || card?.kanban_status || "").trim().toLowerCase();
    const status = String(card?.status || "").trim().toLowerCase();
    return kanbanStatus === "archived" || status === "cancelled";
  }

  function kanbanReadingCanSubmit(card = {}, priorCards = [], workspaceId = "owner") {
    if (kanbanReadingArchived(card)) return false;
    if (!kanbanReadingPriorComplete(workspaceId, priorCards)) return false;
    const status = String(card?.kanbanStatus || card?.kanban_status || card?.status || "").trim().toLowerCase();
    return status !== "done" && status !== "completed";
  }

  function kanbanReadingQuizNeedsRetarget(state = {}) {
    if (!state?.quiz) return false;
    if (String(state.quizTargetingVersion || "") === quizTargetingVersion) return false;
    if (String(state.status || "") === "completed") return false;
    if (!String(state?.transcription?.text || "").trim() || !String(state.analysis || "").trim()) return false;
    const attempts = Array.isArray(state.attempts) ? state.attempts : [];
    return attempts.length === 0;
  }

  async function ensureKanbanReadingQuizTargeted(workspaceId, cardId, currentCard, state = {}) {
    if (!kanbanReadingQuizNeedsRetarget(state)) return { state, retargeted: false, error: "" };
    try {
      const transcription = Object.assign({}, state.transcription || {}, {
        text: compactText(state?.transcription?.text || "", 20000),
      });
      const quiz = await generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, state.analysis, state.notes || "");
      const nextState = writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, Object.assign({}, state, {
        quiz,
        quizTargetingVersion,
        quizRetargetedAt: nowIso(),
        quizUrl: state.quizUrl || readingQuizUrl(workspaceId, cardId),
      }));
      return { state: nextState, retargeted: true, error: "" };
    } catch (err) {
      logger.warn("[reading-quiz] targeted quiz regeneration failed", { cardId, error: err?.message || String(err) });
      return { state, retargeted: false, error: compactText(err?.message || String(err), 240) };
    }
  }

  function writeKanbanReadingAnalysisFile(workspaceId, cardId, currentCard, audio, transcription, analysis, quiz, notes = "") {
    const dir = caseDeliverableDirectory(workspaceId, currentCard?.kanbanCaseId || "study-plan", cardId);
    const stem = safeFileName(`${currentCard?.kanbanCaseCardIndex || "session"}-${currentCard?.content || cardId}`).replace(/\.[^.]+$/, "");
    const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
    const mdPath = path.join(dir, `${Date.now()}-${stem}-${readingTemplate ? "reading" : "study"}-analysis.md`);
    const lines = [
      `# ${currentCard?.content || (readingTemplate ? "Reading submission analysis" : "Study submission analysis")}`,
      "",
      `- Card: ${cardId}`,
      `- Plan: ${currentCard?.kanbanCaseSummary || ""}`,
      `- Submission: ${audio.path}`,
      `- Submitted: ${nowIso()}`,
    ];
    if (notes) lines.push(`- Parent notes: ${notes}`);
    lines.push(
      "",
      "## AI Evaluation",
      "",
      analysis || "No analysis was generated.",
      "",
      "## Practice Quiz",
      "",
      `Quiz link: ${readingQuizUrl(workspaceId, cardId)}`,
      "",
      `Complete all 10 questions correctly in Hermes Mobile to finish this ${readingTemplate ? "reading" : "study"} card.`,
      "",
      readingTemplate ? "## Transcript" : "## Submission Evidence",
      "",
      transcription.text,
    );
    if (quiz?.questions?.length) {
      lines.push("", "## Quiz Question Preview", "");
      for (const [index, question] of quiz.questions.entries()) {
        lines.push(`${index + 1}. ${question.prompt}`);
      }
    }
    const markdown = lines.join("\n");
    fs.writeFileSync(mdPath, markdown, "utf8");
    return mdPath;
  }

  async function submitKanbanReadingSubmission(workspaceId, cardId, body = {}) {
    const context = await readingContextForCard(workspaceId, cardId);
    const currentCard = context.current || { id: cardId, content: cardId };
    if (!kanbanReadingCanSubmit(currentCard, context.prior || [], workspaceId)) {
      return { ok: false, status: 409, error: "Study card is not open yet" };
    }
    const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
    const audio = readingTemplate
      ? Object.assign(saveKanbanReadingAudioUpload(workspaceId, cardId, body, currentCard), { kind: "audio" })
      : saveKanbanStudySubmissionUpload(workspaceId, cardId, body, currentCard);
    const transcription = readingTemplate
      ? Object.assign(await transcribeKanbanReadingAudio(audio.path), { sourceKind: "audio", sourcePath: audio.path })
      : await extractKanbanStudySubmissionEvidence(audio);
    const notes = compactText(body.notes || body.comment || "", 2000);
    const analysis = await analyzeKanbanReadingSubmission(workspaceId, cardId, currentCard, context.prior, transcription, notes);
    const quiz = await generateKanbanReadingQuiz(workspaceId, cardId, currentCard, transcription, analysis, notes);
    const analysisPath = writeKanbanReadingAnalysisFile(workspaceId, cardId, currentCard, audio, transcription, analysis, quiz, notes);
    const quizUrl = readingQuizUrl(workspaceId, cardId);
    const submissionState = writeKanbanReadingSubmissionState(workspaceId, cardId, currentCard, {
      status: "quiz_pending",
      workspaceId,
      cardId,
      cardTitle: currentCard.content || cardId,
      analysisPath,
      audio: { path: audio.path, name: audio.name, mime: audio.mime, size: audio.size, kind: audio.kind || transcription.sourceKind || "" },
      transcription: { text: transcription.text, language: transcription.language || "", sourceKind: transcription.sourceKind || "" },
      analysis,
      quiz,
      quizTargetingVersion,
      quizUrl,
      notes,
      attempts: [],
      submittedAt: nowIso(),
    });
    const commented = await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId,
      comment: [
        readingTemplate ? "Reading retelling audio uploaded and analyzed." : "Study submission uploaded and analyzed.",
        "The full Markdown analysis is attached; complete the 10-question quiz with all answers correct to finish this card.",
        `Quiz: ${quizUrl}`,
        `MEDIA: ${analysisPath}`,
      ].join("\n"),
      author: "Hermes Mobile",
    }).catch(() => null);
    if (!commented?.ok) return { ok: false, error: commented?.error || "Reading submission comment failed", analysisPath };
    return {
      ok: true,
      card: publicTodo(commented),
      audio: { path: audio.path, name: audio.name, mime: audio.mime, size: audio.size, kind: audio.kind || transcription.sourceKind || "" },
      transcription: { text: transcription.text, language: transcription.language || "", sourceKind: transcription.sourceKind || "" },
      analysis,
      analysisPath,
      quiz: publicKanbanReadingQuiz(quiz),
      quizUrl,
      status: submissionState.status,
    };
  }

  async function getKanbanReadingQuiz(workspaceId, cardId) {
    const context = await readingContextForCard(workspaceId, cardId);
    const lookup = findKanbanReadingSubmissionState(workspaceId, cardId, context);
    let state = lookup.state;
    if (!state?.quiz) return { ok: false, status: 404, error: "Reading quiz is not available yet" };
    const targeted = await ensureKanbanReadingQuizTargeted(workspaceId, lookup.cardId, lookup.card || context.current, state);
    state = targeted.state;
    return {
      ok: true,
      canonicalCardId: lookup.cardId,
      quiz: publicKanbanReadingQuiz(state.quiz),
      quizTargetingVersion: String(state.quizTargetingVersion || ""),
      quizRetargeted: Boolean(targeted.retargeted),
      quizRetargetError: targeted.error || "",
      quizUrl: state.quizUrl || readingQuizUrl(workspaceId, lookup.cardId),
      analysisPath: state.analysisPath || "",
      status: state.status || "quiz_pending",
      attempts: Array.isArray(state.attempts) ? state.attempts.map((attempt) => ({
        submittedAt: attempt.submittedAt || "",
        score: Number(attempt.score || 0),
        passed: Boolean(attempt.passed),
      })).slice(-5) : [],
    };
  }

  async function submitKanbanReadingQuiz(workspaceId, cardId, body = {}) {
    const context = await readingContextForCard(workspaceId, cardId);
    const lookup = findKanbanReadingSubmissionState(workspaceId, cardId, context);
    const currentCard = lookup.card || context.current || { id: lookup.cardId || cardId, content: cardId };
    const state = lookup.state;
    if (!state?.quiz) return { ok: false, status: 404, error: "Reading quiz is not available yet" };
    if (String(state.status || "") === "completed") {
      const coinAward = awardReadingQuizPassed(workspaceId, lookup.cardId, currentCard, {
        score: 100,
        correctCount: 10,
        total: 10,
      });
      return { ok: true, passed: true, score: 100, status: "completed", canonicalCardId: lookup.cardId, quiz: publicKanbanReadingQuiz(state.quiz), coinAward };
    }
    const answers = Array.isArray(body.answers)
      ? body.answers
      : (body.answers && typeof body.answers === "object" ? state.quiz.questions.map((question) => body.answers[question.id]) : []);
    const results = state.quiz.questions.map((question, index) => {
      const answerIndex = Number(answers[index]);
      const correct = Number.isInteger(answerIndex) && answerIndex === Number(question.answerIndex);
      return {
        id: question.id || `q${index + 1}`,
        correct,
        answerIndex: Number.isInteger(answerIndex) ? answerIndex : -1,
        correctIndex: Number(question.answerIndex),
        explanation: question.explanation || "",
      };
    });
    const correctCount = results.filter((item) => item.correct).length;
    const score = Math.round((correctCount / Math.max(1, results.length)) * 100);
    const passed = correctCount === 10 && results.length === 10;
    const attempt = {
      submittedAt: nowIso(),
      score,
      correctCount,
      total: results.length,
      passed,
      results,
    };
    const nextState = Object.assign({}, state, {
      status: "quiz_pending",
      attempts: [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-20),
      completedAt: state.completedAt || "",
    });
    if (!passed) {
      writeKanbanReadingSubmissionState(workspaceId, lookup.cardId, currentCard, nextState);
      return {
        ok: true,
        passed: false,
        score,
        correctCount,
        total: results.length,
        results: results.map((item) => ({
          id: item.id,
          correct: item.correct,
          explanation: item.correct ? "" : item.explanation,
        })),
        quiz: publicKanbanReadingQuiz(state.quiz),
        canonicalCardId: lookup.cardId,
      };
    }
    const readingTemplate = kanbanCardUsesReadingTemplate(currentCard);
    const resultText = [
      readingTemplate ? "Reading retelling quiz passed." : "Study submission quiz passed.",
      "Quiz score: 100/100.",
      "",
      `MEDIA: ${state.analysisPath}`,
    ].join("\n");
    await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId: lookup.cardId,
      comment: `${readingTemplate ? "Reading" : "Study"} quiz passed with 10/10 correct answers. Completing this card.`,
      author: "Hermes Mobile",
    }).catch(() => null);
    const completed = await kanbanCardProvider.mutateCard({
      action: "complete",
      workspaceId,
      cardId: lookup.cardId,
      result: resultText,
      author: "Hermes Mobile",
    });
    if (!completed?.ok) {
      writeKanbanReadingSubmissionState(workspaceId, lookup.cardId, currentCard, Object.assign({}, nextState, {
        completionError: completed?.error || "Reading card completion failed",
      }));
      return { ok: false, error: completed?.error || "Reading card completion failed", score };
    }
    writeKanbanReadingSubmissionState(workspaceId, lookup.cardId, currentCard, Object.assign({}, nextState, {
      status: "completed",
      completedAt: nowIso(),
      completionError: "",
    }));
    const coinAward = awardReadingQuizPassed(workspaceId, lookup.cardId, currentCard, {
      score,
      correctCount,
      total: results.length,
    });
    await maybeReconcileKanbanDependencyBlocks(workspaceId, { force: true, limit: 500 }).catch(() => null);
    return {
      ok: true,
      passed: true,
      canonicalCardId: lookup.cardId,
      score,
      correctCount,
      total: results.length,
      coinAward,
      card: publicTodo(completed),
      status: "completed",
    };
  }

  return {
    analyzeKanbanReadingSubmission,
    ensureKanbanReadingQuizTargeted,
    extractKanbanSourceDocumentText,
    extractKanbanStudySubmissionEvidence,
    findKanbanReadingSubmissionState,
    generateKanbanReadingQuiz,
    getKanbanReadingQuiz,
    isKanbanSourceDocumentUpload,
    isReadingAudioUpload,
    isReadingCoverImageUpload,
    kanbanReadingCanSubmit,
    kanbanReadingPriorComplete,
    kanbanReadingQuizNeedsRetarget,
    kanbanReadingStateCompleted,
    normalizeKanbanReadingQuiz,
    publicKanbanReadingQuiz,
    readingContextForCard,
    repairReadingAnalysisMarkdown,
    saveKanbanReadingCoverUpload,
    saveKanbanSourceDocumentUpload,
    saveKanbanReadingAudioUpload,
    saveKanbanStudySubmissionUpload,
    submitKanbanReadingQuiz,
    submitKanbanReadingSubmission,
    transcribeKanbanReadingAudio,
    writeKanbanReadingAnalysisFile,
  };
}

module.exports = {
  createKanbanReadingWorkflowService,
};
