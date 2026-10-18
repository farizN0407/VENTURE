"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Option = { id: string; text: string };
type TopicQuestion = { id: string; prompt: string; skill: string; difficulty: string; options: Option[] };
type TopicAnswer = { question_id: string; option_id: string };
type QuizData = { attempt_id: string; topic_slug: string; questions: TopicQuestion[]; total_questions: number; guest_attempt_tracking: boolean };
type ReviewItem = { question_id: string; prompt: string; skill: string; is_correct: boolean; selected_answer: string; correct_answer: string; explanation: string };
type QuizResult = { attempt_id?: string; score: number; correct_answers: number; total_questions: number; skill_results: { skill: string; correct: number; total: number; score: number }[]; review: ReviewItem[]; saved: boolean; save_reason?: string };

const recommendations: Record<string, { slug: string; title: string }> = {
  Prompting: { slug: "prompting", title: "Prompting" },
  "Critical Thinking": { slug: "critical-thinking", title: "Critical Thinking" },
  "Fact Checking": { slug: "fact-checking", title: "Fact Checking" },
  "AI Knowledge": { slug: "ai-knowledge", title: "AI Knowledge" },
  "Practical Application": { slug: "practical-application", title: "Practical Application" },
};

export default function TopicQuiz({ topicSlug, topicTitle, challengeSlug }: { topicSlug: string; topicTitle: string; challengeSlug?: string }) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<TopicAnswer[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = quiz?.questions[index];

  const loadQuiz = useCallback(async (excluded: string[] = []) => {
    setLoading(true); setError(null); setQuiz(null); setResult(null); setAnswers([]); setIndex(0); setSelectedOptionId(null);
    try {
      const response = await fetch("/api/topic-quizzes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic_slug: topicSlug, challenge_slug: challengeSlug, excluded_question_ids: excluded }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Quiz belum dapat dimuat.");
      if (data.total_questions !== 5 || !Array.isArray(data.questions) || data.questions.length !== 5) throw new Error("Bank soal belum memenuhi lima soal untuk topik ini.");
      setQuiz(data as QuizData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Quiz belum dapat dimuat.");
    } finally { setLoading(false); }
  }, [topicSlug, challengeSlug]);

  useEffect(() => {
    let excluded: string[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(`promptly-guest-questions:${topicSlug}`) ?? "[]");
      if (Array.isArray(stored)) excluded = stored.filter((id): id is string => typeof id === "string");
    } catch { /* Guest quizzes still work when browser storage is disabled. */ }
    void loadQuiz(excluded);
  }, [loadQuiz, topicSlug]);

  const incorrect = useMemo(() => result?.review.filter((answer) => !answer.is_correct) ?? [], [result]);
  const suggestedLessons = useMemo(() => {
    if (!result) return [];
    const skills = [...new Set(incorrect.map((answer) => answer.skill))];
    return skills.map((skill) => recommendations[skill]).filter((value, position, all): value is { slug: string; title: string } => Boolean(value) && all.findIndex((candidate) => candidate?.slug === value?.slug) === position).slice(0, 3);
  }, [incorrect, result]);

  async function submitQuiz(finalAnswers: TopicAnswer[]) {
    if (!quiz || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/quiz-attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic_slug: topicSlug, challenge_slug: challengeSlug, attempt_id: quiz.attempt_id, answers: finalAnswers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hasil quiz tidak dapat dihitung.");
      setResult(data as QuizResult);
      if (quiz.guest_attempt_tracking) {
        try {
          const key = `promptly-guest-questions:${topicSlug}`;
          const previous = JSON.parse(localStorage.getItem(key) ?? "[]");
          const ids = Array.isArray(previous) ? previous.filter((id): id is string => typeof id === "string") : [];
          localStorage.setItem(key, JSON.stringify([...new Set([...ids, ...quiz.questions.map((question) => question.id)])]));
        } catch { /* Completion and scoring do not depend on browser storage. */ }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Hasil quiz tidak dapat dihitung.");
    } finally { setSubmitting(false); }
  }

  function choose(option: Option) {
    if (!current || selectedOptionId) return;
    const nextAnswers = [...answers, { question_id: current.id, option_id: option.id }];
    setAnswers(nextAnswers); setSelectedOptionId(option.id);
    if (index === 4) void submitQuiz(nextAnswers);
  }

  return <section className="topic-quiz" id="topic-quiz" aria-labelledby="topic-quiz-heading">
    <div className="topic-quiz-heading"><div><div className="label">PLAY · QUIZ TOPIK</div><h2 id="topic-quiz-heading">Uji pemahaman: {topicTitle}</h2><p>Lima skenario dipilih dari bank soal topik ini. Jawaban dan penjelasan dibuka setelah semua soal selesai.</p></div><span className="topic-count">5 SOAL</span></div>
    {loading && <div className="question-card" role="status">Menyiapkan lima soal…</div>}
    {!loading && error && !result && <div className="question-card" role="alert"><p>{error}</p><button className="btn btn-main" type="button" onClick={() => void loadQuiz()}>Coba muat lagi</button></div>}
    {!loading && !error && !result && current && quiz && <div className="question-card topic-question-card">
      <div className="q-top"><span>{topicTitle.toUpperCase()}</span><span>SOAL {index + 1} DARI 5</span></div>
      <div className="progress"><i style={{ width: `${((index + 1) / 5) * 100}%` }} /></div>
      <p className="topic-difficulty">{current.difficulty} · {current.skill}</p>
      <p className="question" style={{ fontSize: 20 }}>{current.prompt}</p>
      <div>{current.options.map((option, optionIndex) => <button key={option.id} className={`answer ${selectedOptionId === option.id ? "chosen" : ""}`} disabled={Boolean(selectedOptionId) || submitting} onClick={() => choose(option)}>{String.fromCharCode(65 + optionIndex)}. {option.text}</button>)}</div>
      {submitting && <p className="save-status" role="status">Menilai jawaban di server…</p>}
      {error && <p className="auth-message auth-error" role="alert">{error} <button type="button" className="text-button" onClick={() => void submitQuiz(answers)}>Kirim ulang hasil</button></p>}
      {selectedOptionId && !submitting && !error && index < 4 && <button className="btn btn-main quiz-next show" type="button" onClick={() => { setIndex(index + 1); setSelectedOptionId(null); }}>Soal berikutnya →</button>}
    </div>}
    {result && <div className="question-card result-card topic-result-card">
      <div className="label">Quiz selesai · {result.correct_answers} dari 5 benar</div><h3 className="result-score">{result.score}/100</h3>
      <p className="result-copy">Skor = jumlah jawaban benar ÷ 5 × 100. {result.saved ? "Hasil tersimpan di akunmu." : result.save_reason === "storage_unavailable" ? "Skor dihitung, tetapi hasil belum tersimpan ke akun." : "Hasil guest berlaku di sesi ini dan tidak tersimpan permanen."}</p>
      {incorrect.length ? <div className="topic-review"><h3>Yang bisa dipelajari lagi</h3>{incorrect.map((answer, answerIndex) => <article className="topic-review-item" key={answer.question_id}><strong>{answerIndex + 1}. {answer.prompt}</strong><p>Jawabanmu: {answer.selected_answer}</p><p>Jawaban yang tepat: {answer.correct_answer}</p><div className="feedback wrong show">{answer.explanation}</div></article>)}</div> : <div className="feedback show">Semua jawaban tepat. Lanjutkan dengan mencoba topik lain dan tetap verifikasi klaim penting dari sumber.</div>}
      {suggestedLessons.length > 0 && <div className="result-recommendations"><strong>Materi berikutnya berdasarkan jawaban yang perlu dilatih</strong><ul>{suggestedLessons.map((lesson) => <li key={lesson.slug}><Link href={`/learn/${lesson.slug}`}>{lesson.title} →</Link></li>)}</ul></div>}
      <div className="buttons"><button className="btn btn-main" type="button" onClick={() => {
        const excluded = quiz?.guest_attempt_tracking ? (quiz.questions ?? []).map((question) => question.id) : [];
        void loadQuiz(excluded);
      }}>Coba lima soal lain</button><Link className="btn btn-alt" href="/learn">Pilih topik lain</Link></div>
      <p className="topic-save-note">{result.saved ? "Skor profil diperbarui dari percobaan tersimpan ini." : "Guest tidak mengubah profil akun mana pun."} Skor latihan bukan sertifikasi AI literacy.</p>
    </div>}
  </section>;
}
