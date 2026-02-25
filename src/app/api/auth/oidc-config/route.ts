import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, PUBLIC_LIMIT } from "@/lib/rate-limit";

/**
 * Public endpoint - NO auth required.
 * Returns OIDC and registration feature flags for the login/register pages.
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "oidc-config", PUBLIC_LIMIT);
  if (limited) return limited;
  try {
    const keys = ["oidc_enabled", "oidc_only", "registration_enabled"];
    const rows = await prisma.setting.findMany({
      where: { key: { in: keys } },
    });

    const map = new Map(rows.map((r) => [r.key, r.value]));

    return NextResponse.json({
      oidcEnabled: map.get("oidc_enabled") === "true",
      oidcOnly: map.get("oidc_only") === "true",
      registrationEnabled: map.get("registration_enabled") !== "false",
    });
  } catch (e) {
    console.error("[oidc-config] Failed to load settings:", e);
    // Fail-open defaults: no OIDC, registration allowed
    return NextResponse.json({
      oidcEnabled: false,
      oidcOnly: false,
      registrationEnabled: true,
    });
  }
}
