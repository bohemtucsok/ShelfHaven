import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getBackupBuffer } from "@/lib/backup/backup-service";

// GET: Download completed backup ZIP
export async function GET(request: NextRequest) {
  try {
    const { error, status } = await requireAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const operationId = request.nextUrl.searchParams.get("operationId");
    if (!operationId) {
      return NextResponse.json({ error: "Missing operationId" }, { status: 400 });
    }

    const buffer = getBackupBuffer(operationId);
    if (!buffer) {
      return NextResponse.json({ error: "Backup not found or expired" }, { status: 404 });
    }

    const date = new Date().toISOString().slice(0, 10);
    return new Response(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="shelfhaven-backup-${date}.zip"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
