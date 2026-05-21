"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const DEFAULT_CONTRACT = {
  activityType: "practice",
  label: "Learning task",
  rubricDimensions: [
    "task alignment",
    "specific evidence",
    "visible repair",
    "short reflection",
  ],
  requiredEvidence: [
    "one direct answer to the task",
    "one concrete detail or example",
    "one repair or improvement step",
    "one reflection sentence explaining the change",
  ],
  revisionMoves: [
    "Keep the part that directly answers the task.",
    "Add one concrete detail that makes the answer easier to evaluate.",
    "Repair one unclear sentence with a stronger English expression.",
    "Add one reflection sentence explaining what changed and why.",
  ],
  finalTransferMoves: [
    "Carry the strongest expression into the next card.",
    "Before the next answer, outline goal, evidence, repair, and reflection.",
  ],
  reflectionPrompts: [
    "What did I change after feedback?",
    "Which detail should I reuse in the next card?",
  ],
  sentenceFix: "Add one specific English detail or repair sentence that directly matches the card instruction.",
  exampleSentence: "First, I changed my answer because the detail was not clear enough.",
  nextPractice: "Reuse the strongest evidence and repair step in the next Growth task.",
};

const CONTRACTS = {
  reading: {
    label: "Reading comprehension",
    rubricDimensions: ["main idea", "text evidence", "inference", "uncertainty reflection"],
    requiredEvidence: [
      "state the main idea in one sentence",
      "use at least two short text details",
      "explain one inference with because/so",
      "mark one uncertain point or question",
    ],
    revisionMoves: [
      "Name the main idea before listing details.",
      "Replace a vague detail with a short text-based clue.",
      "Use because/so to explain why the detail supports the answer.",
      "Add one sentence about what is still uncertain.",
    ],
    finalTransferMoves: [
      "Use the main idea plus evidence pattern in the next reading card.",
      "Before answering, underline two useful clues and one uncertainty.",
    ],
    reflectionPrompts: [
      "Which text clue helped my answer most?",
      "What did I infer instead of copy?",
    ],
    sentenceFix: "Connect the answer to one short text clue and explain why it matters.",
    exampleSentence: "The detail shows Derek kept trying because he did not stop after the first problem.",
    nextPractice: "Next reading task should start with main idea, two clues, and one inference.",
  },
  listening: {
    label: "Listening key points",
    rubricDimensions: ["key points", "sequence", "uncertainty marking", "summary accuracy"],
    requiredEvidence: [
      "write three to five heard key points",
      "keep the order of the audio or speaker",
      "mark the most uncertain phrase",
      "summarize without inventing unsupported details",
    ],
    revisionMoves: [
      "Separate heard facts from guessed details.",
      "Put the key points in listening order.",
      "Mark one phrase that needs replay or checking.",
      "Add one short summary sentence using only heard information.",
    ],
    finalTransferMoves: [
      "Use the key-point order pattern in the next listening card.",
      "Mark uncertainty early instead of guessing silently.",
    ],
    reflectionPrompts: [
      "Which phrase was hardest to hear?",
      "Which key point changed after I checked it?",
    ],
    sentenceFix: "Rewrite the point as a heard fact, then mark the uncertain word separately.",
    exampleSentence: "I heard that the class changed rooms, but I am not sure about the time.",
    nextPractice: "Next listening task should separate heard points, uncertain words, and final summary.",
  },
  speaking: {
    label: "Speaking retell",
    rubricDimensions: ["main idea", "sequence", "detail selection", "spoken clarity"],
    requiredEvidence: [
      "retell the main idea",
      "include at least two details in order",
      "use one transition phrase",
      "add one reflection about clarity",
    ],
    revisionMoves: [
      "Start with the main idea before details.",
      "Put the details in story or explanation order.",
      "Add one transition such as first/then/finally.",
      "Repair one sentence that would be hard to say aloud.",
    ],
    finalTransferMoves: [
      "Reuse the main idea plus ordered detail frame in the next speaking card.",
      "Practice one repaired sentence aloud before submitting.",
    ],
    reflectionPrompts: [
      "Which sentence became easier to say?",
      "Where did I add order words?",
    ],
    sentenceFix: "Make the retell sentence shorter and add a clear transition.",
    exampleSentence: "First, Derek wanted to keep going, and then Rooster followed him.",
    nextPractice: "Next speaking task should use main idea, two ordered details, and one clear transition.",
  },
  pronunciation: {
    label: "Pronunciation shadowing",
    rubricDimensions: ["target sounds", "stress", "repair attempt", "self-monitoring"],
    requiredEvidence: [
      "write the target sentence or phrase",
      "name the hardest sound or stress point",
      "write a repaired repeat sentence",
      "explain what changed in the repeat",
    ],
    revisionMoves: [
      "Name the exact sound or word stress that was hard.",
      "Mark the stressed word or syllable.",
      "Write one repaired repeat sentence.",
      "Explain what changed between the first and repaired attempt.",
    ],
    finalTransferMoves: [
      "Carry the hardest sound into a short daily repeat note.",
      "Before the next pronunciation card, mark stress before speaking.",
    ],
    reflectionPrompts: [
      "Which sound or stress point did I repair?",
      "What did I do differently in the repeat?",
    ],
    sentenceFix: "Mark the stressed word and write the repaired repeat sentence.",
    exampleSentence: "I stressed kept in Derek kept going because it shows the action continued.",
    nextPractice: "Next pronunciation task should name the sound, mark stress, and record one repair step.",
  },
  vocabulary: {
    label: "Active vocabulary",
    rubricDimensions: ["word meaning", "context use", "sentence accuracy", "transfer"],
    requiredEvidence: [
      "use target words in meaningful sentences",
      "show school or life context",
      "avoid isolated translation-only answers",
      "include one new transfer sentence",
    ],
    revisionMoves: [
      "Make each target word do real work in the sentence.",
      "Add a school or life context so the meaning is visible.",
      "Replace one translation-style sentence with a natural English sentence.",
      "Add one transfer sentence using the word in a new scene.",
    ],
    finalTransferMoves: [
      "Reuse the strongest word in a new subject or school scene.",
      "Before the next card, choose context first, then write the vocabulary sentence.",
    ],
    reflectionPrompts: [
      "Which word became clearer after revision?",
      "Where can I reuse this word next?",
    ],
    sentenceFix: "Show the word meaning through context instead of only translating it.",
    exampleSentence: "I felt confident when I explained my project to my classmates.",
    nextPractice: "Next vocabulary task should use target words in context and add one transfer sentence.",
  },
  grammar: {
    label: "Grammar in expression",
    rubricDimensions: ["target pattern", "sentence repair", "explanation", "variant transfer"],
    requiredEvidence: [
      "repair the target sentence",
      "name the grammar pattern",
      "explain why the repair is correct",
      "write one variant sentence with the same pattern",
    ],
    revisionMoves: [
      "Mark the exact grammar pattern being repaired.",
      "Rewrite the wrong sentence as a complete corrected sentence.",
      "Explain why the corrected form matches the subject, tense, or structure.",
      "Add one new variant sentence using the same pattern.",
    ],
    finalTransferMoves: [
      "Carry the grammar pattern into the next writing or speaking card.",
      "Before the next grammar card, write one rule and one example.",
    ],
    reflectionPrompts: [
      "What grammar pattern did I repair?",
      "Can I use the same pattern in a new sentence?",
    ],
    sentenceFix: "Write the full corrected sentence and explain the rule in one short note.",
    exampleSentence: "Derek and Rooster kept going because the action happened in the past.",
    nextPractice: "Next grammar task should include rule, repaired sentence, and one variant sentence.",
  },
  rewriting: {
    label: "Rewrite improvement",
    rubricDimensions: ["meaning preserved", "sentence upgrade", "reason for change", "variant repair"],
    requiredEvidence: [
      "provide the rewritten version",
      "explain what changed",
      "preserve the original meaning",
      "write one variant repair sentence",
    ],
    revisionMoves: [
      "Keep the original meaning before upgrading the expression.",
      "Replace one vague phrase with a more precise phrase.",
      "Explain why the new sentence is clearer or stronger.",
      "Add one variant sentence using the same improvement pattern.",
    ],
    finalTransferMoves: [
      "Reuse the improvement pattern in the next writing card.",
      "Before rewriting, decide whether the goal is clarity, detail, or tone.",
    ],
    reflectionPrompts: [
      "What changed between the old and new sentence?",
      "Why is the new version better?",
    ],
    sentenceFix: "Preserve the meaning, then make the expression clearer with one precise detail.",
    exampleSentence: "Instead of saying it was good, I wrote that the clear example helped the reader understand my idea.",
    nextPractice: "Next rewrite task should show original meaning, upgraded sentence, and reason for change.",
  },
  presentation: {
    label: "Presentation rehearsal",
    rubricDimensions: ["opening", "audience evidence", "order", "closing"],
    requiredEvidence: [
      "write a clear opening",
      "include two ordered points",
      "add one audience-specific example",
      "write a closing sentence",
    ],
    revisionMoves: [
      "Make the opening tell the listener what the talk is about.",
      "Put the two points in a clear order.",
      "Add one example the audience can picture.",
      "Connect the closing back to the opening.",
    ],
    finalTransferMoves: [
      "Reuse the opening, two-point, closing frame in the next presentation card.",
      "Before rehearsing, check whether each point has an audience example.",
    ],
    reflectionPrompts: [
      "Which example helps the listener understand?",
      "How did my closing connect back to the opening?",
    ],
    sentenceFix: "Name the audience and add one example they can picture.",
    exampleSentence: "I will explain our science poster to Grade 7 classmates with one example from our experiment.",
    nextPractice: "Next presentation task should have opening, ordered points, audience example, and closing.",
  },
  weekly_challenge: {
    label: "Weekly integrated challenge",
    rubricDimensions: ["integration", "evidence", "repair transfer", "weekly reflection"],
    requiredEvidence: [
      "complete one integrated answer",
      "use at least one detail from this week's practice",
      "include one improved sentence",
      "write one weekly reflection",
    ],
    revisionMoves: [
      "Connect the answer to one real weakness or skill from this week.",
      "Use one detail from reading, vocabulary, grammar, speaking, or writing practice.",
      "Upgrade one sentence and explain the improvement.",
      "End with one weekly reflection about what to carry forward.",
    ],
    finalTransferMoves: [
      "Carry the strongest weekly repair into next week's first task.",
      "Before the next weekly challenge, collect one example from each practice type.",
    ],
    reflectionPrompts: [
      "Which skill improved most this week?",
      "Which weakness should become next week's first repair?",
    ],
    sentenceFix: "Connect one weekly practice detail to the answer and name the repair.",
    exampleSentence: "This week, I improved my evidence sentence because I added a detail from the reading task.",
    nextPractice: "Next weekly challenge should connect evidence, repair, and reflection across multiple task types.",
  },
};

