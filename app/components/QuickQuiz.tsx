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
  return <div className="question-card"><div className="q-top"><span>FIX THE PROMPT</span><span>SOAL 1 DARI 5</span></div><div className="progress"><i style={{ width: "34%" }} /></div><p className="question">Kamu ingin AI merangkum materi kuliah. Prompt mana yang paling membantu?</p>{options.map((option, index) => <button className={`answer ${selected === index ? "chosen" : ""}`} key={option} onClick={() => setSelected(index)} aria-pressed={selected === index}>{String.fromCharCode(65 + index)}. {option}</button>)}{selected !== null && <div className={`feedback show ${selected === 2 ? "" : "wrong"}`} role="status"><strong>{selected === 2 ? "Jawaban tepat." : "Coba pertimbangkan lagi."}</strong>{selected === 2 ? "Prompt yang efektif menyebutkan konteks, tujuan, audiens, dan format hasil." : "Prompt yang spesifik menyebutkan konteks, tujuan, dan format yang diinginkan."}</div>}</div>;
}
