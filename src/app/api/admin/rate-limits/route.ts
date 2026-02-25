import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRateLimitStats } from "@/lib/rate-limit";

export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const stats = getRateLimitStats();

  // Group by prefix for summary
  const byPrefix: Record<string, { total: number; blocked: number; ips: Set<string> }> = {};
  for (const entry of stats) {
    if (!byPrefix[entry.prefix]) {
      byPrefix[entry.prefix] = { total: 0, blocked: 0, ips: new Set() };
    }
    byPrefix[entry.prefix].total++;
    byPrefix[entry.prefix].ips.add(entry.ip);
    if (entry.maxRequests > 0 && entry.count >= entry.maxRequests) {
      byPrefix[entry.prefix].blocked++;
    }
  }

  const summary = Object.entries(byPrefix).map(([prefix, data]) => ({
    prefix,
    activeLimits: data.total,
    blockedIps: data.blocked,
    uniqueIps: data.ips.size,
  }));

  return NextResponse.json({
    entries: stats.map((s) => ({
      ...s,
      remaining: Math.max(0, s.maxRequests - s.count),
      resetsIn: Math.max(0, Math.ceil((s.resetAt - Date.now()) / 1000)),
    })),
    summary,
    totalActive: stats.length,
    totalBlocked: stats.filter((s) => s.maxRequests > 0 && s.count >= s.maxRequests).length,
  });
}
