import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson, lessons } from "@/lib/learning";
import { getPublishedModule } from "@/lib/content";
import ModuleCompletion from "@/app/components/ModuleCompletion";

export function generateStaticParams() {
  return lessons.map((lesson) => ({ slug: lesson.slug }));
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = await getPublishedModule(slug) ?? getLesson(slug);
  if (!lesson) notFound();
  const nextLesson = lesson.nextSlug ? await getPublishedModule(lesson.nextSlug) ?? getLesson(lesson.nextSlug) : undefined;
  return <main className="wrap section lesson-page">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <div className="lesson-content">
      <Link className="all-link" href="/learn">← Semua materi</Link>
      <div className="label" style={{ marginTop: 24 }}>MATERI SINGKAT · 3 MENIT</div>
      <h1 className="page-heading">{lesson.title}</h1>
      <p className="lesson-summary">{lesson.summary}</p>
      <section className="lesson-block"><h2>Prinsip utama</h2><p>{lesson.principle}</p></section>
      <section className="lesson-block"><h2>Contoh praktis</h2><p>{lesson.example}</p></section>
      <section className="lesson-block lesson-practice"><h2>Coba sekarang</h2><p>{lesson.practice}</p></section>
      <div className="buttons lesson-actions">{lesson.challengeSlug && <Link className="btn btn-main" href={`/challenges/${lesson.challengeSlug}`}>Latihan dengan quiz →</Link>}<ModuleCompletion slug={lesson.slug} />{nextLesson && <Link className="btn btn-alt" href={`/learn/${nextLesson.slug}`}>Lanjut: {nextLesson.title}</Link>}</div>
    </div>
  </main>;
}
