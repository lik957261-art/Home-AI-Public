"use strict";

function defaultCompactText(value, max = 200) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

function maxQuestionCount(config = {}, raw = {}, options = {}) {
  const maxQuestions = Math.max(5, Math.min(100, Number(options.maxQuestions || 40) || 40));
  return Math.max(5, Math.min(maxQuestions, Number(config.questionCount || raw.questionCount || raw.question_count || 20) || 20));
}

function seededNumber(seedText) {
  let value = 2166136261;
  const text = String(seedText || "");
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seedText) {
  let seed = seededNumber(seedText) || 1;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}

function assessmentChoiceSet(correct, distractors, random) {
  const seen = new Set();
  const values = [correct, ...(Array.isArray(distractors) ? distractors : [])]
    .map((value) => String(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  while (values.length < 4) {
    const candidate = String(Number(correct) + (values.length + 1) * (random() > 0.5 ? 1 : -1));
    if (!seen.has(candidate)) {
      seen.add(candidate);
      values.push(candidate);
    }
  }
  const choices = values.slice(0, 4);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  return { choices, answerIndex: choices.indexOf(String(correct)) };
}

function mathQuestionWithChoices(id, skill, prompt, correct, distractors, explanation, random) {
  const choiceSet = assessmentChoiceSet(correct, distractors, random);
  return {
    id,
    skill,
    prompt,
    choices: choiceSet.choices,
    answerIndex: choiceSet.answerIndex,
    explanation,
    verification: "deterministic-template",
  };
}

function gcdInt(a, b) {
  let left = Math.abs(Number(a) || 0);
  let right = Math.abs(Number(b) || 0);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function fractionText(numerator, denominator) {
  const divisor = gcdInt(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function assessmentLooksLikeAmc8(config = {}, seedText = "") {
  const text = [
    config.subject,
    config.subjectId,
    config.courseLevel,
    config.difficulty,
    seedText,
  ].map((item) => String(item || "").toLowerCase()).join(" ");
  return /amc\s*8|amc8|mathcounts|competition|contest/.test(text)
    || /\u7ade\u8d5b|\u5965\u6570|\u7f8e\u56fd\u6570\u5b66/.test(text);
}

function generateVerifiedAmc8AssessmentQuestions(config = {}, seedText = "", options = {}) {
  const random = seededRandom(seedText);
  const count = maxQuestionCount(config, {}, options);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const type = index % 10;
    const id = `q${index + 1}`;
    if (type === 0) {
      const x = int(4, 16);
      const a = int(2, 7);
      const b = int(3, 11);
      const c = a * (x + b);
      questions.push(mathQuestionWithChoices(id, "AMC 8 algebra", `If ${a}(x + ${b}) = ${c}, what is x?`, x, [x + b, x - 1, c - b, a + b], `Divide by ${a} to get x + ${b} = ${x + b}, so x = ${x}.`, random));
    } else if (type === 1) {
      const width = int(6, 15);
      const height = int(5, 14);
      const cut = int(2, Math.min(width, height) - 1);
      const correct = width * height - cut * cut;
      questions.push(mathQuestionWithChoices(id, "AMC 8 geometry area", `A ${width} by ${height} rectangle has a ${cut} by ${cut} square removed from one corner. What area remains?`, correct, [width * height, correct + cut, 2 * (width + height) - cut * cut, correct - cut], `The original area is ${width * height}; the removed square area is ${cut * cut}; remaining area is ${correct}.`, random));
    } else if (type === 2) {
      const sides = int(7, 14);
      const correct = sides * (sides - 3) / 2;
      questions.push(mathQuestionWithChoices(id, "AMC 8 combinatorics", `How many diagonals does a convex ${sides}-gon have?`, correct, [sides * (sides - 1) / 2, sides * (sides - 3), correct + sides, correct - sides], `A polygon has n(n-3)/2 diagonals, so ${sides}(${sides}-3)/2 = ${correct}.`, random));
    } else if (type === 3) {
      const red = int(3, 8);
      const blue = int(4, 9);
      const total = red + blue;
      const numerator = red * blue * 2;
      const denominator = total * (total - 1);
      const correct = fractionText(numerator, denominator);
      questions.push(mathQuestionWithChoices(id, "AMC 8 probability", `A bag has ${red} red and ${blue} blue balls. Two balls are drawn without replacement. What is the probability the colors are different?`, correct, [fractionText(red * blue, denominator), fractionText(red * (red - 1), denominator), fractionText(blue * (blue - 1), denominator), fractionText(numerator, total * total)], `Different colors can occur as RB or BR, giving ${red}*${blue}*2 favorable ordered outcomes out of ${total}*${total - 1}.`, random));
    } else if (type === 4) {
      const primes = [[2, 3], [2, 5], [3, 5], [2, 7]][int(0, 3)];
      const expA = int(2, 4);
      const expB = int(1, 3);
      const correct = (expA + 1) * (expB + 1);
      questions.push(mathQuestionWithChoices(id, "AMC 8 number theory", `How many positive divisors does ${primes[0]}^${expA} * ${primes[1]}^${expB} have?`, correct, [expA * expB, correct - 1, correct + expA, expA + expB + 1], `For p^a q^b, the divisor count is (a+1)(b+1) = ${correct}.`, random));
    } else if (type === 5) {
      const boys = int(3, 7);
      const girls = int(4, 9);
      const scale = int(4, 11);
      const addedGirls = int(2, 8);
      const correct = boys * scale;
      const totalAfter = (boys + girls) * scale + addedGirls;
      questions.push(mathQuestionWithChoices(id, "AMC 8 ratio", `A club has boys:girls = ${boys}:${girls}. After ${addedGirls} girls join, there are ${totalAfter} students. How many boys are in the club?`, correct, [girls * scale, correct + addedGirls, totalAfter - correct, correct - addedGirls], `Before the new girls, the total was ${totalAfter - addedGirls}; one ratio unit is ${scale}, so boys = ${boys}*${scale}.`, random));
    } else if (type === 6) {
      const countScores = int(4, 7);
      const average = int(12, 20);
      const newScore = int(21, 30);
      const newAverageNumerator = average * countScores + newScore;
      const correct = fractionText(newAverageNumerator, countScores + 1);
      questions.push(mathQuestionWithChoices(id, "AMC 8 averages", `${countScores} numbers have average ${average}. A new number ${newScore} is added. What is the new average?`, correct, [String(average + newScore), fractionText(average + newScore, 2), fractionText(newAverageNumerator, countScores), String(average + 1)], `The new sum is ${average * countScores}+${newScore}=${newAverageNumerator}, divided by ${countScores + 1}.`, random));
    } else if (type === 7) {
      const divisor = int(5, 13);
      const quotient = int(8, 25);
      const remainder = int(1, divisor - 1);
      const value = divisor * quotient + remainder;
      const multiplier = int(3, 9);
      const correct = (value * multiplier) % divisor;
      questions.push(mathQuestionWithChoices(id, "AMC 8 modular arithmetic", `When ${value} is multiplied by ${multiplier}, what is the remainder upon division by ${divisor}?`, correct, [(remainder + multiplier) % divisor, remainder, divisor - correct, (correct + 1) % divisor], `${value} leaves remainder ${remainder}; ${remainder}*${multiplier} leaves remainder ${correct} mod ${divisor}.`, random));
    } else if (type === 8) {
      const slow = int(3, 7);
      const fast = slow + int(2, 5);
      const hours = int(2, 5);
      const correct = (fast - slow) * hours;
      questions.push(mathQuestionWithChoices(id, "AMC 8 rate", `Runner A travels ${slow} miles per hour and Runner B travels ${fast} miles per hour in the same direction. After ${hours} hours, how many miles farther has B traveled?`, correct, [fast * hours, slow * hours, correct + slow, fast - slow], `Only the speed difference matters: (${fast}-${slow})*${hours} = ${correct}.`, random));
    } else {
      const first = int(2, 9);
      const diff = int(3, 8);
      const term = int(9, 16);
      const correct = first + (term - 1) * diff;
      questions.push(mathQuestionWithChoices(id, "AMC 8 sequences", `The first term of an arithmetic sequence is ${first}, and the common difference is ${diff}. What is the ${term}th term?`, correct, [first + term * diff, correct - diff, correct + diff, first * term], `The ${term}th term is ${first}+(${term}-1)*${diff} = ${correct}.`, random));
    }
  }
  return questions;
}

function generateVerifiedMathAssessmentQuestions(config = {}, seedText = "", options = {}) {
  if (assessmentLooksLikeAmc8(config, seedText)) {
    return generateVerifiedAmc8AssessmentQuestions(config, seedText, options);
  }
  const random = seededRandom(seedText);
  const count = maxQuestionCount(config, {}, options);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const type = index % 10;
    const id = `q${index + 1}`;
    if (type === 0) {
      const a = int(12, 80);
      const b = int(8, 60);
      const c = int(3, 9);
      const correct = a + b * c;
      questions.push(mathQuestionWithChoices(id, "arithmetic: operation order", `${a} + ${b} × ${c} = ?`, correct, [a + b + c, (a + b) * c, correct + b, correct - c], `先算乘法 ${b} × ${c}，再加 ${a}。`, random));
    } else if (type === 1) {
      const x = int(3, 18);
      const a = int(2, 9);
      const b = int(4, 30);
      const c = a * x + b;
      questions.push(mathQuestionWithChoices(id, "algebra: linear equation", `If ${a}x + ${b} = ${c}, what is x?`, x, [x + 1, x - 1, a + b, c - b], `移项后 ${a}x=${c - b}，所以 x=${x}。`, random));
    } else if (type === 2) {
      const base = int(8, 30) * 10;
      const rate = [10, 15, 20, 25, 30, 40][int(0, 5)];
      const correct = Math.round(base * rate / 100);
      questions.push(mathQuestionWithChoices(id, "percentage", `${base} 的 ${rate}% 是多少？`, correct, [correct + 5, correct - 5, Math.round(base / rate), base - correct], `${rate}% = ${rate}/100，所以结果是 ${correct}。`, random));
    } else if (type === 3) {
      const left = int(2, 7);
      const right = int(3, 9);
      const unit = int(4, 12);
      const total = (left + right) * unit;
      const correct = left * unit;
      questions.push(mathQuestionWithChoices(id, "ratio", `A:B = ${left}:${right}，如果 A+B=${total}，A 是多少？`, correct, [right * unit, correct + unit, total - correct + unit, total], `总份数 ${left + right}，每份 ${unit}，A=${left} 份。`, random));
    } else if (type === 4) {
      const w = int(4, 14);
      const h = int(5, 16);
      const correct = w * h;
      questions.push(mathQuestionWithChoices(id, "geometry: rectangle area", `长方形长 ${w}、宽 ${h}，面积是多少？`, correct, [2 * (w + h), correct + w, correct + h, w + h], `长方形面积 = 长 × 宽 = ${correct}。`, random));
    } else if (type === 5) {
      const a = int(55, 95);
      const b = int(55, 95);
      const c = int(55, 95);
      const targetAvg = int(70, 90);
      const correct = targetAvg * 4 - a - b - c;
      questions.push(mathQuestionWithChoices(id, "average", `四次测验平均分要达到 ${targetAvg}。前三次是 ${a}, ${b}, ${c}，第四次需要多少分？`, correct, [correct + 5, correct - 5, targetAvg, Math.round((a + b + c) / 3)], `四次总分需 ${targetAvg * 4}，减去前三次即可。`, random));
    } else if (type === 6) {
      const red = int(2, 8);
      const blue = int(2, 8);
      const total = red + blue;
      questions.push(mathQuestionWithChoices(id, "probability", `袋子里有 ${red} 个红球和 ${blue} 个蓝球，随机取 1 个，取到红球的概率是？`, `${red}/${total}`, [`${blue}/${total}`, `${red}/${blue}`, `${total}/${red}`, `1/${total}`], `有利结果 ${red} 个，总结果 ${total} 个。`, random));
    } else if (type === 7) {
      const start = int(2, 12);
      const step = int(3, 9);
      const correct = start + step * 5;
      questions.push(mathQuestionWithChoices(id, "sequence", `数列 ${start}, ${start + step}, ${start + step * 2}, ${start + step * 3}, ... 的第 6 项是多少？`, correct, [correct - step, correct + step, start * 6, step * 6], `第 6 项比第 1 项多 5 个公差。`, random));
    } else if (type === 8) {
      const n = int(4, 16);
      const divisor = int(3, 9);
      const remainder = int(0, divisor - 1);
      const value = n * divisor + remainder;
      questions.push(mathQuestionWithChoices(id, "number theory: remainder", `${value} 除以 ${divisor} 的余数是多少？`, remainder, [divisor - remainder, remainder + 1, n, divisor], `${value}=${divisor}×${n}+${remainder}。`, random));
    } else {
      const price = int(12, 48);
      const countItems = int(3, 9);
      const paid = Math.ceil(price * countItems / 10) * 10 + 10;
      const correct = paid - price * countItems;
      questions.push(mathQuestionWithChoices(id, "word problem", `每本练习册 ${price} 元，买 ${countItems} 本，付 ${paid} 元，应找回多少元？`, correct, [correct + price, correct - 1, paid - price, price * countItems], `总价 ${price * countItems}，找回 ${paid}-${price * countItems}=${correct}。`, random));
    }
  }
  return questions;
}

function normalizeAssessmentExam(raw = {}, config = {}, options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const questionLimit = maxQuestionCount(config, raw, options);
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item, index) => {
      const choices = (Array.isArray(item?.choices) ? item.choices : [])
        .map((choice) => compactText(choice, 320))
        .filter(Boolean)
        .slice(0, 4);
      const answerIndex = Number(item?.answerIndex ?? item?.answer_index ?? item?.correctIndex ?? item?.correct_index);
      return {
        id: compactText(item?.id || `q${index + 1}`, 40),
        skill: compactText(item?.skill || item?.category || "", 100),
        prompt: compactText(item?.prompt || item?.question || "", 900),
        choices,
        answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length ? answerIndex : -1,
        explanation: compactText(item?.explanation || "", 900),
        verification: compactText(item?.verification || raw.verification || "model-generated", 80),
      };
    })
    .filter((item) => item.prompt && item.choices.length >= 2 && item.answerIndex >= 0)
    .slice(0, questionLimit);
  if (questions.length !== questionLimit) {
    throw new Error(`Assessment exam generation returned ${questions.length} valid questions; expected ${questionLimit}`);
  }
  return {
    title: compactText(raw.title || `${config.subject || "Assessment"} formal exam`, 160),
    subject: compactText(raw.subject || config.subject || "", 80),
    subjectId: compactText(raw.subjectId || raw.subject_id || config.subjectId || "", 80),
    questionCount: questionLimit,
    durationMinutes: Math.max(5, Math.min(180, Number(config.durationMinutes || raw.durationMinutes || raw.duration_minutes || 30) || 30)),
    passingScore: Math.max(50, Math.min(100, Number(config.passingScore || raw.passingScore || raw.passing_score || 80) || 80)),
    verification: compactText(raw.verification || (questions.every((item) => item.verification === "deterministic-template") ? "deterministic-template" : "model-generated"), 80),
    questions,
  };
}

function gradeAssessmentExam(exam = {}, state = {}, body = {}, options = {}) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const answers = Array.isArray(body.answers)
    ? body.answers
    : (body.answers && typeof body.answers === "object" ? questions.map((question) => body.answers[question.id]) : []);
  const invalidAnswers = questions
    .map((question, index) => {
      const answerIndex = Number(answers[index]);
      const choiceCount = Array.isArray(question.choices) ? question.choices.length : 0;
      return Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choiceCount ? null : (question.id || `q${index + 1}`);
    })
    .filter(Boolean);
  if (!questions.length || answers.length < questions.length || invalidAnswers.length) {
    return {
      ok: false,
      status: 400,
      error: "Assessment answers are incomplete",
      missingAnswers: invalidAnswers,
    };
  }
  const results = questions.map((question, index) => {
    const answerIndex = Number(answers[index]);
    const correct = Number.isInteger(answerIndex) && answerIndex === Number(question.answerIndex);
    return {
      id: question.id || `q${index + 1}`,
      skill: question.skill || "",
      correct,
      answerIndex: Number.isInteger(answerIndex) ? answerIndex : -1,
      correctIndex: Number(question.answerIndex),
      explanation: question.explanation || "",
    };
  });
  const correctCount = results.filter((item) => item.correct).length;
  const total = results.length;
  const score = Math.round((correctCount / Math.max(1, total)) * 100);
  const passingScore = Number(exam.passingScore || state.config?.passingScore || options.passingScore || 80) || 80;
  const passed = score >= passingScore;
  return {
    ok: true,
    passed,
    score,
    correctCount,
    total,
    passingScore,
    results,
    attempt: {
      submittedAt: typeof options.nowIso === "function" ? options.nowIso() : (options.submittedAt || new Date().toISOString()),
      score,
      correctCount,
      total,
      passingScore,
      passed,
      results,
    },
  };
}

