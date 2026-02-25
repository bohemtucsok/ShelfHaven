import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createOperation, hasRunningOperation } from "@/lib/backup/progress-store";
import { createBackup } from "@/lib/backup/backup-service";

const BACKUP_LIMIT = { interval: 5 * 60 * 1000, maxRequests: 1 }; // 1 per 5 min

// POST: Start backup operation
export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const { error, status } = await requireAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const rateLimited = checkRateLimit(request, "admin-backup", BACKUP_LIMIT);
    if (rateLimited) return rateLimited;

    if (hasRunningOperation()) {
      return NextResponse.json({ error: "Another operation is already running" }, { status: 409 });
    }

    const operationId = createOperation("backup");

    // Start backup in background (don't await)
    createBackup(operationId).catch(() => {});

    return NextResponse.json({ operationId });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET: Last backup info
export async function GET() {
  try {
    const { error, status } = await requireAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const [dateSetting, sizeSetting, countsSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "backup_last_date" } }),
      prisma.setting.findUnique({ where: { key: "backup_last_size" } }),
      prisma.setting.findUnique({ where: { key: "backup_last_counts" } }),
    ]);

    if (!dateSetting) {
      return NextResponse.json({ lastBackup: null });
    }

    return NextResponse.json({
      lastBackup: {
        date: dateSetting.value,
        size: sizeSetting?.value || "?",
        counts: countsSetting ? JSON.parse(countsSetting.value) : {},
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
