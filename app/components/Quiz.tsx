"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type PublicChallenge = {
  slug: string; title: string; category: string; description: string; difficulty: string;
  questions: { id?: string; prompt: string; options: string[]; skill: string }[];
};
type SkillResult = { skill: string; correct: number; total: number; score: number };
type QuizResult = { score: number; correct_answers: number; total_questions: number; skill_results: SkillResult[]; saved: boolean; save_reason?: string };
const lessonBySkill: Record<string, string> = { Prompting:"prompting", "Critical Thinking":"critical-thinking", "Fact Checking":"fact-checking", "AI Knowledge":"critical-thinking", "Practical Application":"responsible-ai" };
const challengeBySkill: Record<string, string> = { Prompting:"fix-the-prompt", "Critical Thinking":"critical-thinking", "Fact Checking":"can-you-trust-ai", "AI Knowledge":"ai-or-human", "Practical Application":"responsible-ai" };
const lessonTitle: Record<string, string> = { prompting:"Prompting", "critical-thinking":"Critical Thinking", "fact-checking":"Fact Checking", "responsible-ai":"Responsible AI", "ai-for-research":"AI for Research" };
const challengeTitle: Record<string, string> = { "fix-the-prompt":"Fix the Prompt", "critical-thinking":"Think Critically with AI", "can-you-trust-ai":"Can You Trust AI?", "ai-or-human":"AI or Human?", "responsible-ai":"Use AI Responsibly" };

