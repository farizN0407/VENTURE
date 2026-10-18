import Link from "next/link";
import { lessons } from "@/lib/learning";

export default function LearnPage() {
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <div className="head" style={{ marginTop: 48 }}><div><div className="label">Materi singkat</div><h1 className="page-heading">Belajar, coba, lalu evaluasi.</h1><p>Lima prinsip praktis untuk memakai AI dengan lebih jelas, kritis, dan bertanggung jawab.</p></div></div>
    <div className="learning-grid">{lessons.map((lesson) => <article className="challenge lesson-card" key={lesson.slug}><div className="num">PROMPTLY LEARNING</div><h2>{lesson.title}</h2><p>{lesson.summary}</p><Link className="play-link" href={`/learn/${lesson.slug}`}>Baca materi dan contoh →</Link></article>)}</div>
    <p className="page-back"><Link href="/challenges">Lihat semua challenge →</Link></p>
  </main>;
}
