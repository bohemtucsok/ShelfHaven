import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, ADMIN_LIMIT } from "@/lib/rate-limit";
import bcryptjs from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(2, "A név legalább 2 karakter legyen"),
  email: z.string().email("Érvénytelen email cím"),
  password: z.string()
    .min(8, "A jelszó legalább 8 karakter legyen")
    .regex(/[A-Z]/, "A jelszó tartalmazzon legalább egy nagybetűt")
    .regex(/[a-z]/, "A jelszó tartalmazzon legalább egy kisbetűt")
    .regex(/[0-9]/, "A jelszó tartalmazzon legalább egy számot"),
  role: z.enum(["USER", "ADMIN"]).optional().default("USER"),
});

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "admin", ADMIN_LIMIT);
  if (limited) return limited;

  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1") || 1, 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20") || 20, 1), 100);
  const skip = (page - 1) * limit;

  const q = url.searchParams.get("q") || "";
  const where = q
    ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { books: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page });
}

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "admin", ADMIN_LIMIT);
  if (limited) return limited;

  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await request.json();
    const validated = createUserSchema.parse(body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ez az email cím már foglalt" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcryptjs.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email.toLowerCase(),
        password: hashedPassword,
        role: validated.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }
    console.error("[admin/users] POST error:", err);
    return NextResponse.json(
      { error: "Szerverhiba történt" },
      { status: 500 }
    );
  }
}
