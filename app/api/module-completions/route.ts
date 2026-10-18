import { NextResponse } from "next/server";
import { lessons } from "@/lib/learning";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const slug = body && typeof body === "object" ? (body as Record<string, unknown>).module_slug : null;
  if (typeof slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Invalid module." }, { status: 400 });

  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Masuk untuk menyimpan progres." }, { status: 401 });

  let visible = lessons.some((lesson) => lesson.slug === slug);
  if (!visible) {
    const { data } = await supabase.from("learning_modules").select("slug").eq("slug", slug).eq("published", true).maybeSingle();
    visible = Boolean(data);
  }
  if (!visible) return NextResponse.json({ error: "Materi tidak tersedia." }, { status: 404 });

  let admin;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "Penyimpanan progres belum dikonfigurasi." }, { status: 503 }); }
  const { error } = await admin.from("module_completions").upsert({ user_id: user.id, module_slug: slug }, { onConflict: "user_id,module_slug" });
  if (error) {
    console.error("Module completion save failed", error);
    return NextResponse.json({ error: "Progres tidak dapat disimpan." }, { status: 503 });
  }
  return NextResponse.json({ saved: true }, { status: 201 });
}
