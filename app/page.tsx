import Link from "next/link";
import { Clock3, BookOpenCheck, ChartNoAxesColumnIncreasing } from "lucide-react";
import { challenges } from "@/lib/challenges";
import { lessons } from "@/lib/learning";
import { createClient } from "@/lib/supabase/server";
import { calculateLiteracyProfile } from "@/lib/progress";
import { getPublishedModules, getPublishedChallenges, type PublicChallenge } from "@/lib/content";
import AccountMenu from "@/app/components/AccountMenu";
import { ESSAY_CHALLENGES, resolveEssayAccess } from "@/lib/essay-challenge";
import { getHomeEssayCta, type HomeEssayAccess } from "@/lib/home-essay-cta";
import HomeQuizGrid from "@/app/components/HomeQuizGrid";
import HomeMaterialsGrid from "@/app/components/HomeMaterialsGrid";

export const dynamic = "force-dynamic";

async function loadHomeProfile() {
 try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { profile: calculateLiteracyProfile([]), signedIn: false, available: true, username: null, email: null, essayAccess: "guest" as HomeEssayAccess };
  const [profileResult, attemptsResult, adminResult, subscriptionResult] = await Promise.all([
   supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
   supabase.from("quiz_attempts").select("content_domain,score,skill_results,answer_details").eq("user_id", user.id).eq("content_domain", "ai_literacy"),
   supabase.rpc("is_promptly_admin"),
   supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  const role = adminResult.data === true ? "admin" : "user";
  const essayAccess: HomeEssayAccess = adminResult.data === true
   ? "admin"
   : adminResult.error || subscriptionResult.error
    ? "unavailable"
    : resolveEssayAccess(role, subscriptionResult.data, process.env.PROMPTLY_ESSAY_ADMIN_TEST_ENABLED === "true").isPro ? "pro" : "free";
  if (attemptsResult.error) return { profile: calculateLiteracyProfile([]), signedIn: true, available: false, username: profileResult.data?.username ?? null, email: user.email ?? null, essayAccess };
  return { profile: calculateLiteracyProfile(attemptsResult.data ?? []), signedIn: true, available: true, username: profileResult.data?.username ?? null, email: user.email ?? null, essayAccess };
 } catch {
  return { profile: calculateLiteracyProfile([]), signedIn: false, available: true, username: null, email: null, essayAccess: "guest" as HomeEssayAccess };
 }
}

export default async function Home() {
 const homeProfile = await loadHomeProfile();
 let databaseLessons = [] as Awaited<ReturnType<typeof getPublishedModules>>;
 let databaseChallenges = [] as PublicChallenge[];
 let modulesUnavailable = false;
 let challengesUnavailable = false;
 try { databaseLessons = await getPublishedModules(); } catch { modulesUnavailable = true; }
 try { databaseChallenges = await getPublishedChallenges(); } catch { challengesUnavailable = true; }
 const homepageLessons = [...new Map([...lessons, ...databaseLessons].map((lesson) => [lesson.slug, lesson])).values()];
 const homepageChallenges = [...challenges.map((challenge) => ({ slug: challenge.slug, title: challenge.title, category: challenge.category, description: challenge.description })), ...databaseChallenges.filter((challenge) => !challenges.some((item) => item.slug === challenge.slug))];
 const essayCta = getHomeEssayCta(homeProfile.essayAccess, homeProfile.email);
 return <>
   <div className="hero-shell"><div className="wrap"><header className="hero" id="top">
   <nav className="nav" aria-label="Navigasi utama"><Link className="brand" href="/">promptly<b>.</b></Link><div className="navlinks"><a href="#challenges">Challenges</a><Link href="/learn">Materi</Link><Link href="/how-it-works">Cara kerja</Link><a href="#about">Tentang</a><Link href="/pricing">Paket</Link></div><div className="nav-account-actions">{homeProfile.signedIn ? <AccountMenu username={homeProfile.username} email={homeProfile.email}/> : <><Link className="nav-login" href="/login?next=%2F">Masuk</Link><Link className="nav-login" href="/register">Daftar</Link></>}</div><Link className="nav-cta" href="/challenges">Mulai challenge →</Link></nav>
   <div className="hero-content"><div className="label">AI literacy untuk mahasiswa</div><h1>How smart are you with <span>AI?</span></h1><p>Belajar pakai AI dengan lebih cerdas, satu challenge singkat dalam satu waktu. Mulai dari cara menulis prompt yang jelas.</p><div className="buttons"><Link className="btn btn-main" href="/challenges">Mulai challenge pertama <b>↗</b></Link><a className="btn btn-alt" href="#challenges">Jelajahi challenge <b>→</b></a></div><div className="meta"><span><i><Clock3 size={13}/></i> 3–5 menit</span><span><i><BookOpenCheck size={13}/></i> Kuis interaktif</span><span><i><ChartNoAxesColumnIncreasing size={13}/></i> Skor AI</span></div></div>
   <div className="hero-picture" aria-hidden="true"><div className="hero-graphic">AI?</div></div>
  </header></div></div>
  <div className="proof"><span>Belajar sambil praktik</span><span>Dibuat untuk mahasiswa</span><span>Tanpa pengalaman pun bisa</span></div>
  <main>
   <section className="section wrap" id="challenges"><div className="head"><div><div className="label">Pilih latihanmu</div><h2>Belajar lewat challenge</h2><p>Latihan singkat untuk membantu kamu memakai AI dengan lebih kritis dan efektif.</p></div><Link className="all-link" href="/challenges">Lihat semua challenge →</Link></div><HomeQuizGrid quizzes={homepageChallenges}/>{challengesUnavailable && <p className="auth-message auth-error" role="alert">Daftar challenge Supabase belum dapat dimuat. Challenge bawaan tetap tersedia; periksa koneksi, izin SELECT, dan RLS.</p>}</section>
   <section className="section wrap essay-summary-section" aria-labelledby="essay-summary-title"><div className="head"><div><div className="label">PROMPTLY PRO</div><h2 id="essay-summary-title">AI Essay Challenge</h2><p>Tulis prompt untuk skenario nyata dan dapatkan evaluasi AI dengan empat kriteria.</p></div><Link className="all-link" href="/essay-challenges">Semua Essay Challenge →</Link></div><article className="challenge pro-challenge essay-summary-card"><div><div className="num">{ESSAY_CHALLENGES.length} TANTANGAN / PROMPTING</div><h3>Latihan menulis prompt dengan evaluasi mendalam</h3><p>{homeProfile.essayAccess === "free" ? "Fitur Promptly Pro Rp29.000/30 hari. Langganan manual melalui WhatsApp; akses aktif setelah pembayaran diverifikasi." : homeProfile.essayAccess === "unavailable" ? "Status akses belum dapat diverifikasi. Buka daftar tantangan untuk informasi akses." : "Pilih salah satu skenario essay Promptly Pro dan pelajari kekuatan serta perbaikan prompt-mu."}</p></div><div className="essay-summary-actions">{essayCta.href.startsWith("https://wa.me/") ? <a className="play-link" href={essayCta.href} target="_blank" rel="noopener noreferrer">{essayCta.label} →</a> : <Link className="play-link" href={essayCta.href}>{essayCta.label} →</Link>}<Link className="page-back" href="/essay-challenges">Lihat semua tantangan</Link></div></article></section>
   <section className="section wrap" id="learn"><div className="head"><div><div className="label">Materi singkat</div><h2>Bangun skill yang bisa dipakai.</h2><p>Mulai dari satu prinsip praktis, lihat contohnya, lalu coba lewat quiz yang terhubung.</p></div><Link className="all-link" href="/learn">Semua materi →</Link></div><HomeMaterialsGrid materials={homepageLessons}/>{modulesUnavailable && <p className="auth-message auth-error" role="alert">Materi Supabase belum dapat dimuat. Materi bawaan tetap tersedia; periksa koneksi, izin SELECT, dan RLS.</p>}</section>
   <section className="section profile-bg" id="profile"><div className="wrap two-col"><div className="intro"><div className="label">Lihat perkembanganmu</div><h2>Profil literasi AI<br/>yang jelas.</h2><p>Skor dihitung dari quiz yang sudah diselesaikan. Membuka materi atau memulai quiz tidak menaikkan nilai.</p><Link className="all-link" href={homeProfile.signedIn ? "/account" : "/login?next=%2Faccount"}>{homeProfile.signedIn ? "Buka dashboard belajarmu →" : "Masuk untuk menyimpan progres →"}</Link></div><div className="profile"><div className="profile-title"><h3>AI Literacy Profile</h3><span className="level">{homeProfile.available ? homeProfile.profile.status.toUpperCase() : "BELUM TERSEDIA"}</span></div><div className="score"><div className="circle" style={{background:`conic-gradient(var(--blue) 0 ${homeProfile.available ? homeProfile.profile.overallScore ?? 0 : 0}%, #e9eff4 ${homeProfile.available ? homeProfile.profile.overallScore ?? 0 : 0}% 100%)`}}><b>{homeProfile.available ? homeProfile.profile.overallScore ?? "—" : "—"}</b></div><div><small>SKOR KESELURUHAN</small><strong>{homeProfile.available ? homeProfile.profile.status : "Progres belum dapat dimuat"}</strong><small>{homeProfile.signedIn ? `${homeProfile.profile.completedAttempts} quiz AI literacy selesai` : "Mulai dari 0 · skor guest tidak disimpan"}</small></div></div>{homeProfile.profile.skills.map(skill=><div className="skill" key={skill.name}><span>{skill.name}</span><div className="bar"><i style={{width:`${homeProfile.available ? skill.score ?? 0 : 0}%`}}/></div><em>{homeProfile.available ? skill.score === null ? "Belum ada data" : `${skill.score}%` : "—"}</em></div>)}<p className="profile-method">Skor keseluruhan adalah rata-rata quiz AI literacy. Skor skill hanya memakai jawaban soal yang dipetakan ke skill tersebut.</p></div></div></section>
   <section className="badges-section" id="badges"><div className="wrap"><div className="head"><div><div className="label">Pencapaianmu</div><h2>Progress yang layak dirayakan.</h2><p>Badge bisa menjadi penanda skill yang sudah kamu latih.</p></div></div><div className="badges"><div className="badge"><b>First Challenge</b><span>Selesaikan challenge pertamamu</span></div><div className="badge"><b>Prompt Master</b><span>Tulis prompt yang jelas dan terarah</span></div><div className="badge"><b>Fact Checker</b><span>Periksa klaim dengan teliti</span></div><div className="badge"><b>Critical Thinker</b><span>Evaluasi jawaban AI</span></div><div className="badge"><b>AI Literacy Master</b><span>Kuasai semua kategori skill</span></div></div><div className="cta"><div><h2>Mulai belajar AI dengan lebih cerdas.</h2><p>Ambil challenge pertamamu dan lihat apa yang bisa kamu pelajari.</p></div><Link className="btn" href="/challenges">Mulai challenge <b>↗</b></Link></div></div></section>
  </main>
  <footer><div className="wrap"><div className="foot-top"><div className="foot-brand" id="about"><Link className="brand" href="/">promptly<b>.</b></Link><p>Belajar menggunakan AI dengan lebih jelas, kritis, dan bertanggung jawab.</p></div><div className="foot-col"><strong>Menu</strong><Link href="/">Home</Link><Link href="/challenges">Challenges</Link>{!homeProfile.signedIn && <><Link href="/login?next=%2F">Masuk</Link><Link href="/register">Daftar</Link></>}</div><div className="foot-col"><strong>Belajar</strong><Link href="/learn">Materi</Link><a href="#about">Tentang Promptly</a><Link href="/pricing">Paket</Link></div><div className="foot-col"><strong>Kontak</strong><a href="mailto:halo@promptly.study">Contact</a></div></div><div className="copyright"><span>© 2026 Promptly</span><span>Belajar AI, satu challenge dalam satu waktu.</span></div></div></footer>
 </>;
}
