import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { testSmtpConnection } from "@/lib/email";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, ADMIN_LIMIT } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "admin", ADMIN_LIMIT);
  if (limited) return limited;

  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  // Get current settings from DB
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: ["smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass"],
      },
    },
  });

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  // Allow overriding with request body (for testing before saving)
  const body = await request.json().catch(() => ({}));
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      if (typeof value === "string" && value !== "••••••••") {
        settings[key] = value;
      }
    }
  }

  if (!settings.smtp_host) {
    return NextResponse.json(
      { success: false, error: "SMTP host nincs beállítva" },
      { status: 400 }
    );
  }

  const result = await testSmtpConnection(settings);
  return NextResponse.json(result);
}
