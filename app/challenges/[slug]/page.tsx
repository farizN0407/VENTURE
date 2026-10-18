import Link from "next/link";
import { notFound } from "next/navigation";
import { challenges } from "@/lib/challenges";
import Quiz from "@/app/components/Quiz";
export function generateStaticParams(){return challenges.map(c=>({slug:c.slug}));}
export default async function ChallengePage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const challenge=challenges.find(c=>c.slug===slug);if(!challenge)notFound();return <main className="wrap section"><Link className="brand" href="/">promptly<b>.</b></Link><div style={{margin:"38px 0 24px"}}><Link className="all-link" href="/challenges">← Semua challenge</Link><div className="label" style={{marginTop:24}}>{challenge.category} · {challenge.difficulty}</div><h1 style={{fontSize:"clamp(36px,5vw,56px)",letterSpacing:"-2px",maxWidth:800}}>{challenge.title}</h1><p style={{color:"#68788c",maxWidth:650,lineHeight:1.7}}>{challenge.description}</p></div><Quiz challenge={challenge}/></main>}
