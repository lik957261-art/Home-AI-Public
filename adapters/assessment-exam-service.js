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

module.exports = {
  assessmentChoiceSet,
  assessmentLooksLikeAmc8,
  fractionText,
  generateVerifiedAmc8AssessmentQuestions,
  mathQuestionWithChoices,
  normalizeAssessmentExam,
  seededNumber,
  seededRandom,
};
