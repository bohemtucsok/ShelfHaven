import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { refreshAuthInstance } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, ADMIN_LIMIT } from "@/lib/rate-limit";

const SMTP_KEYS = [
  "email_verification_enabled",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_pass",
  "smtp_from",
] as const;

const OIDC_KEYS = [
  "oidc_enabled",
  "oidc_issuer",
  "oidc_client_id",
  "oidc_client_secret",
  "oidc_only",
] as const;

const REGISTRATION_KEYS = [
  "registration_enabled",
] as const;

const METADATA_KEYS = [
  "hardcover_api_key",
] as const;

const ALL_SETTING_KEYS = [
  ...SMTP_KEYS,
  ...OIDC_KEYS,
  ...REGISTRATION_KEYS,
  ...METADATA_KEYS,
] as const;

// Keys whose values should be masked in GET responses
const MASKED_KEYS = new Set<string>(["smtp_pass", "oidc_client_secret", "hardcover_api_key"]);
const MASK_PLACEHOLDER = "••••••••";

export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const rows = await prisma.setting.findMany({
    where: { key: { in: [...ALL_SETTING_KEYS] } },
  });

  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (MASKED_KEYS.has(row.key)) {
      settings[row.key] = row.value ? MASK_PLACEHOLDER : "";
    } else {
      settings[row.key] = row.value;
    }
  }

  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "admin", ADMIN_LIMIT);
  if (limited) return limited;

  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { settings } = body as { settings: Record<string, string> };

  if (!settings || typeof settings !== "object") {
    return NextResponse.json({ error: "Hibás kérés" }, { status: 400 });
  }

  let oidcChanged = false;

  // Upsert each setting
  for (const key of ALL_SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;

    // Skip masked secrets if the placeholder was sent back unchanged
    if (MASKED_KEYS.has(key) && value === MASK_PLACEHOLDER) continue;

    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    // Track if any OIDC key was changed
    if ((OIDC_KEYS as readonly string[]).includes(key)) {
      oidcChanged = true;
    }
  }

  // If OIDC settings changed, force auth instance to re-initialize
  if (oidcChanged) {
    refreshAuthInstance();
  }

  return NextResponse.json({ success: true });
}
