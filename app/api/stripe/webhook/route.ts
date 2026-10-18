import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type SubscriptionState = { userId: string; customerId: string; subscriptionId: string; status: string; currentPeriodEnd: number | null };

async function persistSubscription(state: SubscriptionState, eventCreated: number) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("sync_stripe_subscription_event", { p_user_id: state.userId, p_customer_id: state.customerId, p_subscription_id: state.subscriptionId, p_status: state.status, p_period_end: state.currentPeriodEnd ? new Date(state.currentPeriodEnd * 1000).toISOString() : null, p_event_created: eventCreated });
  if (error) throw error;
}

async function subscriptionState(stripe: Stripe, subscription: Stripe.Subscription): Promise<SubscriptionState> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let userId = subscription.metadata.supabase_user_id;
  if (!userId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) userId = customer.metadata.supabase_user_id;
  }
  if (!userId) throw new Error("Subscription has no linked Supabase user.");
  return { userId, customerId, subscriptionId: subscription.id, status: subscription.status, currentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null };
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Stripe webhook belum dikonfigurasi lengkap." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret); }
  catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await persistSubscription(await subscriptionState(stripe, subscription), event.created);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await persistSubscription(await subscriptionState(stripe, event.data.object as Stripe.Subscription), event.created);
    }
  } catch (error) {
    console.error("Stripe webhook persistence failed", { eventId: event.id, error });
    return NextResponse.json({ error: "Subscription state could not be stored." }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
