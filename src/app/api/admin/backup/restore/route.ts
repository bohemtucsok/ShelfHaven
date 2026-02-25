import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOperation, hasRunningOperation } from "@/lib/backup/progress-store";
import { restoreBackup } from "@/lib/backup/restore-service";
import type { RestoreMode } from "@/lib/backup/types";

const RESTORE_LIMIT = { interval: 10 * 60 * 1000, maxRequests: 1 }; // 1 per 10 min

export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const { error, status } = await requireAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const rateLimited = checkRateLimit(request, "admin-restore", RESTORE_LIMIT);
    if (rateLimited) return rateLimited;

    if (hasRunningOperation()) {
      return NextResponse.json({ error: "Another operation is already running" }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Invalid file type, expected .zip" }, { status: 400 });
    }

    const mode = (formData.get("mode") as RestoreMode) || "wipe";
    if (mode !== "wipe" && mode !== "merge") {
      return NextResponse.json({ error: "Invalid mode, expected 'wipe' or 'merge'" }, { status: 400 });
    }

    const operationId = createOperation("restore");
    const buffer = await file.arrayBuffer();

    // Start restore in background (don't await full completion)
    restoreBackup(operationId, buffer, mode).then((result) => {
      if (!result.success) {
        console.error("[Restore] Failed:", result);
      }
    });

    return NextResponse.json({ operationId });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
