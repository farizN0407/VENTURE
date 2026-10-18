export const AI_SKILLS = ["Prompting", "Critical Thinking", "Fact Checking", "AI Knowledge", "Practical Application"] as const;
export type AiSkill = (typeof AI_SKILLS)[number];
export type ScoredAttempt = {
  score: number;
  skill_results: { skill: string; correct: number; total: number }[] | null;
};

export function calculateLiteracyProfile(attempts: ScoredAttempt[]) {
  const totals = new Map<AiSkill, { correct: number; total: number }>(AI_SKILLS.map((skill) => [skill, { correct: 0, total: 0 }]));
  for (const attempt of attempts) {
    for (const result of attempt.skill_results ?? []) {
      if (!AI_SKILLS.includes(result.skill as AiSkill)) continue;
      const current = totals.get(result.skill as AiSkill)!;
      current.correct += result.correct;
      current.total += result.total;
    }
  }
  const skills = AI_SKILLS.map((skill) => {
    const result = totals.get(skill)!;
    return { name: skill, score: result.total ? Math.round((result.correct * 100) / result.total) : 0, correct: result.correct, total: result.total };
  });
  const overallScore = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0;
  const status = attempts.length === 0 ? "Baru memulai" : overallScore < 40 ? "Membangun dasar" : overallScore < 70 ? "Terus berkembang" : "Konsisten berlatih";
  return { overallScore, status, completedAttempts: attempts.length, skills };
}
