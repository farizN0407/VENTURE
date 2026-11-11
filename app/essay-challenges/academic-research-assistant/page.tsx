import Link from "next/link";
import EssayChallengeForm from "@/app/components/EssayChallengeForm";
import { ESSAY_CHALLENGE, resolveEssayAccess, type EssayAttemptRecord } from "@/lib/essay-challenge";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AcademicResearchAssistantPage() {
  let supabase;
  try { supabase = await createClient(); }
  catch { return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Supabase belum dikonfigurasi. Halaman Pro belum tersedia.</p></main>; }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="essay-gate"><div className="label">PROMPTLY PRO</div><h1 className="essay-title">{ESSAY_CHALLENGE.title}</h1><p>Login untuk memeriksa akses Promptly Pro dan riwayat pengerjaanmu.</p><Link className="btn btn-main" href={`/login?next=${encodeURIComponent("/essay-challenges/academic-research-assistant")}`}>Masuk untuk melanjutkan</Link><Link className="page-back" href="/">← Kembali ke Promptly</Link></section></main>;

  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileError || subscriptionError) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Status akses belum dapat diverifikasi. Coba lagi nanti.</p></main>;
  const access = resolveEssayAccess(profile?.role, subscription, process.env.PROMPTLY_ESSAY_ADMIN_TEST_ENABLED === "true");
  if (!access.allowed) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="essay-gate"><div className="label">PROMPTLY PRO</div><h1 className="essay-title">{ESSAY_CHALLENGE.title}</h1><p>Essay Challenge ini tersedia untuk akun Promptly Pro. Pembayaran belum dibuka; status Pro hanya diberikan melalui subscription yang telah diverifikasi.</p><Link className="btn btn-alt" href="/pricing">Lihat paket</Link><Link className="page-back" href="/">← Kembali ke Promptly</Link></section></main>;

  const [{ data: challenge, error: challengeError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase.from("essay_challenges").select("slug,title,instructions,topic").eq("slug", ESSAY_CHALLENGE.slug).eq("published", true).maybeSingle(),
    supabase.from("essay_attempts").select("id,answer,criteria_scores,total_score,feedback,submitted_at").eq("user_id", user.id).eq("challenge_slug", ESSAY_CHALLENGE.slug).order("submitted_at", { ascending: false }).limit(20),
  ]);
  if (challengeError || attemptsError) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Data challenge atau riwayat belum dapat dimuat. Pastikan migrasi essay sudah dijalankan.</p></main>;
  if (!challenge) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Essay challenge belum diterbitkan di Supabase.</p></main>;
  return <main className="wrap essay-page"><div className="essay-top"><Link className="brand" href="/">promptly<b>.</b></Link><Link className="page-back" href="/">← Kembali ke Promptly</Link></div><EssayChallengeForm initialAttempts={(attempts ?? []) as EssayAttemptRecord[]}/></main>;
}
