import Link from "next/link";
import { challenges } from "@/lib/challenges";
import { getPublishedChallenges } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  let databaseChallenges = [] as Awaited<ReturnType<typeof getPublishedChallenges>>;
  let contentUnavailable = false;
  try { databaseChallenges = await getPublishedChallenges(); }
  catch { contentUnavailable = true; }
  const all = [
    ...challenges.map((challenge) => ({ slug: challenge.slug, title: challenge.title, category: challenge.category, description: challenge.description, difficulty: challenge.difficulty, questionCount: challenge.questions.length })),
    ...databaseChallenges.filter((challenge) => !challenges.some((item) => item.slug === challenge.slug)).map((challenge) => ({ slug: challenge.slug, title: challenge.title, category: challenge.category, description: challenge.description, difficulty: challenge.difficulty, questionCount: challenge.questions.length })),
  ];
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <div className="head" style={{ marginTop: 48 }}><div><div className="label">Interactive quiz</div><h1 className="page-heading">Pilih challenge</h1><p>Jawab soal, baca feedback, dan pelajari alasan di balik jawaban yang tepat.</p></div><Link className="all-link" href="/pricing">Lihat paket Pro →</Link></div>
    <div className="challenge-grid">{all.map((challenge, index) => <article className="challenge" key={challenge.slug}><div className="num">{String(index + 1).padStart(2, "0")} / {challenge.category}</div><h2>{challenge.title}</h2><p>{challenge.description}</p><div style={{ fontSize: 10, color: "#68788c", marginBottom: 12 }}>{challenge.questionCount} soal · {challenge.difficulty}</div><Link className="play-link" href={`/challenges/${challenge.slug}`}>Mulai Quiz →</Link></article>)}</div>
    {contentUnavailable && <p className="auth-message auth-error" role="alert">Challenge published dari Supabase belum dapat dimuat. Challenge bawaan tetap tersedia; periksa koneksi, izin SELECT, dan RLS.</p>}
  </main>;
}
