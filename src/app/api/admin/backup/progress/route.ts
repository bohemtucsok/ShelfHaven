import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getProgress } from "@/lib/backup/progress-store";

// GET: SSE progress stream
export async function GET(request: NextRequest) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const operationId = request.nextUrl.searchParams.get("operationId");
  if (!operationId) {
    return NextResponse.json({ error: "Missing operationId" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        const progress = getProgress(operationId);
        if (!progress) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Not found" })}\n\n`));
          clearInterval(interval);
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));

        if (progress.status === "completed" || progress.status === "failed") {
          clearInterval(interval);
          controller.close();
        }
      }, 500);

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
