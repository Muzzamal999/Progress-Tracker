/** Password rules for account recovery. Enforced in the browser (feedback) and again on the server (authority). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt (used by Supabase Auth) ignores everything past 72 bytes

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "iloveyou", "admin123", "welcome1", "letmein123", "abc12345", "11111111", "00000000",
]);

/** Returns the first problem, or null when the password is acceptable. */
export function validatePassword(password: string, context: { email?: string | null } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} bytes`;
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Use at least one letter and one number";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Choose something less guessable";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Password must not contain your email name";
  return null;
}

/** 0 (very weak) .. 4 (strong), for the strength meter only. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (COMMON.has(password.toLowerCase())) score = 0;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
