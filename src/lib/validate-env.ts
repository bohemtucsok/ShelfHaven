/**
 * Validates critical environment variables at application startup.
 * Called from instrumentation or layout.
 */
export function validateEnv() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    console.error("[SECURITY] NEXTAUTH_SECRET is not set! Authentication will not work properly.");
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must be set in production");
    }
  } else if (secret.length < 32) {
    console.warn("[SECURITY] NEXTAUTH_SECRET is shorter than 32 characters. Use a stronger secret for production.");
  } else if (
    secret === "your-secret-key-change-me-in-production" ||
    secret === "secret" ||
    secret === "changeme" ||
    secret === "development-secret-change-in-production" ||
    secret === "fejlesztes-titok-valtoztasd-meg-productionben"
  ) {
    console.warn("[SECURITY] NEXTAUTH_SECRET appears to be a default/placeholder value. Change it for production!");
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must not be a default value in production");
    }
  }

  // Validate DATABASE_URL exists
  if (!process.env.DATABASE_URL) {
    console.error("[CONFIG] DATABASE_URL is not set!");
  }
}
