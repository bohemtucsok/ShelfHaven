import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection: validates Origin header matches Host on state-changing requests.
 * Returns a 403 response if validation fails, or null if OK.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");

  // No origin = server-side call (RSC, server action) → allow
  if (!origin) return null;

  const host = request.headers.get("host");

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "CSRF validation failed" },
      { status: 403 }
    );
  }

  return null;
}
