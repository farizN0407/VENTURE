import Link from "next/link";
import ResetPasswordForm from "@/app/components/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const recoveryVerified = cookieStore.get("promptly-password-recovery")?.value === "verified";
  let sessionVerified = false;
  if (recoveryVerified) {
    try {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      sessionVerified = Boolean(user && !authError);
    } catch { sessionVerified = false; }
  }

  if (!recoveryVerified || !sessionVerified) return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <section className="auth-card question-card" aria-labelledby="reset-expired-title">
      <div className="label">PEMULIHAN AKUN</div>
      <h1 className="auth-heading" id="reset-expired-title">Link pemulihan tidak tersedia</h1>
      <p className="auth-copy">Link mungkin kedaluwarsa, sudah digunakan, atau sesi recovery tidak valid. Minta link baru untuk melanjutkan.</p>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      <Link className="btn btn-main" href="/forgot-password">Kirim link baru</Link>
    </section>
  </main>;

  return <ResetPasswordForm error={error} />;
}
