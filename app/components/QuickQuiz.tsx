"use client";
import { useState } from "react";

const options = [
  "Rangkum ini dong.",
  "Jelaskan semua tentang topik ini.",
  "Rangkum teks ini menjadi 5 poin utama untuk mahasiswa semester 2, dengan bahasa sederhana.",
  "Buat rangkuman yang bagus dan menarik.",
];

export default function QuickQuiz() {
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; explanation: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function pick(index: number) {
    if (selected !== null) return;
    setSelected(index); setLoading(true);
    try {
      const response = await fetch("/api/quiz-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_slug: "homepage-preview", question_index: 0, option_index: index }) });
      if (!response.ok) throw new Error("Feedback unavailable");
      setFeedback(await response.json());
    } catch { setFeedback({ is_correct: false, explanation: "Feedback tidak dapat dimuat saat ini. Coba challenge lengkap untuk melihat penjelasan." }); }
    finally { setLoading(false); }
  }
  return <div className="question-card"><div className="q-top"><span>FIX THE PROMPT</span><span>SOAL 1 DARI 5</span></div><div className="progress"><i style={{ width: "34%" }} /></div><p className="question">Kamu ingin AI merangkum materi kuliah. Prompt mana yang paling membantu?</p>{options.map((option, index) => <button className={"answer " + (selected === index ? "chosen" : "")} key={option} onClick={() => pick(index)} disabled={selected !== null} aria-pressed={selected === index}>{String.fromCharCode(65 + index)}. {option}</button>)}{loading && <p className="save-status" role="status">Memeriksa jawaban…</p>}{feedback && <div className={"feedback show " + (feedback.is_correct ? "" : "wrong")} role="status"><strong>{feedback.is_correct ? "Jawaban tepat." : "Coba pertimbangkan lagi."}</strong>{feedback.explanation}</div>}</div>;
}