function assessmentReportQuestionById(exam = {}) {
  const byId = new Map();
  for (const question of Array.isArray(exam.questions) ? exam.questions : []) {
    const id = String(question?.id || "").trim();
    if (id) byId.set(id, question);
  }
  return byId;
}

function assessmentChoiceLabel(index) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0) return "";
  return String.fromCharCode(65 + value);
}

function assessmentReportChoiceText(question = {}, index) {
  const label = assessmentChoiceLabel(index);
  if (!label) return "未记录";
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const text = choices[index] ? ` ${choices[index]}` : "";
  return `${label}.${text}`.trim();
}

function assessmentReportSkillSummary(results = []) {
  const stats = new Map();
  for (const item of results) {
    const skill = defaultCompactText(item?.skill || "未标注技能", 80);
    const current = stats.get(skill) || { correct: 0, total: 0 };
    current.total += 1;
    if (item?.correct) current.correct += 1;
    stats.set(skill, current);
  }
  return [...stats.entries()]
    .sort((left, right) => (left[1].correct / Math.max(1, left[1].total)) - (right[1].correct / Math.max(1, right[1].total)) || left[0].localeCompare(right[0]))
    .map(([skill, stat]) => `- ${skill}: ${stat.correct}/${stat.total}`)
    .join("\n");
}

