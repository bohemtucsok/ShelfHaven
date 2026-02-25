import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile, uploadFile, toPublicUrl } from "@/lib/storage/minio";
import { downloadAndResizeCover } from "@/lib/ebook/cover-utils";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/security-logger";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      categories: { include: { category: true } },
      topics: { include: { topic: true } },
      user: { select: { id: true, name: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { likes: true } },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Könyv nem található" }, { status: 404 });
  }

  // Increment view count (fire-and-forget)
  prisma.book.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  // Calculate average rating
  const avgRating =
    book.reviews.length > 0
      ? book.reviews.reduce((sum, r) => sum + r.rating, 0) / book.reviews.length
      : 0;

  // Base response (public)
  // Replace direct MinIO cover URL with proxy URL to avoid Docker hostname issues
  const proxiedCoverUrl = book.coverUrl ? `/api/books/${id}/cover` : null;

  const response: Record<string, unknown> = {
    ...book,
    fileUrl: toPublicUrl(book.fileUrl),
    coverUrl: proxiedCoverUrl,
    avgRating: Math.round(avgRating * 10) / 10,
    totalLikes: book._count.likes,
    isOwner: false,
    liked: false,
    saved: false,
  };

  // Authenticated extras (parallel queries)
  if (session?.user?.id) {
    response.isOwner = book.userId === session.user.id;

    const [userLike, progress, userSaved] = await Promise.all([
      prisma.like.findUnique({
        where: { userId_bookId: { userId: session.user.id, bookId: id } },
      }),
      prisma.readingProgress.findFirst({
        where: { userId: session.user.id, bookId: id },
      }),
      prisma.savedBook.findUnique({
        where: { userId_bookId: { userId: session.user.id, bookId: id } },
      }),
    ]);
    response.liked = !!userLike;
    response.saved = !!userSaved;
    if (progress) {
      response.readingProgress = progress;
    }
  }

  return NextResponse.json(response);
}

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  author: z.string().max(200).optional(),
  description: z.string().max(10000).optional(),
  language: z.string().max(10).optional(),
  publishedYear: z.number().int().min(0).max(2100).optional(),
  categoryIds: z.array(z.string()).max(20).optional(),
  topicIds: z.array(z.string()).max(20).optional(),
  coverUrl: z.string().url().optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const validated = updateSchema.parse(body);

  const existing = await prisma.book.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Könyv nem található" }, { status: 404 });
  }

  const { categoryIds, topicIds, coverUrl: externalCoverUrl, ...bookData } = validated;

  // Download and upload external cover image if provided
  let newCoverUrl: string | undefined;
  if (externalCoverUrl) {
    try {
      const coverResult = await downloadAndResizeCover(externalCoverUrl);
      if (coverResult) {
        const timestamp = Date.now();
        const coverKey = `${session.user.id}/${timestamp}_cover.jpg`;
        newCoverUrl = await uploadFile(
          process.env.MINIO_BUCKET_COVERS!,
          coverKey,
          coverResult.data,
          coverResult.contentType
        );
        // Delete old cover if it exists
        if (existing.coverUrl) {
          try {
            const oldKey = existing.coverUrl.split("/").slice(-2).join("/");
            await deleteFile(process.env.MINIO_BUCKET_COVERS!, oldKey);
          } catch {
            // Silent fail for old cover deletion
          }
        }
      }
    } catch {
      // Silent fail for cover download
    }
  }

  const book = await prisma.book.update({
    where: { id },
    data: {
      ...bookData,
      ...(newCoverUrl && { coverUrl: newCoverUrl }),
      ...(categoryIds && {
        categories: {
          deleteMany: {},
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
      }),
      ...(topicIds && {
        topics: {
          deleteMany: {},
          create: topicIds.map((topicId) => ({ topicId })),
        },
      }),
    },
    include: {
      categories: { include: { category: true } },
      topics: { include: { topic: true } },
    },
  });

  return NextResponse.json({
    ...book,
    coverUrl: book.coverUrl ? `/api/books/${id}/cover` : null,
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!book) {
    return NextResponse.json({ error: "Könyv nem található" }, { status: 404 });
  }

  // Delete files from MinIO
  try {
    const extractKey = (url: string) => {
      const u = new URL(url);
      // path: /bucket/userId/timestamp_filename → key: userId/timestamp_filename
      return u.pathname.split("/").slice(2).join("/");
    };

    await deleteFile(process.env.MINIO_BUCKET_EBOOKS!, extractKey(book.fileUrl));

    // Delete original file if conversion created a separate EPUB
    if (book.originalFileUrl && book.originalFileUrl !== book.fileUrl) {
      await deleteFile(process.env.MINIO_BUCKET_EBOOKS!, extractKey(book.originalFileUrl));
    }

    if (book.coverUrl) {
      await deleteFile(process.env.MINIO_BUCKET_COVERS!, extractKey(book.coverUrl));
    }
  } catch {
    // Continue even if file deletion fails
  }

  await prisma.book.delete({ where: { id } });

  logSecurityEvent("DELETE_BOOK", { request, userId: session.user.id, details: id });

  return NextResponse.json({ success: true });
}
