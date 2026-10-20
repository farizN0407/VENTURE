export const usernamePattern = /^[a-z0-9][a-z0-9_]{2,23}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return usernamePattern.test(value);
}

export function usernameLabel(username: string | null | undefined, email: string | null | undefined) {
  const normalized = typeof username === "string" ? normalizeUsername(username) : "";
  if (isValidUsername(normalized)) return normalized;
  const emailPrefix = typeof email === "string" ? email.split("@", 1)[0]?.trim() : "";
  return emailPrefix || "Pengguna";
}
