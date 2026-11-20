import { notFound } from "next/navigation";
import EssayChallengePage from "@/app/essay-challenges/EssayChallengePage";
import { getEssayChallenge } from "@/lib/essay-challenge";

export const dynamic = "force-dynamic";

export default async function EssayChallengeSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const challenge = getEssayChallenge(slug);
  if (!challenge) notFound();
  return <EssayChallengePage challenge={challenge} />;
}
