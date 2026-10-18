"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { signIn, signUp } from "@/app/auth/actions";

function SubmitButton({ mode }: { mode: "login" | "register" }) {
  const { pending } = useFormStatus();
  const label = mode === "login" ? "Masuk" : "Buat akun";
  return <button className="btn btn-main" type="submit" disabled={pending} aria-disabled={pending}>
    {pending ? "Memproses…" : label}
  </button>;
}

export default function AuthForm({
  mode,
  error,
  message,
  next = "/account",
}: {
  mode: "login" | "register";
  error?: string;
  message?: string;
  next?: string;
}) {
  const isLogin = mode === "login";
  return <main className="wrap section">
    <Link className="brand" href="/">promptly<b>.</b></Link>
    <section className="auth-card question-card" aria-labelledby="auth-title">
      <div className="label">AKUN PROMPTLY</div>
      <h1 className="auth-heading" id="auth-title">{isLogin ? "Masuk ke Promptly" : "Buat akun Promptly"}</h1>
      <p className="auth-copy">{isLogin
        ? "Masuk untuk melihat progres dan menyimpan hasil quiz. Kamu tetap bisa mencoba challenge tanpa akun."
        : "Simpan hasil quiz dan lanjutkan progres belajarmu. Challenge dasar tetap bisa dicoba sebagai tamu."}</p>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      <form action={isLogin ? signIn : signUp} className="auth-form">
        {isLogin && <input type="hidden" name="next" value={next} />}
        <label htmlFor={`${mode}-email`}>Email
          <input id={`${mode}-email`} type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <label htmlFor={`${mode}-password`}>Password
          <input id={`${mode}-password`} type="password" name="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} />
        </label>
        {!isLogin && <p className="auth-footnote">Gunakan minimal 8 karakter. Konfirmasi email dapat diperlukan sesuai pengaturan Supabase.</p>}
        <SubmitButton mode={mode} />
      </form>
      <p className="auth-footnote">{isLogin ? "Belum punya akun?" : "Sudah punya akun?"} {" "}
        <Link className="auth-switch" href={isLogin ? "/register" : "/login"}>{isLogin ? "Daftar di sini" : "Masuk di sini"}</Link>
      </p>
      <div className="auth-divider">atau</div>
      <Link className="btn btn-alt auth-guest" href="/challenges">Lanjut sebagai tamu</Link>
      <p className="auth-footnote">Akun dan penyimpanan progres memerlukan konfigurasi Supabase. Hasil tamu hanya tersedia selama sesi quiz.</p>
    </section>
  </main>;
}
