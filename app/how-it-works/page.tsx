import Link from "next/link";

export default function HowItWorksPage() {
  return <main className="wrap section how-page">
    <div className="essay-top"><Link className="brand" href="/">promptly<b>.</b></Link><Link className="page-back" href="/">← Kembali ke Promptly</Link></div>
    <section className="how-page-content" aria-labelledby="how-title">
      <div className="label">Alurnya sederhana</div>
      <h1 className="page-heading" id="how-title">Learn → Play → Improve</h1>
      <p className="how-page-intro">Tiga langkah singkat untuk belajar AI lewat praktik, bukan teori panjang.</p>
      <div className="steps">
        <article className="step"><div className="n">01 / LEARN</div><h2>Pelajari satu prinsip</h2><p>Baca materi AI literacy yang ringkas, lalu lihat contoh yang dekat dengan tugas kuliah.</p><Link className="play-link" href="/learn">Jelajahi materi →</Link></article>
        <article className="step"><div className="n">02 / PLAY</div><h2>Coba lewat challenge</h2><p>Kerjakan quiz berbasis skenario dan pilih cara memakai AI yang paling tepat.</p><Link className="play-link" href="/challenges">Pilih challenge →</Link></article>
        <article className="step"><div className="n">03 / IMPROVE</div><h2>Pahami dan lanjutkan</h2><p>Lihat skor, feedback, serta rekomendasi materi untuk langkah belajarmu berikutnya.</p><Link className="play-link" href="/challenges">Lihat rekomendasi lewat quiz →</Link></article>
      </div>
    </section>
  </main>;
}