export default function Quiz({ challenge }: { challenge: PublicChallenge }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; explanation: string } | null>(null);
  const [feedbackState, setFeedbackState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [resultState, setResultState] = useState<"idle" | "loading" | "error">("idle");
  const question = challenge.questions[index];

  const recommendations = useMemo(() => {
    if (!result) return { lessonSlugs: [] as string[], challengeSlugs: [] as string[] };
    const weakSkills = result.skill_results.filter((skill) => skill.score < 100).sort((a, b) => a.score - b.score).map((skill) => skill.skill);
    const skills = weakSkills.length ? weakSkills : ["Prompting"];
    const lessonSlugs = [...new Set(skills.map((skill) => lessonBySkill[skill] ?? "responsible-ai"))].slice(0, 2);
    const challengeSlugs = [...new Set(skills.map((skill) => challengeBySkill[skill] ?? "responsible-ai"))].filter((slug) => slug !== challenge.slug).slice(0, 2);
    return { lessonSlugs, challengeSlugs };
  }, [result, challenge.slug]);

  useEffect(() => {
    if (!done || result || resultState === "loading") return;
    setResultState("loading");
    fetch("/api/quiz-attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_slug: challenge.slug, answers }) })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Hasil quiz tidak dapat dihitung.");
        setResult(data as QuizResult);
      })
      .catch(() => setResultState("error"));
  }, [done, result, resultState, challenge.slug, answers]);

  async function choose(optionIndex: number) {
    if (selected !== null) return;
    setSelected(optionIndex);
    setAnswers((previous) => [...previous.slice(0, index), optionIndex]);
    setFeedbackState("loading");
    try {
      const response = await fetch("/api/quiz-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_slug: challenge.slug, question_index: index, option_index: optionIndex, question_id: question.id }) });
      if (!response.ok) throw new Error("Feedback unavailable");
      setFeedback(await response.json());
      setFeedbackState("ready");
    } catch { setFeedbackState("error"); }
  }

  function retry() {
    setIndex(0); setSelected(null); setAnswers([]); setDone(false); setFeedback(null); setFeedbackState("idle"); setResult(null); setResultState("idle");
  }

  if (done) {
    if (resultState === "error") return <section className="question-card result-card" role="alert"><h2 className="auth-heading">Hasil belum dapat dihitung</h2><p className="result-copy">Periksa koneksi lalu coba lagi. Jawaban quiz belum dinilai.</p><button className="btn btn-main" type="button" onClick={() => setResultState("idle")}>Coba lagi</button></section>;
    if (!result) return <section className="question-card result-card" role="status"><div className="label">Challenge selesai</div><h2 className="auth-heading">Menghitung hasil…</h2><p className="result-copy">Jawaban sedang dinilai oleh server.</p></section>;
    return <section className="question-card result-card" style={{ maxWidth: 680 }}>
      <div className="label">Challenge selesai</div><h2 className="result-score">{result.score}/100</h2>
      <p className="result-copy">Kamu menjawab {result.correct_answers} dari {result.total_questions} soal dengan benar. Skor dihitung di server dari jawaban yang kamu pilih.</p>
      <p className="save-status" role="status">{result.saved ? "Hasil tersimpan di akunmu." : result.save_reason === "storage_unavailable" ? "Skor dihitung, tetapi penyimpanan akun belum dikonfigurasi." : <>Skor guest hanya berlaku untuk sesi ini dan tidak tersimpan. <Link href="/login?next=%2Faccount">Masuk untuk menyimpan quiz berikutnya →</Link></>}</p>
      <div className="result-recommendations"><strong>Materi untuk langkah berikutnya</strong><ul>{recommendations.lessonSlugs.map((slug) => <li key={slug}><Link href={`/learn/${slug}`}>{lessonTitle[slug] ?? slug} →</Link></li>)}</ul></div>
      <div className="result-recommendations"><strong>Challenge yang direkomendasikan</strong><ul>{recommendations.challengeSlugs.map((slug) => <li key={slug}><Link href={`/challenges/${slug}`}>{challengeTitle[slug] ?? slug} →</Link></li>)}</ul></div>
      <div className="buttons"><button className="btn btn-main" type="button" onClick={retry}>Coba lagi</button><Link className="btn btn-alt" href="/challenges">Pilih challenge lain</Link></div>
      <p style={{ fontSize: 11, color: "#68788c", marginTop: 18 }}>Skor ini hasil dari challenge ini saja, bukan penilaian ilmiah atau sertifikasi AI literacy.</p>
    </section>;
  }

  if (!question) return <section className="question-card" role="alert">Challenge ini belum memiliki soal yang dapat ditampilkan.</section>;
  return <section className="question-card" style={{ maxWidth: 680 }}>
    <div className="q-top"><span>{challenge.title.toUpperCase()}</span><span>SOAL {index + 1} DARI {challenge.questions.length}</span></div>
    <div className="progress"><i style={{ width: `${((index + 1) / challenge.questions.length) * 100}%` }} /></div>
    <p className="question" style={{ fontSize: 20 }}>{question.prompt}</p>
    <div>{question.options.map((option, optionIndex) => <button key={`${optionIndex}-${option}`} className={`answer ${selected === optionIndex ? "chosen" : ""}`} disabled={selected !== null} onClick={() => choose(optionIndex)}>{String.fromCharCode(65 + optionIndex)}. {option}</button>)}</div>
    {feedbackState === "loading" && <p className="save-status" role="status">Memeriksa jawaban…</p>}
    {feedbackState === "ready" && feedback && <div className={`feedback show ${feedback.is_correct ? "" : "wrong"}`}><strong>{feedback.is_correct ? "Jawaban tepat." : "Belum tepat — pelajari alasannya."}</strong>{feedback.explanation}</div>}
    {feedbackState === "error" && <p className="auth-message auth-error" role="alert">Feedback tidak dapat dimuat. Jawabanmu tetap tercatat untuk perhitungan hasil.</p>}
    {selected !== null && feedbackState !== "loading" && <button className="btn btn-main quiz-next show" onClick={() => { if (index < challenge.questions.length - 1) { setIndex(index + 1); setSelected(null); setFeedback(null); setFeedbackState("idle"); } else setDone(true); }}>{index === challenge.questions.length - 1 ? "Lihat hasil" : "Soal berikutnya"} →</button>}
  </section>;
}
