import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEssayChallenge, parseEssayQuota, parseEssaySubmission, resolveEssayAccess } from "@/lib/essay-challenge";
import { evaluateEssayPrompt } from "@/lib/essay-evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getQuotaSnapshot(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.rpc("get_promptly_essay_quota");
  return error ? null : parseEssayQuota(data);
}

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
  const challenge = getEssayChallenge(submission.challengeSlug);
  if (!challenge) return NextResponse.json({ error: "Essay challenge tidak ditemukan." }, { status: 404 });

  let supabase;
  try { supabase = await createClient(); }
  catch { return NextResponse.json({ error: "Autentikasi Supabase belum dikonfigurasi." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Silakan login untuk mengerjakan Essay Challenge." }, { status: 401 });

  const [{ data: isAdmin, error: adminError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.rpc("is_promptly_admin"),
    supabase.from("subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  if (adminError || (isAdmin !== true && subscriptionError)) return NextResponse.json({ error: "Status akses belum dapat diverifikasi. Coba lagi nanti." }, { status: 503 });
  const access = resolveEssayAccess(isAdmin === true ? "admin" : "user", subscription, process.env.PROMPTLY_ESSAY_ADMIN_TEST_ENABLED === "true");
  if (!access.allowed) return NextResponse.json({ error: "Essay Challenge tersedia untuk akun Promptly Pro." }, { status: 403 });
  const { data: publishedChallenge, error: challengeError } = await supabase.from("essay_challenges")
    .select("slug").eq("slug", challenge.slug).eq("published", true).maybeSingle();
  if (challengeError) return NextResponse.json({ error: "Status publikasi challenge belum dapat diverifikasi." }, { status: 503 });
  if (!publishedChallenge) return NextResponse.json({ error: "Essay challenge belum tersedia." }, { status: 404 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Evaluasi AI belum dikonfigurasi. Hubungi administrator." }, { status: 503 });

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Penyimpanan hasil belum dikonfigurasi." }, { status: 503 }); }

  // A fresh lease fences off an older AI call if its reservation expires and is retried.
  const leaseToken = randomUUID();
  const { data: quotaStatus, error: quotaError } = await supabase.rpc("reserve_promptly_essay_attempt", {
    p_request_id: submission.requestId,
    p_lease_token: leaseToken,
  });
  if (quotaError) {
    if (quotaError.code === "42501") return NextResponse.json({ error: "Akses Promptly Pro atau migrasi kuota belum terverifikasi." }, { status: 403 });
    return NextResponse.json({ error: "Batas penggunaan essay belum dapat diverifikasi. Pastikan migrasi essay sudah dijalankan." }, { status: 503 });
  }
  if (quotaStatus === "daily_limit") {
    const quota = await getQuotaSnapshot(supabase);
    const limit = quota?.dailyLimit ?? (access.isAdmin ? 15 : 3);
    return NextResponse.json({ error: `Batas ${limit} evaluasi berhasil per hari tercapai. Silakan kembali besok.`, quota }, { status: 429 });
  }
  if (quotaStatus === "rate_limited") return NextResponse.json({ error: "Tunggu 30 detik sebelum mengirim evaluasi berikutnya." }, { status: 429 });
  if (quotaStatus === "in_progress") return NextResponse.json({ error: "Permintaan yang sama sedang diproses. Tunggu sebentar lalu coba lagi." }, { status: 409 });
  if (quotaStatus === "already_succeeded") {
    const { data: saved, error: lookupError } = await supabase.from("essay_attempts")
      .select("id,answer,challenge_slug,criteria_scores,total_score,feedback,submitted_at")
      .eq("user_id", user.id).eq("request_id", submission.requestId).eq("challenge_slug", submission.challengeSlug).single();
    if (lookupError || !saved) return NextResponse.json({ error: "Hasil sebelumnya sudah diproses tetapi belum dapat dimuat." }, { status: 503 });
    return NextResponse.json({ attempt: saved, quota: await getQuotaSnapshot(supabase) });
  }
  if (quotaStatus !== "reserved") return NextResponse.json({ error: "Reservasi penggunaan essay mengembalikan status yang tidak dikenal." }, { status: 503 });

  let evaluation;
  try {
    evaluation = await evaluateEssayPrompt(submission.answer, challenge, (diagnostics) => {
      // Diagnostics contain fixed rubric IDs and numeric validity/score data only—never prompt text or evidence quotes.
      console.info("Promptly essay evaluation diagnostics", diagnostics);
    });
  }
  catch (error) {
    const { error: releaseError } = await admin.rpc("release_promptly_essay_attempt", {
      p_user_id: user.id, p_request_id: submission.requestId, p_lease_token: leaseToken,
    });
    if (releaseError) console.error("Essay quota release failed", { code: releaseError.code });
    const message = error instanceof Error ? error.message : "Evaluasi AI gagal. Coba lagi nanti.";
    const status = /belum dikonfigurasi/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const { data: attemptId, error: finalizeError } = await admin.rpc("finalize_promptly_essay_attempt", {
    p_user_id: user.id,
    p_request_id: submission.requestId,
    p_lease_token: leaseToken,
    p_challenge_slug: submission.challengeSlug,
    p_answer: submission.answer,
    p_criteria_scores: evaluation.criteria,
    p_total_score: evaluation.totalScore,
    p_feedback: { strengths: evaluation.strengths, weaknesses: evaluation.weaknesses, improvements: evaluation.improvements, improvedPrompt: evaluation.improvedPrompt },
  });
  if (finalizeError || !attemptId) {
    const { error: releaseError } = await admin.rpc("release_promptly_essay_attempt", {
      p_user_id: user.id, p_request_id: submission.requestId, p_lease_token: leaseToken,
    });
    if (releaseError) console.error("Essay quota release after save failure failed", { code: releaseError.code });
    console.error("Essay attempt finalization failed", { code: finalizeError?.code });
    if (finalizeError?.code === "42501") {
      return NextResponse.json({ error: "Akses essay berubah selama evaluasi; hasil tidak disimpan dan reservasi dilepas.", quota: await getQuotaSnapshot(supabase) }, { status: 403 });
    }
    if (finalizeError?.code === "P0001") {
      const quota = await getQuotaSnapshot(supabase);
      const limit = quota?.dailyLimit ?? (access.isAdmin ? 15 : 3);
      return NextResponse.json({ error: `Batas ${limit} evaluasi berhasil per hari tercapai sebelum hasil dapat disimpan.`, quota }, { status: 429 });
    }
    return NextResponse.json({ error: "Evaluasi selesai, tetapi hasil belum tersimpan. Kuota dilepas bila penyimpanan belum berhasil; coba lagi dengan permintaan yang sama." }, { status: 503 });
  }
  const { data: saved, error: lookupError } = await supabase.from("essay_attempts")
    .select("id,answer,challenge_slug,criteria_scores,total_score,feedback,submitted_at")
    .eq("user_id", user.id).eq("request_id", submission.requestId).single();
  if (lookupError || !saved) return NextResponse.json({ error: "Evaluasi tersimpan, tetapi hasil belum dapat dimuat. Kirim ulang permintaan yang sama untuk memuat hasilnya." }, { status: 503 });
  return NextResponse.json({ attempt: saved, quota: await getQuotaSnapshot(supabase) });
}
