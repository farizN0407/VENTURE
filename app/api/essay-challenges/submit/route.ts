import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESSAY_CHALLENGE, parseEssaySubmission, resolveEssayAccess } from "@/lib/essay-challenge";
import { evaluateEssayPrompt } from "@/lib/essay-evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sizeHeader = Number(request.headers.get("content-length") ?? 0);
  if (sizeHeader > 12000) return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });

  let submission;
  try {
    if (!request.body) return NextResponse.json({ error: "Permintaan essay tidak valid." }, { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 12000) {
        await reader.cancel();
        return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder().decode(bytes);
    submission = parseEssaySubmission(JSON.parse(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Permintaan essay tidak valid." }, { status: 400 });
  }

  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Autentikasi Supabase belum dikonfigurasi." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Silakan login untuk mengerjakan Essay Challenge." }, { status: 401 });

  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileError || subscriptionError) return NextResponse.json({ error: "Status akun Pro belum dapat diverifikasi. Coba lagi nanti." }, { status: 503 });
  const access = resolveEssayAccess(profile?.role, subscription, process.env.PROMPTLY_ESSAY_ADMIN_TEST_ENABLED === "true");
  if (!access.allowed) return NextResponse.json({ error: "Essay Challenge tersedia untuk akun Promptly Pro." }, { status: 403 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Evaluasi AI belum dikonfigurasi. Hubungi administrator." }, { status: 503 });

  const { data: quota, error: quotaError } = await supabase.rpc("consume_promptly_essay_attempt");
  if (quotaError) {
    if (quotaError.code === "42501") return NextResponse.json({ error: "Akses Promptly Pro belum terverifikasi." }, { status: 403 });
    return NextResponse.json({ error: "Batas penggunaan essay belum dapat diverifikasi. Pastikan migrasi essay sudah dijalankan." }, { status: 503 });
  }
  if (quota === "daily_limit") return NextResponse.json({ error: "Batas 3 evaluasi per hari tercapai. Silakan kembali besok." }, { status: 429 });
  if (quota === "rate_limited") return NextResponse.json({ error: "Tunggu 30 detik sebelum mengirim prompt berikutnya." }, { status: 429 });
  if (quota !== "allowed") return NextResponse.json({ error: "Batas penggunaan essay mengembalikan status yang tidak dikenal." }, { status: 503 });

  let evaluation;
  try { evaluation = await evaluateEssayPrompt(submission.answer); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Evaluasi AI gagal. Coba lagi nanti.";
    const status = /belum dikonfigurasi/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Penyimpanan hasil belum dikonfigurasi. Hasil evaluasi tidak disimpan." }, { status: 503 }); }
  const { data: saved, error: saveError } = await admin.from("essay_attempts").insert({
    user_id: user.id,
    challenge_slug: ESSAY_CHALLENGE.slug,
    answer: submission.answer,
    criteria_scores: evaluation.criteria,
    total_score: evaluation.totalScore,
    feedback: { strengths: evaluation.strengths, improvements: evaluation.improvements, improvedPrompt: evaluation.improvedPrompt },
  }).select("id,answer,criteria_scores,total_score,feedback,submitted_at").single();
  if (saveError || !saved) return NextResponse.json({ error: "Evaluasi selesai, tetapi hasil belum tersimpan. Coba lagi nanti." }, { status: 503 });
  return NextResponse.json({ attempt: saved });
}
