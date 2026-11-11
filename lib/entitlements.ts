export type SubscriptionRecord = { status?: string | null; current_period_end?: string | null } | null;
export type Plan = "free" | "pro";
export type Feature = "published_learning" | "basic_quiz" | "basic_progress" | "advanced_analytics" | "personalized_recommendations" | "advanced_content";

const freeFeatures = new Set<Feature>(["published_learning", "basic_quiz", "basic_progress"]);
// Essay challenges are launched behind server-side subscription checks.
const launchedProFeatures = new Set<Feature>(["advanced_content"]);

export function resolvePlan(subscription: SubscriptionRecord, now = Date.now()): Plan {
  const end = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : 0;
  return ["active", "trialing"].includes(subscription?.status ?? "") && end > now ? "pro" : "free";
}

export function canAccessFeature(feature: Feature, plan: Plan): boolean {
  return freeFeatures.has(feature) || (plan === "pro" && launchedProFeatures.has(feature));
}
