import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 }); }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Fpricing", origin), 303);

  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRO_PRICE_ID;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const hasSupabaseSecret = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (process.env.STRIPE_ENABLE_CHECKOUT !== "true" || !secret?.startsWith("sk_test_") || !price || !webhookSecret || !hasSupabaseSecret) {
    return NextResponse.redirect(new URL("/pricing?checkout=unavailable", origin), 303);
  }
  const stripe = new Stripe(secret);
  let admin;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 503 }); }
  const { data: current, error: lookupError } = await admin.from("subscriptions").select("status,current_period_end,stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Status subscription tidak dapat diperiksa. Pastikan schema Supabase sudah diterapkan." }, { status: 503 });
  const end = current?.current_period_end ? Date.parse(current.current_period_end) : 0;
  if (["active", "trialing"].includes(current?.status ?? "") && end > Date.now()) return NextResponse.redirect(new URL("/account", origin), 303);
  try {
    let customerId = current?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } }, { idempotencyKey: `promptly-customer-${user.id}` });
      customerId = customer.id;
      const { error } = await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: customerId, status: "inactive", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw new Error("Could not associate Stripe customer with the authenticated user.");
    }
    const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: customerId, line_items: [{ price, quantity: 1 }], success_url: `${origin}/account?checkout=success`, cancel_url: `${origin}/pricing?checkout=cancelled`, allow_promotion_codes: true, metadata: { supabase_user_id: user.id }, subscription_data: { metadata: { supabase_user_id: user.id } } });
    if (!session.url) return NextResponse.json({ error: "Stripe tidak mengembalikan URL checkout." }, { status: 502 });
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Stripe test checkout error", error);
    return NextResponse.json({ error: "Checkout test gagal dibuat. Periksa konfigurasi Stripe dan Supabase." }, { status: 503 });
  }
}
