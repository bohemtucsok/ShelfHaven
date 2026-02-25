import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security-logger";
import { checkRateLimit, AUTH_LIMIT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "verify-email", AUTH_LIMIT);
  if (limited) return limited;

  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Hiányzó token" }, { status: 400 });
  }

  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt token" }, { status: 400 });
  }

  if (verificationToken.expires < new Date()) {
    // Clean up expired token
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "A token lejárt. Kérj új megerősítő emailt." }, { status: 400 });
  }

  // Mark user as verified
  await prisma.user.updateMany({
    where: { email: verificationToken.identifier },
    data: { emailVerified: new Date() },
  });

  // Delete the used token
  await prisma.verificationToken.delete({ where: { token } });

  logSecurityEvent("REGISTER_SUCCESS", {
    request,
    email: verificationToken.identifier,
    details: "email_verified",
  });

  return NextResponse.json({ success: true, message: "Email sikeresen megerősítve!" });
}

// POST - resend verification email
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "auth", AUTH_LIMIT);
  if (limited) return limited;

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "Email szükséges" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  // Don't reveal if user exists - always return success
  if (!user || user.emailVerified) {
    return NextResponse.json({ success: true });
  }

  const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email");
  const token = await createVerificationToken(email);
  await sendVerificationEmail(email, token);

  return NextResponse.json({ success: true });
}
