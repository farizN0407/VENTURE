export type Lesson = {
  slug: string;
  title: string;
  summary: string;
  principle: string;
  example: string;
  practice: string;
  challengeSlug: string;
  nextSlug: string;
};

export const lessons: Lesson[] = [
  {
    slug: "prompting",
    title: "Prompting",
    summary: "Beri AI tujuan, konteks, audiens, batasan, dan bentuk hasil yang kamu perlukan.",
    principle: "Prompt yang jelas membuat kebutuhanmu dapat ditindaklanjuti. Tambahkan konteks yang relevan dan minta format keluaran yang bisa kamu periksa.",
    example: "Kurang jelas: ‘Jelaskan fotosintesis.’ Lebih terarah: ‘Jelaskan fotosintesis untuk siswa kelas 10 dalam 4 langkah, sertakan satu analogi dan sebutkan istilah yang perlu saya cek di buku.’",
    practice: "Pilih satu tugas kecil, lalu tulis ulang prompt dengan menyebut tujuan, konteks, dan format jawaban.",
    challengeSlug: "prompt-battle",
    nextSlug: "fact-checking",
  },
  {
    slug: "fact-checking",
    title: "Fact Checking",
    summary: "Perlakukan jawaban AI sebagai klaim yang perlu diperiksa, terutama angka, kutipan, dan sumber.",
    principle: "Periksa sumber asli, tanggal, konteks, dan apakah sumber itu benar-benar mendukung klaim. Nada yakin bukan bukti.",
    example: "Jika AI memberi statistik tanpa tautan, cari laporan atau dataset asalnya, cocokkan periode dan definisinya, lalu catat apa yang belum dapat diverifikasi.",
    practice: "Ambil satu klaim dari jawaban AI dan telusuri sampai sumber primer sebelum menggunakannya.",
    challengeSlug: "can-you-trust-ai",
    nextSlug: "ai-for-research",
  },
  {
    slug: "ai-for-research",
    title: "AI for Research",
    summary: "Gunakan AI untuk membantu menyusun kata kunci dan memahami bacaan, bukan sebagai pengganti sumber akademik.",
    principle: "Temukan dan baca artikel asli. Cocokkan ringkasan dengan bagian yang relevan dan verifikasi setiap referensi sebelum mengutip.",
    example: "Minta AI membuat variasi kata kunci tentang dampak ruang hijau pada kesehatan mental. Jalankan pencarian di katalog ilmiah, lalu pilih artikel dan periksa metode serta batasannya sendiri.",
    practice: "Gunakan AI untuk membuat tiga kata kunci pencarian, lalu bandingkan hasilnya di katalog akademik dan buka satu sumber asli.",
    challengeSlug: "ai-for-research",
    nextSlug: "critical-thinking",
  },
  {
    slug: "critical-thinking",
    title: "Critical Thinking",
    summary: "Uji alasan, asumsi, bukti, dan penjelasan alternatif di balik jawaban AI.",
    principle: "Pisahkan klaim dari bukti. Tanyakan apa yang dapat membantah kesimpulan, siapa yang mungkin tidak terwakili, dan apakah hubungan sebab-akibat benar-benar didukung.",
    example: "Jika AI berkata ‘pengguna aplikasi yang belajar lebih lama mendapat nilai lebih tinggi, jadi aplikasi menaikkan nilai’, tanyakan apakah ada kelompok pembanding atau faktor lain seperti pengalaman awal.",
    practice: "Pilih satu kesimpulan AI dan tulis satu bukti pendukung, satu asumsi, serta satu penjelasan alternatif.",
    challengeSlug: "critical-thinking",
    nextSlug: "responsible-ai",
  },
  {
    slug: "responsible-ai",
    title: "Responsible AI",
    summary: "Jaga privasi, ikuti aturan penggunaan, ungkapkan bantuan AI saat relevan, dan pertahankan tanggung jawab manusia.",
    principle: "Masukkan data seminimal mungkin. Jangan unggah informasi pribadi tanpa dasar yang tepat. Verifikasi hasil dan ikuti kebijakan kelas atau organisasi.",
    example: "Sebelum meminta ringkasan umpan balik, hapus nama dan nomor mahasiswa. Periksa kebijakan alat serta kelas, lalu tulis ulang berdasarkan pemahamanmu sendiri.",
    practice: "Sebelum memakai AI untuk tugas berikutnya, periksa data yang akan dibagikan dan aturan yang berlaku.",
    challengeSlug: "responsible-ai",
    nextSlug: "prompting",
  },
];

export function getLesson(slug: string) {
  return lessons.find((lesson) => lesson.slug === slug);
}
