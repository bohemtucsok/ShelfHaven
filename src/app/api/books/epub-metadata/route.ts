import { NextRequest, NextResponse } from "next/server";
import { parseEpub } from "@/lib/ebook/epub-parser";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_FILE_SIZE, MULTIPART_OVERHEAD_ALLOWANCE } from "@/lib/upload-limits";
import { limitBodyStream, declaredLengthExceeds } from "@/lib/request-body";

const MAX_BODY_SIZE = MAX_UPLOAD_FILE_SIZE + MULTIPART_OVERHEAD_ALLOWANCE;

function payloadTooLarge() {
  return NextResponse.json(
    { error: "A fájl mérete meghaladja a 100MB limitet" },
    { status: 413 }
  );
}

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "epub-metadata", API_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Size limit before reading the body (declared length) ...
  if (declaredLengthExceeds(request, MAX_BODY_SIZE)) {
    return payloadTooLarge();
  }

  try {
    // ... and while reading it (missing or forged Content-Length). The counting
    // stream feeds formData() directly, so no extra copy of the body is kept.
    const limited = limitBodyStream(request, MAX_BODY_SIZE);
    let formData: FormData;
    try {
      formData = await new Response(limited.body, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch (error) {
      if (limited.exceeded()) return payloadTooLarge();
      throw error; // malformed body: handled by the catch below (500), as before
    }
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nincs fájl" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      return payloadTooLarge();
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "epub") {
      return NextResponse.json({ error: "Csak EPUB fájl támogatott" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await parseEpub(buffer);

    // Convert cover image to base64 for preview
    let coverPreview: string | null = null;
    if (metadata.coverImage) {
      coverPreview = `data:${metadata.coverImage.contentType};base64,${metadata.coverImage.data.toString("base64")}`;
    }

    return NextResponse.json({
      title: metadata.title || null,
      author: metadata.author || null,
      description: metadata.description || null,
      language: metadata.language || null,
      coverPreview,
    });
  } catch (error) {
    console.error("EPUB metadata extraction error:", error);
    return NextResponse.json(
      { error: "Nem sikerült kinyerni a metaadatokat" },
      { status: 500 }
    );
  }
}
