import EssayChallengePage from "@/app/essay-challenges/EssayChallengePage";
import { ESSAY_CHALLENGES } from "@/lib/essay-challenge";

export const dynamic = "force-dynamic";

export default function AcademicResearchAssistantPage() {
  return <EssayChallengePage challenge={ESSAY_CHALLENGES[0]} />;
}
