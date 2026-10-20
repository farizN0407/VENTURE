import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { usernameLabel } from "@/lib/username";

export default function AccountMenu({ username, email }: { username?: string | null; email?: string | null }) {
  const label = usernameLabel(username, email);
  return <details className="account-menu">
    <summary className="account-menu-trigger"><span>Hi, {label}!</span><span className="account-menu-caret" aria-hidden="true">⌄</span></summary>
    <div className="account-menu-panel">
      <div className="account-menu-identity"><strong>@{label}</strong><span>{email || "Email tidak tersedia"}</span></div>
      <Link href="/account">Akun Saya</Link>
      <form action={signOut}><button type="submit">Keluar</button></form>
    </div>
  </details>;
}
