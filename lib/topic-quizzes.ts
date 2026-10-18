import { randomInt, randomUUID } from "node:crypto";
import bank from "@/lib/topic-question-bank.json";

export type TopicSlug = keyof typeof bank;
type RawQuestion = (typeof bank)[TopicSlug][number];
export type PublicTopicQuestion = {
  id: string;
  prompt: string;
  skill: string;
  difficulty: string;
  options: { id: string; text: string }[];
};
export type TopicAnswer = { question_id: string; option_id: string };
export type TopicReview = {
  question_id: string;
  prompt: string;
  skill: string;
  is_correct: boolean;
  selected_answer: string;
  correct_answer: string;
  explanation: string;
};

const QUESTIONS_PER_ATTEMPT = 5;
export const TOPIC_SLUGS = Object.keys(bank) as TopicSlug[];
export const CHALLENGE_TOPICS: Record<string, TopicSlug> = {
  "prompt-battle": "prompting",
  "fix-the-prompt": "prompting",
  "can-you-trust-ai": "fact-checking",
  "ai-or-human": "ai-knowledge",
  "ai-in-real-life": "practical-application",
  "ai-for-research": "ai-for-research",
  "critical-thinking": "critical-thinking",
  "responsible-ai": "responsible-ai",
};

function shuffle<T>(items: T[], nextIndex: (max: number) => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = nextIndex(index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function shuffleQuestionOptions(question: RawQuestion, nextIndex: (max: number) => number = randomInt) {
  return shuffle(question.options.map((text) => ({ id: text, text })), nextIndex);
}

export function selectTopicQuestions(
  topic: TopicSlug,
  excludedIds: string[] = [],
  nextIndex: (max: number) => number = randomInt,
) {
  const pool = bank[topic] as RawQuestion[];
  const excluded = new Set(excludedIds);
  const unseen = pool.filter((question) => !excluded.has(question.id));
  const source = unseen.length >= QUESTIONS_PER_ATTEMPT ? unseen : pool;
  const selected = shuffle(source, nextIndex).slice(0, QUESTIONS_PER_ATTEMPT);
  const questions: PublicTopicQuestion[] = shuffle(selected, nextIndex).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    skill: question.skill,
    difficulty: question.difficulty,
    options: shuffleQuestionOptions(question, nextIndex),
  }));
  return { attemptId: randomUUID(), questions };
}

export function gradeTopicQuestions(topic: TopicSlug, answers: TopicAnswer[]) {
  if (answers.length !== QUESTIONS_PER_ATTEMPT) throw new Error("A topic quiz requires exactly five answers.");
  const pool = bank[topic] as RawQuestion[];
  const byId = new Map(pool.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const review: TopicReview[] = answers.map(({ question_id, option_id }) => {
    const question = byId.get(question_id);
    if (!question || seen.has(question_id)) throw new Error("Quiz questions are invalid or duplicated.");
    seen.add(question_id);
    const selectedIndex = question.options.indexOf(option_id);
    if (selectedIndex < 0) throw new Error("A quiz answer is invalid.");
    return {
      question_id,
      prompt: question.prompt,
      skill: question.skill,
      is_correct: selectedIndex === question.correctIndex,
      selected_answer: question.options[selectedIndex],
      correct_answer: question.options[question.correctIndex],
      explanation: question.explanation,
    };
  });
  const correctAnswers = review.filter((answer) => answer.is_correct).length;
  const skillTotals = new Map<string, { correct: number; total: number }>();
  for (const answer of review) {
    const total = skillTotals.get(answer.skill) ?? { correct: 0, total: 0 };
    total.total += 1;
    if (answer.is_correct) total.correct += 1;
    skillTotals.set(answer.skill, total);
  }
  return {
    score: Math.round((correctAnswers * 100) / QUESTIONS_PER_ATTEMPT),
    correct_answers: correctAnswers,
    total_questions: QUESTIONS_PER_ATTEMPT,
    skill_results: [...skillTotals].map(([skill, result]) => ({ skill, ...result, score: Math.round((result.correct * 100) / result.total) })),
    review,
  };
}
