import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

const FONT_FAMILIES = [
  "Georgia, serif",
  "Inter, system-ui, sans-serif",
  "Courier New, monospace",
] as const;

const DEFAULT_SETTINGS = {
  fontSize: 100,
  isDarkTheme: false,
  fontFamily: "Georgia, serif" as string,
};

const settingsSchema = z.object({
  fontSize: z.number().int().min(70).max(150),
  isDarkTheme: z.boolean(),
  fontFamily: z.enum(FONT_FAMILIES),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { readerSettings: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const settings = user.readerSettings
    ? { ...DEFAULT_SETTINGS, ...(user.readerSettings as Record<string, unknown>) }
    : DEFAULT_SETTINGS;

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = settingsSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid settings", details: result.error.flatten() }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { readerSettings: result.data },
  });

  return NextResponse.json(result.data);
}
