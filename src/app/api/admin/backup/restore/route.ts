import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireAdmin } from "@/lib/admin";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOperation, hasRunningOperation } from "@/lib/backup/progress-store";
import { restoreBackup } from "@/lib/backup/restore-service";
import type { RestoreMode } from "@/lib/backup/types";
import { getRestoreUploadMaxBytes } from "@/lib/backup/restore-limits";
import { MULTIPART_OVERHEAD_ALLOWANCE } from "@/lib/upload-limits";
import { declaredLengthExceeds, limitBodyStream } from "@/lib/request-body";
import {
  receiveMultipart,
  MultipartFormatError,
  MultipartLimitError,
  type MultipartResult,
} from "@/lib/multipart-upload";

const MB = 1024 * 1024;

function backupTooLarge(maxBytes: number) {
  const maxMb = Math.floor(maxBytes / MB);
  return NextResponse.json(
    { error: `Backup file too large (max ${maxMb} MB, RESTORE_UPLOAD_MAX_MB)`, maxMb },
    { status: 413 }
  );
}

/** The ZIP as an ArrayBuffer without a further copy when readFile gave a dedicated buffer. */
function toArrayBuffer(data: Buffer): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = data;
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer;
  }
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
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
    // Content-Length). The ZIP part is streamed into a temporary file and read
    // back once for restoreBackup(); the multipart body is never buffered.
    const maxUploadBytes = getRestoreUploadMaxBytes();
    const maxBodyBytes = maxUploadBytes + MULTIPART_OVERHEAD_ALLOWANCE;
    if (declaredLengthExceeds(request, maxBodyBytes)) {
      return backupTooLarge(maxUploadBytes);
    }
    const limited = limitBodyStream(request, maxBodyBytes);
    const tmpDir = await mkdtemp(path.join(tmpdir(), "shelfhaven-restore-"));
    let buffer: ArrayBuffer;
    let mode: RestoreMode;
    try {
      let parsed: MultipartResult;
      try {
        parsed = await receiveMultipart(limited.body, {
          contentType: request.headers.get("content-type") ?? "",
          fileField: "file",
          tmpPath: path.join(tmpDir, "backup.zip"),
          acceptFile: (name) => name.endsWith(".zip"),
          limits: {
            fileSize: maxUploadBytes,
            fields: 10,
            fieldSize: 1024,
            parts: 11,
            headerPairs: 8,
          },
        });
      } catch (err) {
        if (limited.exceeded() || err instanceof MultipartLimitError) {
          return backupTooLarge(maxUploadBytes);
        }
        if (err instanceof MultipartFormatError) {
          return NextResponse.json({ error: "Invalid multipart request" }, { status: 400 });
        }
        throw err;
      }

      const file = parsed.file;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      if (!file.filename.endsWith(".zip") || !file.path) {
        return NextResponse.json({ error: "Invalid file type, expected .zip" }, { status: 400 });
      }

      mode = (parsed.fields.get("mode")?.[0] as RestoreMode) || "wipe";
      if (mode !== "wipe" && mode !== "merge") {
        return NextResponse.json({ error: "Invalid mode, expected 'wipe' or 'merge'" }, { status: 400 });
      }

      // JSZip needs the whole archive: read it back exactly once.
      buffer = toArrayBuffer(await readFile(file.path));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }

    const operationId = createOperation("restore");

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
