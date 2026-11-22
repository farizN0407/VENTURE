"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

type HomeQuiz = { slug: string; title: string; category: string; description: string };

export default function HomeQuizGrid({ quizzes }: { quizzes: HomeQuiz[] }) {
  const [expanded, setExpanded] = useState(false);

  return <>
    <div className="challenge-grid home-quiz-grid" id="home-quiz-list" data-expanded={expanded}>
      {quizzes.map((quiz, index) => <article className="challenge home-quiz-card" key={quiz.slug}>
        <div className="num">{String(index + 1).padStart(2, "0")} / {quiz.category}</div>
        <h3>{quiz.title}</h3>
        <p>{quiz.description}</p>
        <Link className="play-link" href={`/challenges/${quiz.slug}`}>Mulai Quiz <ArrowUpRight size={13}/></Link>
      </article>)}
    </div>
    {quizzes.length > 4 && <button
      className="all-link home-quiz-toggle"
      type="button"
      aria-expanded={expanded}
      aria-controls="home-quiz-list"
      onClick={() => setExpanded((value) => !value)}
    >{expanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Quiz"}</button>}
  </>;
}
