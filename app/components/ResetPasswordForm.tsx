"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { updateRecoveredPassword } from "@/app/reset-password/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="btn btn-main" type="submit" disabled={pending}>{pending ? "Memperbarui…" : "Simpan password baru"}</button>;
}

export default function ResetPasswordForm({ error }: { error?: string }) {
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <section className="auth-card question-card" aria-labelledby="reset-title">
      <div className="label">PEMULIHAN AKUN</div>
      <h1 className="auth-heading" id="reset-title">Buat password baru</h1>
      <p className="auth-copy">Gunakan password baru minimal 8 karakter, lalu konfirmasikan sebelum menyimpan.</p>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      <form action={updateRecoveredPassword} className="auth-form">
        <label htmlFor="new-password">Password baru
          <input id="new-password" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} required />
        </label>
        <label htmlFor="confirm-password">Konfirmasi password baru
          <input id="confirm-password" type="password" name="password_confirmation" autoComplete="new-password" minLength={8} maxLength={72} required />
        </label>
        <SubmitButton />
      </form>
      <p className="auth-footnote"><Link className="auth-switch" href="/forgot-password">Minta link pemulihan baru</Link></p>
    </section>
  </main>;
}
