import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcryptjs from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, REGISTER_LIMIT } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-logger";

const registerSchema = z.object({
  name: z.string().min(2, "A név legalább 2 karakter legyen"),
  email: z.string().email("Érvénytelen email cím"),
  password: z.string()
    .min(8, "A jelszó legalább 8 karakter legyen")
    .regex(/[A-Z]/, "A jelszó tartalmazzon legalább egy nagybetűt")
    .regex(/[a-z]/, "A jelszó tartalmazzon legalább egy kisbetűt")
    .regex(/[0-9]/, "A jelszó tartalmazzon legalább egy számot"),
});

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, "register", REGISTER_LIMIT);
  if (rateLimited) return rateLimited;

  // Check if registration is enabled (admin toggle)
  try {
    const regSetting = await prisma.setting.findUnique({ where: { key: "registration_enabled" } });
    if (regSetting?.value === "false") {
      return NextResponse.json(
        { error: "A regisztráció jelenleg le van tiltva" },
        { status: 403 }
      );
    }
    // If no setting exists yet (first setup), allow registration
  } catch {
    // If DB is not reachable, deny registration (fail-closed)
    return NextResponse.json(
      { error: "A szolgáltatás átmenetileg nem elérhető" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      logSecurityEvent("REGISTER_FAILED", { request, email: validated.email, details: "duplicate_email" });
      return NextResponse.json(
        { error: "A regisztráció nem sikerült. Kérjük ellenőrizd az adataidat." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcryptjs.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
      },
    });

    // Send verification email only if enabled in admin settings (default: off)
    try {
      const emailVerifSetting = await prisma.setting.findUnique({
        where: { key: "email_verification_enabled" },
      });
      if (emailVerifSetting?.value === "true") {
        const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email");
        const token = await createVerificationToken(validated.email);
        await sendVerificationEmail(validated.email, token);
      }
    } catch (e) {
      console.error("Failed to send verification email:", e);
    }

    logSecurityEvent("REGISTER_SUCCESS", { request, email: validated.email });

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Szerverhiba történt" },
      { status: 500 }
    );
  }
}
