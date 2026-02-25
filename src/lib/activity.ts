import { prisma } from "@/lib/prisma";

const VALID_ACTIVITY_TYPES = [
  "book_upload",
  "book_finished",
  "review_posted",
  "shelf_created",
  "started_following",
] as const;

export type ActivityType = (typeof VALID_ACTIVITY_TYPES)[number];

export async function createActivity({
  userId,
  type,
  bookId,
  targetUserId,
  metadata,
}: {
  userId: string;
  type: ActivityType;
  bookId?: string;
  targetUserId?: string;
  metadata?: Record<string, string | number | boolean>;
}) {
  if (!VALID_ACTIVITY_TYPES.includes(type)) return;
  await prisma.activity.create({
    data: { userId, type, bookId, targetUserId, metadata: metadata as Record<string, string | number | boolean> ?? undefined },
  });
}
