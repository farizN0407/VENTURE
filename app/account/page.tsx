import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateUsername } from "@/app/auth/actions";
import AccountMenu from "@/app/components/AccountMenu";
import { usernameLabel } from "@/lib/username";
import { challenges } from "@/lib/challenges";
import { lessons } from "@/lib/learning";
import { resolvePlan } from "@/lib/entitlements";
import { calculateLiteracyProfile, isAiLiteracyAttempt } from "@/lib/progress";

type Attempt = { id: number; challenge_slug: string; content_domain: string | null; score: number; correct_answers: number; total_questions: number; created_at: string; skill_results: { skill: string; correct: number; total: number; score: number }[] | null; answer_details: { skill?: string; is_correct?: boolean }[] | null };
type ModuleRow = { slug: string; title: string };
const challengeBySlug = Object.fromEntries(challenges.map((challenge) => [challenge.slug, challenge.title]));
const nextBySkill: Record<string, { lesson: string; challenge: string }> = {
  Prompting: { lesson: "prompting", challenge: "fix-the-prompt" }, "Critical Thinking": { lesson: "critical-thinking", challenge: "critical-thinking" },
  "Fact Checking": { lesson: "fact-checking", challenge: "can-you-trust-ai" }, "AI Knowledge": { lesson: "ai-knowledge", challenge: "ai-or-human" },
  "Practical Application": { lesson: "practical-application", challenge: "ai-in-real-life" },
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  let supabase;
  try { supabase = await createClient(); } catch {
    return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Akun belum tersambung</h1><p>Autentikasi memerlukan URL dan publishable key Supabase. Penyimpanan progres juga memerlukan secret key server-side serta schema Promptly.</p><Link className="btn btn-main" href="/challenges">Lanjut ke challenge sebagai tamu</Link></section></main>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Masuk untuk melihat progres.</h1><p>Hasil quiz dan penyelesaian materi tersimpan hanya setelah kamu masuk dan Supabase siap. Challenge tetap bisa dicoba sebagai tamu.</p><div className="buttons"><Link className="btn btn-main" href="/login?next=%2Faccount">Masuk atau daftar</Link><Link className="btn btn-alt" href="/challenges">Lanjut sebagai tamu</Link></div></section></main>;

  const [{ data: attemptsData, error: attemptsError }, { data: completionData, error: completionError }, { data: subscription, error: subscriptionError }, { data: loadedProfile, error: profileError }, { data: moduleData, error: moduleError }, { data: challengeData, error: challengeError }] = await Promise.all([
    supabase.from("quiz_attempts").select("id,challenge_slug,content_domain,score,correct_answers,total_questions,created_at,skill_results,answer_details").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
    supabase.from("module_completions").select("module_slug,completed_at").eq("user_id", user.id),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("role,username").eq("id", user.id).maybeSingle(),
    supabase.from("learning_modules").select("slug,title").eq("published", true).eq("content_domain", "ai_literacy"),
    supabase.from("challenges").select("slug,title").eq("published", true).eq("content_domain", "ai_literacy"),
  ]);
  const attempts = (attemptsData ?? []) as Attempt[];
  const literacyAttempts = attempts.filter(isAiLiteracyAttempt);
  const excludedAttemptCount = attempts.length - literacyAttempts.length;
  const literacyProfile = calculateLiteracyProfile(literacyAttempts);
  const completions = (completionData ?? []) as { module_slug: string; completed_at: string }[];
  const dynamicModules = (moduleData ?? []) as ModuleRow[];
  const dynamicChallenges = (challengeData ?? []) as ModuleRow[];
  const moduleNames = new Map([...lessons.map((item) => [item.slug, item.title] as const), ...dynamicModules.map((item) => [item.slug, item.title] as const)]);
  const completedModuleSlugs = new Set(completions.map((item) => item.module_slug).filter((slug) => moduleNames.has(slug)));
  const availableChallengeSlugs = new Set([...challenges.map((item) => item.slug), ...dynamicChallenges.map((item) => item.slug)]);
  const completedChallengeSlugs = new Set(attempts.map((item) => item.challenge_slug).filter((slug) => availableChallengeSlugs.has(slug)));
  const availableChallengeCount = challenges.length + dynamicChallenges.filter((item) => !challengeBySlug[item.slug]).length;
  const totalItems = moduleNames.size + availableChallengeCount;
  const progress = totalItems ? Math.round((completedModuleSlugs.size + completedChallengeSlugs.size) * 100 / totalItems) : 0;

  const bestScores = new Map<string, number>();
  for (const attempt of literacyAttempts) {
    bestScores.set(attempt.challenge_slug, Math.max(bestScores.get(attempt.challenge_slug) ?? 0, attempt.score));
  }
  const weakSkills = literacyProfile.skills.filter((skill) => skill.total > 0 && skill.score !== null && skill.score < 80).sort((a, b) => a.score! - b.score!).slice(0, 3);
  const unassessedSkills = literacyProfile.skills.filter((skill) => skill.total === 0);
  const recommendationSkills = [...unassessedSkills, ...weakSkills].slice(0, 3);
  const recommendations = recommendationSkills.map(({ name }) => ({ skill: name, ...(nextBySkill[name] ?? nextBySkill.Prompting) }));
  const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : 0;
  const isPro = resolvePlan(subscription) === "pro";
  const dataUnavailable = Boolean(attemptsError || completionError || subscriptionError || moduleError || challengeError);
  const remainingModules = [...moduleNames].filter(([slug]) => !completedModuleSlugs.has(slug));
  let profile: { role?: string; username?: string | null } | null = loadedProfile;
  if (profileError) {
    const legacyProfile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    profile = legacyProfile.data;
  }
  const identity = usernameLabel(profile?.username, user.email);

  return <main className="wrap section">
    <div className="account-header"><Link className="brand" href="/">promptly<b>.</b></Link><div className="account-top-actions">{profile?.role === "admin" && <Link className="all-link" href="/admin">Admin dashboard →</Link>}<AccountMenu username={profile?.username} email={user.email}/></div></div>
    <section className="account-panel dashboard-panel">
      <div className="label">DASHBOARD BELAJAR</div><h1 className="page-heading">Progress belajarmu</h1><p className="account-email">{user.email}</p>
      {query.error && <p className="auth-message auth-error" role="alert">{query.error}</p>}
      {query.saved === "username" && <p className="auth-message" role="status">Username berhasil diperbarui.</p>}
      <section className="account-username-settings"><div><h2 className="account-subheading">Identitas akun</h2><p>Username saat ini: <strong>@{identity}</strong>. Username bersifat publik pada sapaan aplikasi; email tetap digunakan untuk login.</p></div><form action={updateUsername} className="username-form"><label htmlFor="account-username">Atur atau ganti username</label><div><span aria-hidden="true">@</span><input id="account-username" name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_]{2,23}" defaultValue={profile?.username ?? ""} autoComplete="nickname" aria-describedby="account-username-help"/><button className="btn btn-main" type="submit">Simpan username</button></div><small id="account-username-help">3–24 karakter; huruf, angka, dan underscore. Disimpan dalam huruf kecil.</small></form></section>
      {dataUnavailable && <p className="auth-message auth-error" role="alert">Sebagian data dashboard belum dapat dimuat. Periksa penerapan schema Promptly di Supabase, termasuk migrasi domain konten.</p>}
      <section className="profile account-literacy-profile"><div className="profile-title"><h2>AI Literacy Profile</h2><span className="level">{attemptsError ? "BELUM TERSEDIA" : literacyProfile.status.toUpperCase()}</span></div><div className="score"><div className="circle"><b>{attemptsError ? "—" : literacyProfile.overallScore ?? "—"}</b></div><div><small>SKOR KESELURUHAN</small><strong>{attemptsError ? "Progres belum dapat dimuat" : literacyProfile.status}</strong><small>{attemptsError ? "Periksa koneksi dan kebijakan Supabase" : `${literacyProfile.completedAttempts} quiz AI literacy selesai`}</small></div></div><p className="profile-method">Skor keseluruhan adalah rata-rata hasil quiz AI literacy yang tersimpan. Skor tiap skill dihitung dari jawaban per soal yang memiliki pemetaan skill tersebut. Skill yang belum diuji ditandai sebagai belum ada data.</p>{literacyProfile.skills.map((skill) => <div className="skill" key={skill.name}><span>{skill.name}</span><div className="bar"><i style={{ width: `${attemptsError ? 0 : skill.score ?? 0}%` }} /></div><em>{attemptsError ? "—" : skill.score === null ? "Belum ada data" : `${skill.score}%`}</em></div>)}</section>
      <div className="account-plan"><div><small>PAKET</small><strong>{isPro ? "Promptly Pro" : "Free"}</strong></div><span>{isPro ? `Aktif sampai ${new Date(periodEnd).toLocaleDateString("id-ID")}` : "Semua konten belajar yang ada tersedia gratis"}</span></div>
      <div className="progress-overview"><div><small>KEMAJUAN KESELURUHAN</small><strong>{progress}%</strong><span>{completedModuleSlugs.size} materi · {completedChallengeSlugs.size} challenge selesai</span></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
      <div className="stats-grid"><article><small>TOTAL QUIZ AI LITERACY</small><strong>{literacyAttempts.length}</strong><span>percobaan yang memiliki hasil skill AI literacy</span></article><article><small>MATERI SELESAI</small><strong>{completedModuleSlugs.size}/{moduleNames.size}</strong><span>tersimpan di akun</span></article><article><small>BEST SCORE AI LITERACY</small><strong>{literacyAttempts.length ? Math.max(...literacyAttempts.map((attempt) => attempt.score)) : "—"}</strong><span>rata-rata profil hanya memakai quiz relevan</span></article></div>
      <div className="dashboard-columns"><section><h2 className="account-subheading">Area untuk ditingkatkan</h2>{weakSkills.length ? <ul className="dashboard-list">{weakSkills.map(({ name, score }) => <li key={name}><span>{name}</span><strong>{score}%</strong></li>)}</ul> : <p className="account-empty">{literacyAttempts.length ? "Belum ada area lemah yang menonjol pada skill yang sudah diuji." : "Selesaikan quiz AI literacy agar rekomendasi didasarkan pada jawabanmu."}</p>}</section>
        <section><h2 className="account-subheading">Rekomendasi berikutnya</h2>{recommendations.length ? <ul className="dashboard-list">{recommendations.map(({ skill, lesson, challenge }) => <li key={skill}><span>{skill}</span><div className="recommendation-links"><Link href={`/learn/${lesson}`}>Materi</Link><Link href={`/challenges/${challenge}`}>Challenge →</Link></div></li>)}</ul> : <Link className="all-link" href="/challenges">Pilih challenge pertama →</Link>}</section></div>
      <div className="dashboard-columns"><section><h2 className="account-subheading">Materi selesai</h2>{completedModuleSlugs.size ? <ul className="dashboard-list">{[...completedModuleSlugs].map((slug) => <li key={slug}><Link href={`/learn/${slug}`}>{moduleNames.get(slug) ?? slug}</Link><span>Selesai</span></li>)}</ul> : <p className="account-empty">Belum ada materi yang ditandai selesai.</p>}</section>
        <section><h2 className="account-subheading">Materi berikutnya</h2>{remainingModules.length ? <ul className="dashboard-list">{remainingModules.slice(0, 5).map(([slug, title]) => <li key={slug}><Link href={`/learn/${slug}`}>{title}</Link><span>Belum selesai</span></li>)}</ul> : <p className="account-empty">Semua materi yang tersedia sudah selesai.</p>}</section></div>
      <section><h2 className="account-subheading">Skor terbaik per challenge</h2>{bestScores.size ? <ul className="dashboard-list">{[...bestScores].map(([slug, score]) => <li key={slug}><Link href={`/challenges/${slug}`}>{challengeBySlug[slug] ?? dynamicChallenges.find((item) => item.slug === slug)?.title ?? slug}</Link><strong>{score}/100</strong></li>)}</ul> : <p className="account-empty">Belum ada quiz AI literacy tersimpan. <Link className="auth-switch" href="/challenges">Mulai challenge →</Link></p>}</section>
      <section><h2 className="account-subheading">Riwayat quiz AI literacy</h2>{literacyAttempts.length ? <div className="attempt-list">{literacyAttempts.slice(0, 30).map((attempt) => <article className="attempt-row" key={attempt.id}><div><strong>{challengeBySlug[attempt.challenge_slug] ?? dynamicChallenges.find((item) => item.slug === attempt.challenge_slug)?.title ?? attempt.challenge_slug}</strong><small>{new Date(attempt.created_at).toLocaleString("id-ID")}</small></div><span>{attempt.correct_answers}/{attempt.total_questions} benar · {attempt.score}/100</span></article>)}</div> : <p className="account-empty">Belum ada hasil quiz AI literacy yang tersimpan.</p>}{excludedAttemptCount > 0 && <p className="account-note">{excludedAttemptCount} percobaan domain lama atau belum diklasifikasikan tidak dihitung dalam profil AI Literacy. Hasil aslinya tetap tersimpan di Supabase.</p>}</section>
      <div className="account-actions"><Link className="btn btn-main" href="/challenges">Lanjutkan belajar</Link><Link className="all-link" href="/pricing">Lihat paket yang tersedia →</Link></div>
      <p className="account-note">Progress dan riwayat berasal dari data Supabase milik akun ini. Skor quiz adalah latihan, bukan sertifikasi.</p>
    </section>
  </main>;
}
