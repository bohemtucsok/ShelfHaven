import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOperation, hasRunningOperation } from "@/lib/backup/progress-store";
import { restoreBackup } from "@/lib/backup/restore-service";
import type { RestoreMode } from "@/lib/backup/types";
import { getRestoreUploadMaxBytes } from "@/lib/backup/restore-limits";
import { MULTIPART_OVERHEAD_ALLOWANCE } from "@/lib/upload-limits";
import { declaredLengthExceeds, limitBodyStream } from "@/lib/request-body";

const MB = 1024 * 1024;

function backupTooLarge(maxBytes: number) {
  const maxMb = Math.floor(maxBytes / MB);
  return NextResponse.json(
    { error: `Backup file too large (max ${maxMb} MB, RESTORE_UPLOAD_MAX_MB)`, maxMb },
    { status: 413 }
  );
}

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

    // Size limit of the uploaded ZIP (not its decompressed contents): checked
    // before reading (declared length) and while reading (missing or forged
    // Content-Length); the counting stream feeds formData() without a copy.
    const maxUploadBytes = getRestoreUploadMaxBytes();
    const maxBodyBytes = maxUploadBytes + MULTIPART_OVERHEAD_ALLOWANCE;
    if (declaredLengthExceeds(request, maxBodyBytes)) {
      return backupTooLarge(maxUploadBytes);
    }
    const limited = limitBodyStream(request, maxBodyBytes);
    let formData: FormData;
    try {
      formData = await new Response(limited.body, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch (err) {
      if (limited.exceeded()) return backupTooLarge(maxUploadBytes);
      throw err; // malformed body: unchanged behaviour (500 below)
    }
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
