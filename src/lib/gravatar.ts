import crypto from "crypto";

/**
 * Server-only Gravatar URL generator using Node.js crypto (not custom MD5).
 * Gravatar requires MD5 hash of the email address.
 */
export function getGravatarUrl(email: string, size = 80): string {
  const hash = crypto
    .createHash("md5")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}
