import { prisma } from "@/lib/prisma";

// Strip HTML tags to prevent stored XSS in notification messages
function sanitizeMessage(message: string): string {
  return message.replace(/<[^>]*>/g, "").slice(0, 500);
}

export async function createNotification({
  userId,
  type,
  message,
  bookId,
  fromUserId,
}: {
  userId: string;
  type: string;
  message: string;
  bookId?: string;
  fromUserId?: string;
}) {
  // Don't notify yourself
  if (userId === fromUserId) return;

  await prisma.notification.create({
    data: { userId, type, message: sanitizeMessage(message), bookId, fromUserId },
  });
}
