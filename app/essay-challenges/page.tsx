import Link from "next/link";
import { ESSAY_CHALLENGES } from "@/lib/essay-challenge";

export default function EssayChallengesIndexPage() {
  return <main className="wrap section"><div className="essay-top"><Link className="brand" href="/">promptly<b>.</b></Link><Link className="page-back" href="/">← Kembali ke Promptly</Link></div><section className="essay-panel"><div className="label">PROMPTLY PRO · ESSAY CHALLENGES</div><h1 className="essay-title">Pilih tantangan menulis prompt</h1><p className="essay-instructions">Tulis prompt sendiri, dapatkan evaluasi AI berdasarkan empat kriteria, lalu gunakan feedback untuk memperbaikinya.</p><div className="challenge-grid">{ESSAY_CHALLENGES.map((challenge, index) => <article className="challenge pro-challenge" key={challenge.slug}><div className="num">{String(index + 1).padStart(2, "0")} / {challenge.topic}</div><h2>{challenge.title}</h2><p>{challenge.cardDescription}</p><Link className="play-link" href={`/essay-challenges/${challenge.slug}`}>Buka Essay Challenge →</Link></article>)}</div></section></main>;
}
