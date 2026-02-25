import { NextRequest, NextResponse } from "next/server";
import { parseEpub } from "@/lib/ebook/epub-parser";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "epub-metadata", API_LIMIT);
  if (rateLimited) return rateLimited;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nincs fájl" }, { status: 400 });
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
