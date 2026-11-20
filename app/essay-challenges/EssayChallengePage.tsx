import Link from "next/link";
import EssayChallengeForm from "@/app/components/EssayChallengeForm";
import { parseEssayQuota, resolveEssayAccess, type EssayAttemptRecord, type EssayChallenge } from "@/lib/essay-challenge";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EssayChallengePage({ challenge }: { challenge: EssayChallenge }) {
  const loginPath = `/essay-challenges/${challenge.slug}`;
  let supabase;
  try { supabase = await createClient(); }
  catch { return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Supabase belum dikonfigurasi. Halaman Pro belum tersedia.</p></main>; }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="essay-gate"><div className="label">PROMPTLY PRO</div><h1 className="essay-title">{challenge.title}</h1><p>Login untuk memeriksa akses Promptly Pro dan riwayat pengerjaanmu.</p><Link className="btn btn-main" href={`/login?next=${encodeURIComponent(loginPath)}`}>Masuk untuk melanjutkan</Link><Link className="page-back" href="/essay-challenges">← Semua Essay Challenge</Link></section></main>;

  const [{ data: isAdmin, error: adminError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.rpc("is_promptly_admin"),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  if (adminError || (isAdmin !== true && subscriptionError)) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Status akses belum dapat diverifikasi. Coba lagi nanti.</p></main>;
  const access = resolveEssayAccess(isAdmin === true ? "admin" : "user", subscription, process.env.PROMPTLY_ESSAY_ADMIN_TEST_ENABLED === "true");
  if (!access.allowed) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="essay-gate"><div className="label">PROMPTLY PRO</div><h1 className="essay-title">{challenge.title}</h1><p>Essay Challenge ini tersedia untuk akun Promptly Pro atau admin yang sudah diverifikasi. Pembayaran belum dibuka.</p><Link className="btn btn-alt" href="/pricing">Lihat paket</Link><Link className="page-back" href="/essay-challenges">← Semua Essay Challenge</Link></section></main>;

  const [{ data: publishedChallenge, error: challengeError }, { data: attempts, error: attemptsError }, { data: quotaData, error: quotaError }] = await Promise.all([
    supabase.from("essay_challenges").select("slug,title,instructions,topic").eq("slug", challenge.slug).eq("published", true).maybeSingle(),
    supabase.from("essay_attempts").select("id,answer,challenge_slug,criteria_scores,total_score,feedback,submitted_at").eq("user_id", user.id).eq("challenge_slug", challenge.slug).order("submitted_at", { ascending: false }).limit(20),
    supabase.rpc("get_promptly_essay_quota"),
  ]);
  if (challengeError || attemptsError) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Data challenge atau riwayat belum dapat dimuat. Pastikan migrasi essay sudah dijalankan.</p></main>;
  if (!publishedChallenge) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><p className="auth-message auth-error">Essay challenge belum diterbitkan di Supabase.</p></main>;
  return <main className="wrap essay-page"><div className="essay-top"><Link className="brand" href="/">promptly<b>.</b></Link><Link className="page-back" href="/essay-challenges">← Semua Essay Challenge</Link></div><EssayChallengeForm challenge={challenge} initialAttempts={(attempts ?? []) as EssayAttemptRecord[]} initialQuota={quotaError ? null : parseEssayQuota(quotaData)}/></main>;
}
