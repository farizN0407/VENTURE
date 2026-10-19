import Link from "next/link";
import { notFound } from "next/navigation";
import { challenges } from "@/lib/challenges";
import { getPublishedChallenge, type PublicChallenge } from "@/lib/content";
import Quiz from "@/app/components/Quiz";
import TopicQuiz from "@/app/components/TopicQuiz";
import { CHALLENGE_TOPICS } from "@/lib/topic-quizzes";
export function generateStaticParams(){return challenges.map(c=>({slug:c.slug}));}
export const dynamicParams = true;
export const dynamic = "force-dynamic";
function publicStaticChallenge(challenge: typeof challenges[number]): PublicChallenge {
  return { slug: challenge.slug, title: challenge.title, category: challenge.category, description: challenge.description, difficulty: challenge.difficulty,
    questions: challenge.questions.map(({ prompt, options, skill }) => ({ prompt, options, skill })) };
}
export default async function ChallengePage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  let databaseChallenge: PublicChallenge | undefined;
  try { databaseChallenge = await getPublishedChallenge(slug); }
  catch {
    if (!challenges.some((challenge) => challenge.slug === slug)) return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><section className="account-panel"><div className="label">CHALLENGE</div><h1 className="page-heading">Challenge belum dapat dimuat</h1><p>Supabase belum dapat mengonfirmasi challenge published ini. Periksa koneksi, izin SELECT, dan RLS, lalu coba lagi.</p><Link className="btn btn-alt" href="/challenges">Kembali ke semua challenge</Link></section></main>;
  }
  const staticChallenge = challenges.find(c=>c.slug===slug);
  if(!databaseChallenge && !staticChallenge)notFound();
  const challenge = databaseChallenge ?? publicStaticChallenge(staticChallenge!);
  const topicSlug = CHALLENGE_TOPICS[slug];
  return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><div style={{margin:"38px 0 24px"}}><Link className="all-link" href="/challenges">← Semua challenge</Link><div className="label" style={{marginTop:24}}>{challenge.category} · {challenge.difficulty}</div><h1 style={{fontSize:"clamp(36px,5vw,56px)",letterSpacing:"-2px",maxWidth:800}}>{challenge.title}</h1><p style={{color:"#68788c",maxWidth:650,lineHeight:1.7}}>{challenge.description}</p>{challenge.learning_objective && <p style={{color:"#35465b",maxWidth:650,lineHeight:1.7}}><strong>Tujuan belajar:</strong> {challenge.learning_objective}</p>}</div>{topicSlug ? <TopicQuiz topicSlug={topicSlug} topicTitle={challenge.title} challengeSlug={slug} /> : <Quiz challenge={challenge}/>}</main>
}
