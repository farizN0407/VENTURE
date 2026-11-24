import { buildPromptlyProWhatsAppUrl } from "./promptly-pro-whatsapp.ts";

export type HomeEssayAccess = "guest" | "free" | "pro" | "admin" | "unavailable";

export function getHomeEssayCta(access: HomeEssayAccess, accountEmail?: string | null) {
  switch (access) {
    case "guest": return { label: "Login untuk Mengakses", href: "/login?next=%2Fessay-challenges" };
    case "free": return { label: "Berlangganan via WhatsApp", href: buildPromptlyProWhatsAppUrl(accountEmail) };
    case "pro":
    case "admin": return { label: "Mulai AI Essay Challenge", href: "/essay-challenges" };
    default: return { label: "Lihat AI Essay Challenge", href: "/essay-challenges" };
  }
}