function activityCoachingContract(activityType) {
  const key = cleanString(activityType) || "practice";
  const overrides = CONTRACTS[key] || {};
  return Object.assign({}, DEFAULT_CONTRACT, overrides, {
    activityType: key,
    rubricDimensions: asArray(overrides.rubricDimensions || DEFAULT_CONTRACT.rubricDimensions).slice(0, 6),
    requiredEvidence: asArray(overrides.requiredEvidence || DEFAULT_CONTRACT.requiredEvidence).slice(0, 8),
    revisionMoves: asArray(overrides.revisionMoves || DEFAULT_CONTRACT.revisionMoves).slice(0, 8),
    finalTransferMoves: asArray(overrides.finalTransferMoves || DEFAULT_CONTRACT.finalTransferMoves).slice(0, 6),
    reflectionPrompts: asArray(overrides.reflectionPrompts || DEFAULT_CONTRACT.reflectionPrompts).slice(0, 4),
  });
}

function coachingContractPrompt(activityType) {
  const contract = activityCoachingContract(activityType);
  return [
    `Activity: ${contract.label}`,
    `Rubric dimensions: ${contract.rubricDimensions.join("; ")}`,
    `Required evidence: ${contract.requiredEvidence.join("; ")}`,
    `Revision moves: ${contract.revisionMoves.join("; ")}`,
    `Reflection prompts: ${contract.reflectionPrompts.join("; ")}`,
  ].join("\n");
}

module.exports = {
  activityCoachingContract,
  coachingContractPrompt,
};
