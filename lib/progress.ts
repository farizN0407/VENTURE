export const AI_SKILLS = ["Prompting", "Critical Thinking", "Fact Checking", "AI Knowledge", "Practical Application"] as const;
export type AiSkill = (typeof AI_SKILLS)[number];
export type ScoredAttempt = {
  score: number;
  skill_results?: { skill: string; correct: number; total: number }[] | null;
  answer_details?: { skill?: string; is_correct?: boolean }[] | null;
};

export function getAttemptSkillResults(attempt: ScoredAttempt) {
  const totals = new Map<AiSkill, { correct: number; total: number }>();
  const details = attempt.answer_details;
  if (Array.isArray(details) && details.length > 0) {
    for (const answer of details) {
      if (!answer || typeof answer.skill !== "string" || !AI_SKILLS.includes(answer.skill as AiSkill) || typeof answer.is_correct !== "boolean") continue;
      const skill = answer.skill as AiSkill;
      const result = totals.get(skill) ?? { correct: 0, total: 0 };
      result.total += 1;
      if (answer.is_correct) result.correct += 1;
      totals.set(skill, result);
    }
  } else {
    // Older attempts may not have per-question reviews. Preserve their stored
    // per-skill aggregates without rewriting historical rows.
    for (const result of attempt.skill_results ?? []) {
      if (!AI_SKILLS.includes(result.skill as AiSkill) || !Number.isFinite(result.correct) || !Number.isFinite(result.total) || result.total <= 0 || result.correct < 0 || result.correct > result.total) continue;
      const skill = result.skill as AiSkill;
      const current = totals.get(skill) ?? { correct: 0, total: 0 };
      current.correct += result.correct;
      current.total += result.total;
      totals.set(skill, current);
    }
  }
  return [...totals].map(([skill, result]) => ({ skill, ...result }));
}

export function isAiLiteracyAttempt(attempt: ScoredAttempt) {
  return getAttemptSkillResults(attempt).length > 0;
}

export function calculateLiteracyProfile(attempts: ScoredAttempt[]) {
  const totals = new Map<AiSkill, { correct: number; total: number }>(AI_SKILLS.map((skill) => [skill, { correct: 0, total: 0 }]));
  const relevantAttempts = attempts.filter(isAiLiteracyAttempt);
  for (const attempt of relevantAttempts) {
    for (const result of getAttemptSkillResults(attempt)) {
      const current = totals.get(result.skill as AiSkill)!;
      current.correct += result.correct;
      current.total += result.total;
    }
  }
  const skills = AI_SKILLS.map((skill) => {
    const result = totals.get(skill)!;
    return { name: skill, score: result.total ? Math.round((result.correct * 100) / result.total) : null, correct: result.correct, total: result.total };
  });
  const overallScore = relevantAttempts.length ? Math.round(relevantAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / relevantAttempts.length) : null;
  const status = overallScore === null ? "Baru memulai" : overallScore < 40 ? "Membangun dasar" : overallScore < 70 ? "Terus berkembang" : "Konsisten berlatih";
  return { overallScore, status, completedAttempts: relevantAttempts.length, skills };
}
