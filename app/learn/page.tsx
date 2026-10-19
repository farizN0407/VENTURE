import Link from "next/link";
import { lessons } from "@/lib/learning";
import { getPublishedModules } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let databaseLessons = [] as Awaited<ReturnType<typeof getPublishedModules>>;
  let contentUnavailable = false;
  try { databaseLessons = await getPublishedModules(); }
  catch { contentUnavailable = true; }
  const lessonBySlug = new Map([...lessons, ...databaseLessons].map((lesson) => [lesson.slug, lesson]));
  const visibleLessons = [...lessonBySlug.values()];
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <div className="head" style={{ marginTop: 48 }}><div><div className="label">Materi singkat</div><h1 className="page-heading">Belajar, coba, lalu evaluasi.</h1><p>Materi AI literacy ringkas dengan contoh praktis dan latihan yang terhubung.</p></div></div>
    <div className="learning-grid">{visibleLessons.map((lesson) => <article className="challenge lesson-card" key={lesson.slug}><div className="num">PROMPTLY LEARNING</div><h2>{lesson.title}</h2><p>{lesson.summary}</p><Link className="play-link" href={`/learn/${lesson.slug}`}>Mulai Belajar →</Link></article>)}</div>
    {contentUnavailable && <p className="auth-message auth-error" role="alert">Materi published dari Supabase belum dapat dimuat. Materi bawaan tetap tersedia; periksa koneksi, izin SELECT, dan RLS.</p>}
    <p className="page-back"><Link href="/challenges">Lihat semua challenge →</Link></p>
  </main>;
}
