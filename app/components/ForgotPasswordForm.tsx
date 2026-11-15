"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { requestPasswordReset } from "@/app/forgot-password/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="btn btn-main" type="submit" disabled={pending}>{pending ? "Mengirim…" : "Kirim link pemulihan"}</button>;
}

export default function ForgotPasswordForm({ error, message }: { error?: string; message?: string }) {
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <section className="auth-card question-card" aria-labelledby="forgot-title">
      <div className="label">PEMULIHAN AKUN</div>
      <h1 className="auth-heading" id="forgot-title">Lupa password?</h1>
      <p className="auth-copy">Masukkan email akunmu. Jika terdaftar, kami akan mengirim link untuk membuat password baru.</p>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      <form action={requestPasswordReset} className="auth-form">
        <label htmlFor="recovery-email">Email
          <input id="recovery-email" type="email" name="email" autoComplete="email" maxLength={254} required />
        </label>
        <SubmitButton />
      </form>
      <p className="auth-footnote"><Link className="auth-switch" href="/login">Kembali ke halaman masuk</Link></p>
    </section>
  </main>;
}
