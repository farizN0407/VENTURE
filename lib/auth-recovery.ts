export const PASSWORD_RECOVERY_PATH = "/reset-password";

export function createRecoveryRedirectUrl(siteUrl: string) {
  let base: URL;
  try { base = new URL(siteUrl); }
  catch { throw new Error("NEXT_PUBLIC_SITE_URL harus berupa URL yang valid."); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && local)) {
    throw new Error("NEXT_PUBLIC_SITE_URL harus menggunakan HTTPS, kecuali localhost.");
  }
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", PASSWORD_RECOVERY_PATH);
  callback.searchParams.set("flow", "recovery");
  return callback.toString();
}

export function isPasswordRecoveryCallback(flow: string | null, destination: string) {
  return flow === "recovery" && destination === PASSWORD_RECOVERY_PATH;
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8 || password.length > 72) return "Password baru harus 8–72 karakter.";
  if (password !== confirmation) return "Konfirmasi password tidak sama.";
  return null;
}