function buildAssessmentExamReportMarkdown(input = {}) {
  const cardTitle = String(input.cardTitle || input.exam?.title || "Assessment Report");
  const cardId = String(input.cardId || "");
  const exam = input.exam || {};
  const attempt = input.attempt || {};
  const results = Array.isArray(attempt.results) ? attempt.results : [];
  const wrong = results.filter((item) => !item.correct);
  const byId = assessmentReportQuestionById(exam);
  const wrongDetails = wrong.length ? wrong.map((item, index) => {
    const question = byId.get(String(item.id || "")) || {};
    const selected = assessmentReportChoiceText(question, item.answerIndex);
    const correct = assessmentReportChoiceText(question, item.correctIndex);
    return [
      `### ${index + 1}. ${item.id || `q${index + 1}`}${item.skill ? ` - ${item.skill}` : ""}`,
      "",
      `- 题目：${defaultCompactText(question.prompt || "未记录题干", 1200)}`,
      `- 作答：${selected}`,
      `- 正确答案：${correct}`,
      `- 分析：${defaultCompactText(item.explanation || question.explanation || "需要复盘本题对应概念、审题条件和计算过程。", 1200)}`,
      `- 练习重点：${defaultCompactText(item.skill || question.skill || "回到同类题复盘", 160)}`,
    ].join("\n");
  }).join("\n\n") : "无错题。";
  const skillSummary = assessmentReportSkillSummary(results) || "暂无分项统计。";
  return [
    `# ${cardTitle}`,
    "",
    `- 卡片：${cardId}`,
    `- 科目：${exam.subject || ""}`,
    `- 得分：${Number(attempt.score || 0)}/100`,
    `- 正确：${Number(attempt.correctCount || 0)}/${Number(attempt.total || 0)}`,
    `- 通过线：${Number(exam.passingScore || attempt.passingScore || 0)}/100`,
    `- 结果：${attempt.passed ? "通过" : "未通过"}`,
    `- 提交时间：${attempt.submittedAt || ""}`,
    "",
    "## 总体评价",
    "",
    attempt.passed
      ? "本次正式检测达到通过线。后续建议继续保持正确题对应的解题步骤，并复盘耗时较长的题型。"
      : "本次正式检测未达到通过线，卡片需要重考。优先处理下方错题对应的概念、审题条件和计算步骤。",
    "",
    "## 分项表现",
    "",
    skillSummary,
    "",
    "## 错题分析",
    "",
    wrongDetails,
    "",
    "## 后续复盘建议",
    "",
    wrong.length
      ? "- 先按错题分析逐题复盘：题干条件、选项排除、关键计算或推理步骤。\n- 对错题技能点各补 2-3 道同类题，再重新测试。\n- 重考前只复习本次错题和低正确率技能点，避免无目标刷题。"
      : "- 本次没有错题。建议保留本次答题节奏，并把耗时较长或不确定的题型作为下次复盘重点。",
  ].join("\n");
}

module.exports = {
  assessmentChoiceLabel,
  assessmentChoiceSet,
  assessmentLooksLikeAmc8,
  buildAssessmentExamReportMarkdown,
  fractionText,
  generateVerifiedAmc8AssessmentQuestions,
  generateVerifiedMathAssessmentQuestions,
  gradeAssessmentExam,
  mathQuestionWithChoices,
  normalizeAssessmentExam,
  seededNumber,
  seededRandom,
};
