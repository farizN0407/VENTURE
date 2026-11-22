"use client";

import Link from "next/link";
import { useState } from "react";

type HomeMaterial = { slug: string; title: string; summary: string };

export default function HomeMaterialsGrid({ materials }: { materials: HomeMaterial[] }) {
  const [expanded, setExpanded] = useState(false);

  return <>
    <div className="learning-grid home-material-grid" id="home-material-list" data-expanded={expanded}>
      {materials.map((material) => <article className="challenge lesson-card home-material-card" key={material.slug}>
        <div className="num">AI LITERACY</div>
        <h3>{material.title}</h3>
        <p>{material.summary}</p>
        <Link className="play-link" href={`/learn/${material.slug}`}>Mulai Belajar →</Link>
      </article>)}
    </div>
    {materials.length > 4 && <button
      className="all-link home-material-toggle"
      type="button"
      aria-expanded={expanded}
      aria-controls="home-material-list"
      onClick={() => setExpanded((value) => !value)}
    >{expanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Materi"}</button>}
  </>;
}
