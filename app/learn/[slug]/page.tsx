import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson, lessons } from "@/lib/learning";
import { getPublishedModule, getPublishedChallenges } from "@/lib/content";
import ModuleCompletion from "@/app/components/ModuleCompletion";
import TopicQuiz from "@/app/components/TopicQuiz";
import { TOPIC_SLUGS, type TopicSlug } from "@/lib/topic-quizzes";

export function generateStaticParams() {
  return lessons.map((lesson) => ({ slug: lesson.slug }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let contentUnavailable = false;
  let databaseLesson;
  try { databaseLesson = await getPublishedModule(slug); }
  catch { contentUnavailable = true; }
  const lesson = databaseLesson ?? getLesson(slug);
  if (!lesson && contentUnavailable) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">MATERI</div><h1 className="page-heading">Materi belum dapat dimuat</h1><p>Supabase belum dapat mengonfirmasi materi published ini. Periksa koneksi, izin SELECT, dan RLS, lalu coba lagi.</p><Link className="btn btn-alt" href="/learn">Kembali ke semua materi</Link></section></main>;
  if (!lesson) notFound();
  let linkedChallengeSlug: string | undefined;
  if (slug.startsWith("custom-")) {
    try {
      const publishedChallenges = await getPublishedChallenges();
      const linkedChallenge = publishedChallenges.find((challenge) => challenge.slug === lesson.challengeSlug)
        ?? publishedChallenges.find((challenge) => challenge.module_slug === lesson.slug);
      linkedChallengeSlug = linkedChallenge?.slug;
    } catch { contentUnavailable = true; }
  } else linkedChallengeSlug = lesson.challengeSlug || undefined;
  let nextLesson;
  if (lesson.nextSlug) {
    try { nextLesson = await getPublishedModule(lesson.nextSlug); }
    catch { contentUnavailable = true; }
    nextLesson ??= getLesson(lesson.nextSlug);
  }
  const hasTopicQuiz = TOPIC_SLUGS.includes(lesson.slug as TopicSlug);
  return <main className="wrap section lesson-page">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <div className="lesson-content">
      <Link className="all-link" href="/learn">← Semua materi</Link>
      <div className="label" style={{ marginTop: 24 }}>MATERI SINGKAT · 3 MENIT</div>
      <h1 className="page-heading">{lesson.title}</h1>
      <p className="lesson-summary">{lesson.summary}</p>
      {contentUnavailable && <p className="auth-message auth-error" role="alert">Sebagian data materi terkait dari Supabase belum dapat dimuat. Materi ini tetap bisa dibaca.</p>}
      <section className="lesson-block"><h2>Prinsip utama</h2><p>{lesson.principle}</p></section>
      <section className="lesson-block"><h2>Contoh praktis</h2><p>{lesson.example}</p></section>
      <section className="lesson-block lesson-practice"><h2>Coba sekarang</h2><p>{lesson.practice}</p></section>
      {lesson.commonMistake && <section className="lesson-block"><h2>Kesalahan yang sering terjadi</h2><p>{lesson.commonMistake}</p></section>}
      {lesson.tip && <section className="lesson-block lesson-practice"><h2>Tips praktis</h2><p>{lesson.tip}</p></section>}
      {lesson.scenario && <section className="lesson-block"><h2>Skenario singkat</h2><p>{lesson.scenario}</p></section>}
      <div className="buttons lesson-actions">{hasTopicQuiz ? <a className="btn btn-main" href="#topic-quiz">Mulai quiz →</a> : linkedChallengeSlug && <Link className="btn btn-main" href={`/challenges/${linkedChallengeSlug}`}>Mulai Quiz →</Link>}{!hasTopicQuiz && !linkedChallengeSlug && <p className="save-status" role={contentUnavailable ? "alert" : "status"}>{contentUnavailable ? "Daftar challenge published belum dapat diverifikasi. Periksa koneksi Supabase dan RLS." : <>Belum ada challenge published yang terhubung. Di Content Studio, pastikan <code>challenges.module_slug</code> bernilai <code>{lesson.slug}</code> atau <code>learning_modules.challenge_slug</code> bernilai slug challenge yang benar, lalu pastikan challenge berstatus Terbit.</>}</p>}<ModuleCompletion slug={lesson.slug} />{nextLesson && <Link className="btn btn-alt" href={`/learn/${nextLesson.slug}`}>Lanjut: {nextLesson.title}</Link>}</div>
      {hasTopicQuiz && <TopicQuiz topicSlug={lesson.slug} topicTitle={lesson.title} challengeSlug={lesson.challengeSlug} />}
    </div>
  </main>;
}
