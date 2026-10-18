export type Lesson = {
  slug: string;
  title: string;
  summary: string;
  principle: string;
  example: string;
  practice: string;
  commonMistake?: string;
  tip?: string;
  scenario?: string;
  challengeSlug: string;
  nextSlug: string;
};

export const lessons: Lesson[] = [
  {
    slug: "prompting",
    title: "Prompting",
    summary: "Beri AI tujuan, konteks, audiens, batasan, dan bentuk hasil yang kamu perlukan.",
    principle: "Susun prompt dengan tujuan, konteks yang diperlukan, audiens, batasan, dan bentuk hasil. Tambahkan instruksi secara bertahap bila jawaban awal belum sesuai.",
    example: "Kurang jelas: ‘Jelaskan fotosintesis.’ Lebih terarah: ‘Jelaskan fotosintesis untuk siswa kelas 10 dalam 4 langkah, sertakan satu analogi dan sebutkan istilah yang perlu saya cek di buku.’",
    practice: "Pilih satu tugas kuliah. Tulis tujuan, konteks, audiens, batasan, dan format hasil yang kamu perlukan.",
    commonMistake: "Meminta hasil ‘yang bagus’ tanpa menjelaskan untuk siapa, untuk tujuan apa, atau bagaimana hasilnya akan dinilai.",
    tip: "Minta AI mengakui informasi yang tidak tersedia. Perbaiki satu kekurangan pada prompt tiap putaran agar kamu tahu instruksi mana yang membantu.",
    scenario: "AI membuat ringkasan satu halaman padahal kamu hanya punya waktu untuk membaca sebelum kelas. Minta versi lima poin untuk mahasiswa baru, tandai istilah yang perlu dicek, lalu bandingkan dengan bacaan.",
    challengeSlug: "prompt-battle",
    nextSlug: "critical-thinking",
  },
  {
    slug: "fact-checking",
    title: "Fact Checking",
    summary: "Perlakukan jawaban AI sebagai klaim yang perlu diperiksa, terutama angka, kutipan, dan sumber.",
    principle: "Periksa sumber asli, tanggal, konteks, dan apakah sumber itu benar-benar mendukung klaim. Nada yakin bukan bukti.",
    example: "Jika AI memberi statistik tanpa tautan, cari laporan atau dataset asalnya, cocokkan periode dan definisinya, lalu catat apa yang belum dapat diverifikasi.",
    practice: "Ambil satu klaim dari jawaban AI dan telusuri sampai sumber primer sebelum menggunakannya.",
    commonMistake: "Menganggap satu tautan atau sitasi sebagai bukti bahwa sumber itu benar-benar mendukung klaim.",
    tip: "Telusuri sumber asal, tanggal, definisi, metode, dan bagian yang mendukung klaim; bandingkan dengan sumber independen.",
    scenario: "AI memberi angka prevalensi tanpa tanggal. Cari dataset atau laporan primer, cocokkan definisi dan periode, lalu catat batas perbandingannya.",
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
    commonMistake: "Mengutip daftar pustaka atau ringkasan dari AI tanpa membuka sumber dan memeriksa relevansinya.",
    tip: "Pakai AI untuk variasi kata kunci dan orientasi. Catat kriteria pencarian, baca artikel asli, dan samarkan data partisipan sebelum memakai alat.",
    scenario: "AI menyarankan tiga artikel untuk topikmu. Temukan metadata di katalog akademik, baca metode dan hasil yang relevan, lalu buang referensi yang tidak ada atau tidak mendukung klaim.",
    challengeSlug: "ai-for-research",
    nextSlug: "critical-thinking",
  },
  {
    slug: "ai-knowledge",
    title: "AI Knowledge",
    summary: "Pahami cara model bahasa menghasilkan jawaban dan mengapa jawabannya tetap bisa keliru.",
    principle: "Model bahasa mempelajari pola dari data dan menghasilkan teks sesuai konteks. Kelancaran tidak menjamin akurasi, pengetahuan terbaru, atau pemahaman seperti manusia.",
    example: "Jika AI memberi DOI yang tampak valid, jangan menilai dari formatnya. Cari DOI itu di situs penerbit dan pastikan artikel serta klaimnya benar-benar ada.",
    practice: "Ambil satu jawaban AI, tandai klaim yang bisa diverifikasi, lalu cari sumber di luar model untuk memeriksanya.",
    commonMistake: "Menganggap AI selalu mencari web, mengingat semua percakapan, atau mengetahui fakta terkini tanpa fitur dan sumber yang sesuai.",
    tip: "Periksa apakah alat memakai pencarian atau sumber yang kamu berikan. Untuk keputusan penting, gunakan bukti independen dan penilaian manusia.",
    scenario: "Model menjelaskan kebijakan kampus dengan yakin. Cek tanggal jawabannya dan cocokkan dengan dokumen resmi kampus yang berlaku sekarang.",
    challengeSlug: "ai-or-human",
    nextSlug: "ai-for-research",
  },
  {
    slug: "critical-thinking",
    title: "Critical Thinking",
    summary: "Uji alasan, asumsi, bukti, dan penjelasan alternatif di balik jawaban AI.",
    principle: "Pisahkan klaim dari bukti. Tanyakan apa yang dapat membantah kesimpulan, siapa yang mungkin tidak terwakili, dan apakah hubungan sebab-akibat benar-benar didukung.",
    example: "Jika AI berkata ‘pengguna aplikasi yang belajar lebih lama mendapat nilai lebih tinggi, jadi aplikasi menaikkan nilai’, tanyakan apakah ada kelompok pembanding atau faktor lain seperti pengalaman awal.",
    practice: "Pilih satu kesimpulan AI dan tulis satu bukti pendukung, satu asumsi, serta satu penjelasan alternatif.",
    commonMistake: "Menyamakan jawaban yang lancar atau konsisten dengan argumen yang didukung bukti.",
    tip: "Tanyakan asumsi, penjelasan alternatif, siapa yang tidak terwakili, dan bukti apa yang dapat membantah kesimpulan.",
    scenario: "AI menyimpulkan aplikasi belajar menaikkan nilai karena penggunanya mendapat nilai lebih tinggi. Cari faktor lain dan tanyakan apakah ada kelompok pembanding.",
    challengeSlug: "critical-thinking",
    nextSlug: "responsible-ai",
  },
  {
    slug: "practical-application",
    title: "Practical Application",
    summary: "Gunakan AI untuk ide, rangkuman, dan produktivitas tanpa menyerahkan penilaian akademikmu.",
    principle: "AI dapat membantu memulai dan merapikan pekerjaan. Periksa aturan kelas, lindungi data, verifikasi hasil, dan pertahankan tanggung jawab atas pekerjaan akhir.",
    example: "Untuk memahami bacaan, minta daftar istilah sulit lalu bandingkan penjelasannya dengan artikel. Jangan mengutip ringkasan AI sebagai pengganti sumber.",
    practice: "Pilih satu tugas kuliah dan tentukan bagian kecil yang boleh dibantu AI, bagian yang harus kamu verifikasi, serta data yang tidak akan kamu bagikan.",
    commonMistake: "Menyerahkan teks, analisis, atau keputusan AI tanpa membaca kebijakan akademik dan memeriksa hasilnya.",
    tip: "Mulai dari tugas berisiko rendah seperti brainstorming. Simpan sumber, cek fakta, dan ungkapkan bantuan sesuai aturan dosen.",
    scenario: "Gunakan AI untuk membuat opsi kerangka presentasi. Diskusikan mana yang sesuai rubrik, verifikasi fakta dengan sumber, dan susun argumen final bersama kelompok.",
    challengeSlug: "ai-in-real-life",
    nextSlug: "responsible-ai",
  },
  {
    slug: "responsible-ai",
    title: "Responsible AI",
    summary: "Jaga privasi, ikuti aturan penggunaan, ungkapkan bantuan AI saat relevan, dan pertahankan tanggung jawab manusia.",
    principle: "Masukkan data seminimal mungkin. Jangan unggah informasi pribadi tanpa dasar yang tepat. Verifikasi hasil dan ikuti kebijakan kelas atau organisasi.",
    example: "Sebelum meminta ringkasan umpan balik, hapus nama dan nomor mahasiswa. Periksa kebijakan alat serta kelas, lalu tulis ulang berdasarkan pemahamanmu sendiri.",
    practice: "Sebelum memakai AI untuk tugas berikutnya, periksa data yang akan dibagikan dan aturan yang berlaku.",
    commonMistake: "Mengunggah data pribadi atau menganggap semua penggunaan AI otomatis diizinkan dan bebas risiko.",
    tip: "Minimalkan data, pastikan izin dan kebijakan alat, evaluasi dampak bias, dan pertahankan keputusan akhir pada manusia yang bertanggung jawab.",
    scenario: "Sebelum meminta AI merangkum wawancara, hapus identitas, pastikan protokol riset mengizinkan pemrosesan, lalu cocokkan ringkasan dengan transkrip.",
    challengeSlug: "responsible-ai",
    nextSlug: "prompting",
  },
];

export function getLesson(slug: string) {
  return lessons.find((lesson) => lesson.slug === slug);
}
