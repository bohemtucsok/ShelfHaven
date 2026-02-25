type SecurityEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "REGISTER_SUCCESS"
  | "REGISTER_FAILED"
  | "UPLOAD_SUCCESS"
  | "UPLOAD_FAILED"
  | "DELETE_BOOK"
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "SUSPICIOUS_REQUEST";

interface SecurityLogEntry {
  timestamp: string;
  event: SecurityEvent;
  ip?: string;
  userId?: string;
  email?: string;
  details?: string;
  userAgent?: string;
}

export function logSecurityEvent(
  event: SecurityEvent,
  context: {
    request?: Request;
    userId?: string;
    email?: string;
    details?: string;
  }
) {
  const entry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    userId: context.userId,
    email: context.email,
    details: context.details,
  };

  if (context.request) {
    entry.ip =
      context.request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      context.request.headers.get("x-real-ip") ||
      "unknown";
    entry.userAgent =
      context.request.headers.get("user-agent") || undefined;
  }

  // Structured JSON log for Docker/log aggregators
  console.log(JSON.stringify({ level: "SECURITY", ...entry }));
}
