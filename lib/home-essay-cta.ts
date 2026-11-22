export type HomeEssayAccess = "guest" | "free" | "pro" | "admin" | "unavailable";

export function getHomeEssayCta(access: HomeEssayAccess) {
  switch (access) {
    case "guest": return { label: "Login untuk Mengakses", href: "/login?next=%2Fessay-challenges" };
    case "free": return { label: "Upgrade ke Promptly Pro", href: "/pricing" };
    case "pro":
    case "admin": return { label: "Mulai AI Essay Challenge", href: "/essay-challenges" };
    default: return { label: "Lihat AI Essay Challenge", href: "/essay-challenges" };
  }
}
