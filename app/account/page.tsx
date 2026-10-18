import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

type Attempt = { id: number; challenge_slug: string; score: number; correct_answers: number; total_questions: number; created_at: string };
const challengeTitles: Record<string, string> = { "prompt-battle": "Prompt Battle", "can-you-trust-ai": "Can You Trust AI?", "fix-the-prompt": "Fix the Prompt", "ai-or-human": "AI or Human?", "ai-in-real-life": "AI in Real Life", "ai-for-research": "AI for Research", "critical-thinking": "Think Critically with AI", "responsible-ai": "Use AI Responsibly" };

export default async function AccountPage() {
  let supabase;
  try { supabase = await createClient(); } catch {
    return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Akun belum tersambung</h1><p>Autentikasi belum aktif karena konfigurasi Supabase belum tersedia. Tambahkan URL project dan anon key ke environment lokal atau Vercel setelah membuat project Supabase.</p><Link className="btn btn-main" href="/challenges">Lanjut ke challenge</Link></section></main>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">AKUN</div><h1 className="page-heading">Masuk untuk melihat progres.</h1><p>Hasil quiz dapat disimpan ke akun Supabase setelah konfigurasi tersedia. Kamu tetap dapat mengerjakan challenge tanpa akun.</p><div className="buttons"><Link className="btn btn-main" href="/login?next=%2Faccount">Masuk atau daftar</Link><Link className="btn btn-alt" href="/challenges">Lanjut sebagai tamu</Link></div></section></main>;

  const [{ data: attempts, error: attemptsError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("quiz_attempts").select("id,challenge_slug,score,correct_answers,total_questions,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : 0;
  const isPro = ["active", "trialing"].includes(subscription?.status ?? "") && periodEnd > Date.now();
  const dataUnavailable = attemptsError || subscriptionError;
  return <main className="wrap section"><div className="account-header"><Link className="brand" href="/">promptly<b>.</b></Link><form action={signOut}><button className="text-button" type="submit">Keluar</button></form></div><section className="account-panel"><div className="label">AKUN PROMPTLY</div><h1 className="page-heading">Progress belajarmu</h1><p className="account-email">{user.email}</p><div className="account-plan"><div><small>PAKET</small><strong>{isPro ? "Promptly Pro" : "Free"}</strong></div><span>{isPro ? `Aktif sampai ${new Date(periodEnd).toLocaleDateString("id-ID")}` : "Challenge dan materi gratis tersedia"}</span></div>{dataUnavailable ? <p className="auth-message auth-error">Data akun tidak dapat dimuat. Pastikan schema Supabase terbaru sudah diterapkan.</p> : <><h2 className="account-subheading">Hasil quiz terbaru</h2>{(attempts as Attempt[]).length ? <div className="attempt-list">{(attempts as Attempt[]).map((attempt) => <article className="attempt-row" key={attempt.id}><div><strong>{challengeTitles[attempt.challenge_slug] ?? attempt.challenge_slug}</strong><small>{new Date(attempt.created_at).toLocaleString("id-ID")}</small></div><span>{attempt.correct_answers}/{attempt.total_questions} benar · {attempt.score}/100</span></article>)}</div> : <p className="account-empty">Belum ada hasil tersimpan. Selesaikan quiz saat masuk untuk mencatat percobaan berikutnya.</p>}</>}
    <div className="account-actions"><Link className="btn btn-main" href="/challenges">Lanjutkan belajar</Link><Link className="all-link" href="/pricing">Lihat paket yang tersedia →</Link></div>
    <p className="account-note">Progres ditampilkan dari hasil yang berhasil disimpan ke akun Supabase. Skor quiz adalah latihan, bukan sertifikasi.</p></section></main>;
}
