"use client";

import { useState } from "react";
import Link from "next/link";

export default function ModuleCompletion({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "complete" | "guest" | "unavailable" | "error">("idle");

  async function markComplete() {
    setStatus("saving");
    try {
      const response = await fetch("/api/module-completions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module_slug: slug }),
      });
      if (response.status === 401) { setStatus("guest"); return; }
      if (response.status === 503) { setStatus("unavailable"); return; }
      if (!response.ok) { setStatus("error"); return; }
      setStatus("complete");
    } catch { setStatus("error"); }
  }

  return <div className="module-completion">
    {status === "complete" ? <span className="auth-message" role="status">Materi selesai dan tersimpan.</span> :
      <button className="btn btn-alt" type="button" onClick={markComplete} disabled={status === "saving"}>
        {status === "saving" ? "Menyimpan…" : "Tandai materi selesai"}
      </button>}
    {status === "guest" && <p className="save-status" role="status">Masuk untuk menyimpan progres ini. <Link href={`/login?next=${encodeURIComponent(`/learn/${slug}`)}`}>Masuk →</Link></p>}
    {status === "unavailable" && <p className="save-status" role="status">Penyimpanan progres belum dikonfigurasi.</p>}
    {status === "error" && <p className="save-status auth-error" role="alert">Progres belum tersimpan. Silakan coba lagi.</p>}
  </div>;
}
