import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { deleteChallenge, deleteModule, saveChallenge, saveModule } from "@/app/admin/actions";

type ModuleRow = { slug: string; title: string; summary: string; principle: string; example: string; practice: string; challenge_slug: string | null; next_slug: string | null; published: boolean };
type OptionRow = { id: string; position: number; body: string };
type AnswerKeyRow = { correct_option_id: string; explanation: string } | { correct_option_id: string; explanation: string }[];
type QuestionRow = { id: string; position: number; prompt: string; skill: string; challenge_options: OptionRow[]; quiz_answer_keys: AnswerKeyRow | null };
type ChallengeRow = { slug: string; title: string; category: string; description: string; learning_objective: string; difficulty: string; module_slug: string | null; published: boolean; challenge_questions: QuestionRow[] };

function questionData(challenge: ChallengeRow) {
  return [...(challenge.challenge_questions ?? [])].sort((a, b) => a.position - b.position).map((question) => {
    const options = [...(question.challenge_options ?? [])].sort((a, b) => a.position - b.position);
    const key = Array.isArray(question.quiz_answer_keys) ? question.quiz_answer_keys[0] : question.quiz_answer_keys;
    return { prompt: question.prompt, options: options.map((option) => option.body), correctIndex: Math.max(0, options.findIndex((option) => option.id === key?.correct_option_id)), explanation: key?.explanation ?? "", skill: question.skill };
  });
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const query = await searchParams;
  let supabase;
  try { supabase = await createClient(); } catch {
    return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">ADMIN</div><h1 className="page-heading">Admin belum dikonfigurasi</h1><p>Tambahkan kredensial Supabase server-side, terapkan <code>supabase/schema.sql</code>, lalu provision satu akun admin melalui SQL Editor.</p><Link className="btn btn-alt" href="/">Kembali ke Promptly</Link></section></main>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  const { data: profile, error: roleError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "admin") redirect("/account");

  const [{ data: moduleData, error: modulesError }, { data: challengeData, error: challengesError }, { count: userCount }, { count: attemptCount }, { count: completionCount }] = await Promise.all([
    supabase.from("learning_modules").select("slug,title,summary,principle,example,practice,challenge_slug,next_slug,published").order("updated_at", { ascending: false }),
    supabase.from("challenges").select("slug,title,category,description,learning_objective,difficulty,module_slug,published,challenge_questions(id,position,prompt,skill,challenge_options(id,position,body),quiz_answer_keys(correct_option_id,explanation))").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("quiz_attempts").select("id", { count: "exact", head: true }),
    supabase.from("module_completions").select("user_id", { count: "exact", head: true }),
  ]);
  const modules = (moduleData ?? []) as ModuleRow[];
  const managedChallenges = (challengeData ?? []) as ChallengeRow[];
  const databaseError = modulesError || challengesError;

  return <main className="wrap section admin-page">
    <div className="account-header"><Link className="brand" href="/">promptly<b>.</b></Link><div className="account-top-actions"><span className="account-email">{user.email}</span><Link className="text-button" href="/account">Kembali ke akun</Link><form action={signOut}><button className="text-button" type="submit">Keluar</button></form></div></div>
    <div className="admin-title"><div className="label">PROMPTLY CONTENT STUDIO</div><h1 className="page-heading">Dashboard admin</h1><p>Kelola materi dan challenge tersimpan di Supabase. Perubahan draft tidak tampil untuk pengguna biasa.</p></div>
    {query.error && <p className="auth-message auth-error" role="alert">{query.error}</p>}
    {query.saved && <p className="auth-message" role="status">Perubahan tersimpan: {query.saved}.</p>}
    {databaseError && <p className="auth-message auth-error" role="alert">Data admin belum dapat dimuat. Jalankan schema terbaru pada project Supabase.</p>}
    <div className="stats-grid admin-stats"><article><small>AKUN TERDAFTAR</small><strong>{userCount ?? "—"}</strong><span>profil Supabase</span></article><article><small>PERCOBAAN QUIZ</small><strong>{attemptCount ?? "—"}</strong><span>hasil tersimpan</span></article><article><small>MATERI SELESAI</small><strong>{completionCount ?? "—"}</strong><span>aktivitas akun</span></article></div>
    <section className="admin-section"><div className="head"><div><div className="label">LEARNING MODULES</div><h2>Materi</h2><p>Buat, edit, publikasikan, atau simpan sebagai draft.</p></div></div>
      <details className="admin-editor" open><summary>Tambah materi</summary><ModuleForm action={saveModule} /></details>
      {modules.map((module) => <details className="admin-editor" key={module.slug}><summary><span>{module.title}</span><small>{module.published ? "Terbit" : "Draft"} · {module.slug}</small></summary><ModuleForm action={saveModule} module={module} /><form action={deleteModule} className="admin-delete"><input type="hidden" name="slug" value={module.slug}/><button className="text-button" type="submit">Hapus materi</button></form></details>)}
    </section>
    <section className="admin-section"><div className="head"><div><div className="label">CHALLENGES & QUIZZES</div><h2>Challenge</h2><p>Kelola soal, opsi, kunci jawaban, pembahasan, kategori, dan tingkat kesulitan.</p></div></div>
      <p className="admin-help">Slug konten database menggunakan awalan <code>custom-</code> agar tidak bertabrakan dengan 7 materi dan 8 challenge bawaan Promptly.</p>
      <details className="admin-editor" open><summary>Tambah challenge</summary><ChallengeForm /></details>
      {managedChallenges.map((challenge) => <details className="admin-editor" key={challenge.slug}><summary><span>{challenge.title}</span><small>{challenge.published ? "Terbit" : "Draft"} · {challenge.slug}</small></summary><ChallengeForm challenge={challenge} /><form action={deleteChallenge} className="admin-delete"><input type="hidden" name="slug" value={challenge.slug}/><button className="text-button" type="submit">Hapus challenge</button></form></details>)}
    </section>
    <p className="account-note">Akses admin diperiksa di server dan melalui RLS. Role hanya dapat diprovision oleh pemilik project lewat SQL Editor; form publik tidak menyediakan pilihan admin.</p>
  </main>;
}

function ModuleForm({ action, module }: { action: (form: FormData) => void | Promise<void>; module?: ModuleRow }) {
  return <form action={action} className="admin-form">
    <label>Slug (custom-... )<input name="slug" required pattern="custom-[a-z0-9]+(-[a-z0-9]+)*" defaultValue={module?.slug} maxLength={100}/></label>
    <label>Judul<input name="title" required defaultValue={module?.title} maxLength={120}/></label>
    <label>Ringkasan<textarea name="summary" required defaultValue={module?.summary} maxLength={500}/></label>
    <label>Prinsip<textarea name="principle" required defaultValue={module?.principle} maxLength={5000}/></label>
    <label>Contoh praktis<textarea name="example" required defaultValue={module?.example} maxLength={5000}/></label>
    <label>Latihan praktik<textarea name="practice" required defaultValue={module?.practice} maxLength={5000}/></label>
    <label>Challenge terkait<input name="challenge_slug" defaultValue={module?.challenge_slug ?? ""} maxLength={100}/></label>
    <label>Materi berikutnya<input name="next_slug" defaultValue={module?.next_slug ?? ""} maxLength={100}/></label>
    <label className="admin-checkbox"><input type="checkbox" name="published" defaultChecked={module?.published ?? false}/> Terbitkan materi</label>
    <button className="btn btn-main" type="submit">Simpan materi</button>
  </form>;
}

function ChallengeForm({ challenge }: { challenge?: ChallengeRow }) {
  return <form action={saveChallenge} className="admin-form">
    <label>Slug (custom-... )<input name="slug" required pattern="custom-[a-z0-9]+(-[a-z0-9]+)*" defaultValue={challenge?.slug} maxLength={100}/></label>
    <label>Judul<input name="title" required defaultValue={challenge?.title} maxLength={120}/></label>
    <label>Kategori<input name="category" required defaultValue={challenge?.category} maxLength={80}/></label>
    <label>Deskripsi<textarea name="description" required defaultValue={challenge?.description} maxLength={500}/></label>
    <label>Learning objective<textarea name="learning_objective" required defaultValue={challenge?.learning_objective} maxLength={1000}/></label>
    <label>Tingkat kesulitan<select name="difficulty" defaultValue={challenge?.difficulty ?? "Pemula"}><option>Pemula</option><option>Menengah</option><option>Lanjutan</option></select></label>
    <label>Slug materi terkait<input name="module_slug" defaultValue={challenge?.module_slug ?? ""} maxLength={100}/></label>
    <label>Soal (JSON)<textarea className="question-json" name="questions" required defaultValue={JSON.stringify(challenge ? questionData(challenge) : [{ prompt: "", options: ["", ""], correctIndex: 0, explanation: "", skill: "Prompting" }], null, 2)}/></label>
    <p className="admin-help">Setiap soal membutuhkan <code>prompt</code>, <code>options</code>, <code>correctIndex</code>, <code>explanation</code>, dan skill: Prompting, Critical Thinking, Fact Checking, AI Knowledge, atau Practical Application.</p>
    <label className="admin-checkbox"><input type="checkbox" name="published" defaultChecked={challenge?.published ?? false}/> Terbitkan challenge</label>
    <button className="btn btn-main" type="submit">Simpan challenge</button>
  </form>;
}
