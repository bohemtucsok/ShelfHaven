import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGravatarUrl } from "@/lib/gravatar";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: { select: { books: true, followers: true, following: true } },
      shelves: {
        where: { isPublic: true },
        include: {
          books: {
            take: 5,
            include: {
              book: {
                select: { id: true, title: true, coverUrl: true },
              },
            },
          },
          _count: { select: { books: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Remove email from public response, compute avatar server-side
  const { email, ...userWithoutEmail } = user;
  const userWithProxiedCovers = {
    ...userWithoutEmail,
    avatarUrl: getGravatarUrl(email, 160),
    shelves: user.shelves.map((shelf) => ({
      ...shelf,
      books: shelf.books.map((sb) => ({
        ...sb,
        book: {
          ...sb.book,
          coverUrl: sb.book.coverUrl ? `/api/books/${sb.book.id}/cover` : null,
        },
      })),
    })),
  };

  return NextResponse.json(userWithProxiedCovers);
}
