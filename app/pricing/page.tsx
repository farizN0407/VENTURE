import Link from "next/link";
import { ESSAY_CHALLENGES } from "@/lib/essay-challenge";
import { createClient } from "@/lib/supabase/server";
import { buildPromptlyProWhatsAppUrl, PROMPTLY_PRO_PRICE } from "@/lib/promptly-pro-whatsapp";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  let accountEmail: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    accountEmail = user?.email ?? null;
  } catch {
    // Keep the editable email placeholder when there is no usable auth session.
  }
  const whatsappUrl = buildPromptlyProWhatsAppUrl(accountEmail);

  return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link>
    <div style={{ textAlign: "center", marginTop: 55 }}>
      <div className="label">PILIH CARA BELAJARMU</div>
      <h1 className="page-heading pricing-heading">Mulai belajar AI dengan latihan nyata.</h1>
      <p className="pricing-intro">Materi dan quiz pilihan ganda tetap gratis. Promptly Pro menyediakan Essay Challenge AI melalui langganan manual.</p>
    </div>
    {checkout === "unavailable" && <p className="auth-message" role="status">Checkout otomatis tidak digunakan. Langganan Promptly Pro dilakukan manual melalui WhatsApp.</p>}
    <div className="pricing-grid">
      <article className="plan">
        <h3>Free</h3><p>Semua fitur belajar gratis yang tersedia.</p>
        <div className="price">Rp0 <small>/ gratis</small></div>
        <ul><li>Materi singkat AI literacy</li><li>Challenge pilihan ganda</li><li>Feedback, penjelasan, dan skor</li><li>Penyimpanan hasil di akun jika Supabase dikonfigurasi</li></ul>
        <Link className="btn btn-alt" href="/challenges">Mulai belajar</Link>
      </article>
      <article className="plan featured">
        <span className="pill">BERLANGGANAN MANUAL</span>
        <h3>Promptly Pro</h3>
        <p>Essay Challenge dengan evaluasi AI untuk akun Pro yang terverifikasi.</p>
        <div className="price">{PROMPTLY_PRO_PRICE} <small>/ 30 hari</small></div>
        <ul>{ESSAY_CHALLENGES.map((challenge) => <li key={challenge.slug}>{challenge.title}</li>)}<li>Empat skor rubrik, feedback, dan contoh prompt</li><li>Riwayat evaluasi tersimpan ke akun</li></ul>
        <a className="btn btn-main" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Berlangganan via WhatsApp</a>
        <Link className="play-link" href="/essay-challenges">Lihat Essay Challenges</Link>
        <p className="pricing-note">Pembayaran dilakukan manual melalui WhatsApp. Admin akan memberikan metode dan instruksi pembayaran. Akses Pro diaktifkan setelah pembayaran diterima dan diverifikasi. Langganan berlaku 30 hari tanpa perpanjangan otomatis.</p>
      </article>
    </div>
    <p className="page-back"><Link href="/">← Kembali ke Promptly</Link><span> · </span><Link href="/account">Lihat akun</Link></p>
  </main>;
}
