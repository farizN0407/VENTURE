import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Promptly — Belajar AI dengan lebih cerdas", description: "Latihan interaktif untuk menggunakan AI dengan lebih efektif dan kritis." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body>{children}</body></html>; }
