import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { challenges } from "@/lib/challenges";
import { lessons } from "@/lib/learning";
import { resolvePlan } from "@/lib/entitlements";

type Attempt = { id: number; challenge_slug: string; score: number; correct_answers: number; total_questions: number; created_at: string; skill_results: { skill: string; correct: number; total: number; score: number }[] | null };
type ModuleRow = { slug: string; title: string };
const challengeBySlug = Object.fromEntries(challenges.map((challenge) => [challenge.slug, challenge.title]));
const nextBySkill: Record<string, { lesson: string; challenge: string }> = {
  Prompting: { lesson: "prompting", challenge: "fix-the-prompt" }, "Critical Thinking": { lesson: "critical-thinking", challenge: "critical-thinking" },
  "Fact Checking": { lesson: "fact-checking", challenge: "can-you-trust-ai" }, "AI Knowledge": { lesson: "critical-thinking", challenge: "ai-or-human" },
  "Practical Application": { lesson: "responsible-ai", challenge: "responsible-ai" },
};

export default async function AccountPage() {
  let supabase;
  try { supabase = await createClient(); } catch {
    return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Akun belum tersambung</h1><p>Autentikasi dan penyimpanan progres memerlukan project Supabase, URL, anon key, service-role key server-side, serta schema Promptly.</p><Link className="btn btn-main" href="/challenges">Lanjut ke challenge sebagai tamu</Link></section></main>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Masuk untuk melihat progres.</h1><p>Hasil quiz dan penyelesaian materi tersimpan hanya setelah kamu masuk dan Supabase siap. Challenge tetap bisa dicoba sebagai tamu.</p><div className="buttons"><Link className="btn btn-main" href="/login?next=%2Faccount">Masuk atau daftar</Link><Link className="btn btn-alt" href="/challenges">Lanjut sebagai tamu</Link></div></section></main>;

  const [{ data: attemptsData, error: attemptsError, count: attemptCount }, { data: completionData, error: completionError }, { data: subscription, error: subscriptionError }, { data: profile }, { data: moduleData }, { data: challengeData }] = await Promise.all([
    supabase.from("quiz_attempts").select("id,challenge_slug,score,correct_answers,total_questions,created_at,skill_results", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
    supabase.from("module_completions").select("module_slug,completed_at").eq("user_id", user.id),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("learning_modules").select("slug,title").eq("published", true),
    supabase.from("challenges").select("slug,title").eq("published", true),
  ]);
  const attempts = (attemptsData ?? []) as Attempt[];
  const completions = (completionData ?? []) as { module_slug: string; completed_at: string }[];
  const completedModuleSlugs = new Set(completions.map((item) => item.module_slug));
  const completedChallengeSlugs = new Set(attempts.map((item) => item.challenge_slug));
  const dynamicModules = (moduleData ?? []) as ModuleRow[];
  const dynamicChallenges = (challengeData ?? []) as ModuleRow[];
  const moduleNames = new Map([...lessons.map((item) => [item.slug, item.title] as const), ...dynamicModules.map((item) => [item.slug, item.title] as const)]);
  const availableChallengeCount = challenges.length + dynamicChallenges.filter((item) => !challengeBySlug[item.slug]).length;
  const totalItems = moduleNames.size + availableChallengeCount;
  const progress = totalItems ? Math.round((completedModuleSlugs.size + completedChallengeSlugs.size) * 100 / totalItems) : 0;

  const bestScores = new Map<string, number>();
  const skillTotals = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    bestScores.set(attempt.challenge_slug, Math.max(bestScores.get(attempt.challenge_slug) ?? 0, attempt.score));
    for (const item of attempt.skill_results ?? []) {
      const current = skillTotals.get(item.skill) ?? { correct: 0, total: 0 };
      current.correct += item.correct; current.total += item.total; skillTotals.set(item.skill, current);
    }
  }
  const weakSkills = [...skillTotals].map(([skill, scores]) => ({ skill, ...scores, score: Math.round(scores.correct * 100 / scores.total) }))
    .filter((item) => item.score < 80).sort((a, b) => a.score - b.score).slice(0, 3);
  const recommendations = (weakSkills.length ? weakSkills : [{ skill: "Prompting", correct: 0, total: 1, score: 0 }]).map(({ skill }) => ({ skill, ...(nextBySkill[skill] ?? nextBySkill.Prompting) }));
  const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : 0;
  const isPro = resolvePlan(subscription) === "pro";
  const dataUnavailable = Boolean(attemptsError || completionError || subscriptionError);
  const remainingModules = [...moduleNames].filter(([slug]) => !completedModuleSlugs.has(slug));

  return <main className="wrap section">
    <div className="account-header"><Link className="brand" href="/">promptly<b>.</b></Link><div className="account-top-actions">{profile?.role === "admin" && <Link className="all-link" href="/admin">Admin dashboard →</Link>}<form action={signOut}><button className="text-button" type="submit">Keluar</button></form></div></div>
    <section className="account-panel dashboard-panel">
      <div className="label">DASHBOARD BELAJAR</div><h1 className="page-heading">Progress belajarmu</h1><p className="account-email">{user.email}</p>
      <div className="account-plan"><div><small>PAKET</small><strong>{isPro ? "Promptly Pro" : "Free"}</strong></div><span>{isPro ? `Aktif sampai ${new Date(periodEnd).toLocaleDateString("id-ID")}` : "Semua konten belajar yang ada tersedia gratis"}</span></div>
      {dataUnavailable && <p className="auth-message auth-error" role="alert">Sebagian data dashboard belum dapat dimuat. Periksa penerapan schema Promptly dan kebijakan RLS di Supabase.</p>}
      <div className="progress-overview"><div><small>KEMAJUAN KESELURUHAN</small><strong>{progress}%</strong><span>{completedModuleSlugs.size} materi · {completedChallengeSlugs.size} challenge selesai</span></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
      <div className="stats-grid"><article><small>TOTAL QUIZ</small><strong>{attemptCount ?? attempts.length}</strong><span>termasuk percobaan ulang</span></article><article><small>MATERI SELESAI</small><strong>{completedModuleSlugs.size}/{moduleNames.size}</strong><span>tersimpan di akun</span></article><article><small>BEST SCORE</small><strong>{attempts.length ? Math.max(...attempts.map((attempt) => attempt.score)) : "—"}</strong><span>skor tertinggi dari riwayat termuat</span></article></div>
      <div className="dashboard-columns"><section><h2 className="account-subheading">Area untuk ditingkatkan</h2>{weakSkills.length ? <ul className="dashboard-list">{weakSkills.map(({ skill, score }) => <li key={skill}><span>{skill}</span><strong>{score}%</strong></li>)}</ul> : <p className="account-empty">{attempts.length ? "Belum ada area lemah yang menonjol dari jawaban tersimpan." : "Selesaikan quiz agar rekomendasi didasarkan pada jawabanmu."}</p>}</section>
        <section><h2 className="account-subheading">Rekomendasi berikutnya</h2>{recommendations.length ? <ul className="dashboard-list">{recommendations.map(({ skill, lesson, challenge }) => <li key={skill}><span>{skill}</span><div className="recommendation-links"><Link href={`/learn/${lesson}`}>Materi</Link><Link href={`/challenges/${challenge}`}>Challenge →</Link></div></li>)}</ul> : <Link className="all-link" href="/challenges">Pilih challenge pertama →</Link>}</section></div>
      <div className="dashboard-columns"><section><h2 className="account-subheading">Materi selesai</h2>{completedModuleSlugs.size ? <ul className="dashboard-list">{[...completedModuleSlugs].map((slug) => <li key={slug}><Link href={`/learn/${slug}`}>{moduleNames.get(slug) ?? slug}</Link><span>Selesai</span></li>)}</ul> : <p className="account-empty">Belum ada materi yang ditandai selesai.</p>}</section>
        <section><h2 className="account-subheading">Materi berikutnya</h2>{remainingModules.length ? <ul className="dashboard-list">{remainingModules.slice(0, 5).map(([slug, title]) => <li key={slug}><Link href={`/learn/${slug}`}>{title}</Link><span>Belum selesai</span></li>)}</ul> : <p className="account-empty">Semua materi yang tersedia sudah selesai.</p>}</section></div>
      <section><h2 className="account-subheading">Skor terbaik per challenge</h2>{bestScores.size ? <ul className="dashboard-list">{[...bestScores].map(([slug, score]) => <li key={slug}><Link href={`/challenges/${slug}`}>{challengeBySlug[slug] ?? dynamicChallenges.find((item) => item.slug === slug)?.title ?? slug}</Link><strong>{score}/100</strong></li>)}</ul> : <p className="account-empty">Belum ada quiz tersimpan. <Link className="auth-switch" href="/challenges">Mulai challenge →</Link></p>}</section>
      <section><h2 className="account-subheading">Riwayat quiz</h2>{attempts.length ? <div className="attempt-list">{attempts.slice(0, 30).map((attempt) => <article className="attempt-row" key={attempt.id}><div><strong>{challengeBySlug[attempt.challenge_slug] ?? dynamicChallenges.find((item) => item.slug === attempt.challenge_slug)?.title ?? attempt.challenge_slug}</strong><small>{new Date(attempt.created_at).toLocaleString("id-ID")}</small></div><span>{attempt.correct_answers}/{attempt.total_questions} benar · {attempt.score}/100</span></article>)}</div> : <p className="account-empty">Belum ada hasil yang tersimpan.</p>}</section>
      <div className="account-actions"><Link className="btn btn-main" href="/challenges">Lanjutkan belajar</Link><Link className="all-link" href="/pricing">Lihat paket yang tersedia →</Link></div>
      <p className="account-note">Progress dan riwayat berasal dari data Supabase milik akun ini. Skor quiz adalah latihan, bukan sertifikasi.</p>
    </section>
  </main>;
}
