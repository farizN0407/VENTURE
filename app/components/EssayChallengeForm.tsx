"use client";

import { useState } from "react";
import { ESSAY_CHALLENGE, ESSAY_CRITERIA, ESSAY_MAX_LENGTH, ESSAY_MIN_LENGTH, type EssayAttemptRecord } from "@/lib/essay-challenge";

export default function EssayChallengeForm({ initialAttempts }: { initialAttempts: EssayAttemptRecord[] }) {
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(initialAttempts);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = attempts[0];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmed = answer.trim();
    if (trimmed.length < ESSAY_MIN_LENGTH) { setError(`Prompt harus berisi sedikitnya ${ESSAY_MIN_LENGTH} karakter.`); return; }
    if (trimmed.length > ESSAY_MAX_LENGTH) { setError(`Prompt tidak boleh lebih dari ${ESSAY_MAX_LENGTH} karakter.`); return; }
    setPending(true);
    try {
      const response = await fetch("/api/essay-challenges/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_slug: ESSAY_CHALLENGE.slug, answer: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Essay tidak dapat dievaluasi.");
      if (!data.attempt || typeof data.attempt.id !== "string") throw new Error("Respons evaluasi tidak valid.");
      setAttempts((current) => [data.attempt as EssayAttemptRecord, ...current]);
      setAnswer("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Essay tidak dapat dievaluasi. Coba lagi nanti.");
    } finally { setPending(false); }
  }

  return <>
    <section className="essay-panel">
      <div className="label">TANTANGAN PROMPTING · PROMPTLY PRO</div>
      <h1 className="essay-title">{ESSAY_CHALLENGE.title}</h1>
      <p className="essay-instructions">{ESSAY_CHALLENGE.instructions}</p>
      <form className="essay-form" onSubmit={submit}>
        <label htmlFor="essay-answer">Tulis prompt kamu sendiri</label>
        <textarea id="essay-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={ESSAY_MAX_LENGTH} minLength={ESSAY_MIN_LENGTH} required disabled={pending} placeholder="Contoh: You are an academic research assistant…" />
        <div className="essay-form-meta"><span>{answer.length}/{ESSAY_MAX_LENGTH} karakter</span><span>Minimum {ESSAY_MIN_LENGTH} karakter</span></div>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        <button className="btn btn-main" type="submit" disabled={pending}>{pending ? "Sedang mengevaluasi…" : "Evaluasi prompt"}</button>
        <p className="essay-note">Maksimal 3 evaluasi per hari, dengan jeda 30 detik. Hasil tersimpan ke akunmu.</p>
      </form>
    </section>
    {latest && <section className="essay-result" aria-live="polite">
      <div className="essay-result-heading"><div><div className="label">HASIL EVALUASI</div><h2>Skor kamu</h2></div><strong className="essay-total">{latest.total_score}<small>/100</small></strong></div>
      <div className="essay-criteria">{ESSAY_CRITERIA.map(({ key, label }) => <article className="essay-criterion" key={key}><div><strong>{label}</strong><b>{latest.criteria_scores[key].score}<small>/25</small></b></div><p>{latest.criteria_scores[key].feedback}</p></article>)}</div>
      <div className="essay-feedback-grid"><div><h3>Kekuatan prompt</h3><ul>{latest.feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h3>Yang bisa diperbaiki</h3><ul>{latest.feedback.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>
      <div className="essay-improved"><h3>Contoh prompt yang lebih baik</h3><p>{latest.feedback.improvedPrompt}</p></div>
    </section>}
    <section className="essay-history"><div className="head"><div><div className="label">PROGRESMU</div><h2>Riwayat pengerjaan</h2></div></div>{attempts.length ? <div className="attempt-list">{attempts.map((attempt) => <article className="attempt-row" key={attempt.id}><div><strong>{ESSAY_CHALLENGE.title}</strong><small>{new Date(attempt.submitted_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</small></div><span>{attempt.total_score}/100</span></article>)}</div> : <p className="account-empty">Belum ada percobaan. Kirim prompt pertamamu untuk melihat hasilnya di sini.</p>}</section>
  </>;
}
