"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import SaveToLibraryButton from "@/components/bookshelf/SaveToLibraryButton";

interface ActivityUser {
  id: string;
  name: string | null;
  avatarUrl: string;
}

interface ActivityBook {
  id: string;
  title: string;
  coverUrl: string | null;
}

export interface ActivityData {
  id: string;
  type: string;
  metadata: Record<string, string | number | boolean> | null;
  createdAt: string;
  user: ActivityUser;
  book: ActivityBook | null;
  targetUser: ActivityUser | null;
}

function getTimeAgo(date: Date, t: ReturnType<typeof useTranslations>): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("daysAgo", { count: days });
  const weeks = Math.floor(days / 7);
  return t("weeksAgo", { count: weeks });
}

export default function ActivityCard({ activity }: { activity: ActivityData }) {
  const t = useTranslations("activity");
  const { data: session } = useSession();
  const timeAgo = getTimeAgo(new Date(activity.createdAt), t);

  const renderContent = () => {
    switch (activity.type) {
      case "book_upload":
        return (
          <span>
            <UserLink user={activity.user} /> {t("bookUploaded")}
            {activity.book && <BookLink book={activity.book} />}
          </span>
        );
      case "book_finished":
        return (
          <span>
            <UserLink user={activity.user} /> {t("bookFinished")}
            {activity.book && <BookLink book={activity.book} />}
          </span>
        );
      case "review_posted":
        return (
          <span>
            <UserLink user={activity.user} /> {t("reviewPosted")}
            {activity.book && <BookLink book={activity.book} />}
            {activity.metadata?.rating && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: activity.metadata.rating as number }, (_, i) => (
                  <svg key={i} className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </span>
            )}
          </span>
        );
      case "shelf_created":
        return (
          <span>
            <UserLink user={activity.user} /> {t("shelfCreated")}
            {activity.metadata?.shelfName && (
              <span className="font-medium text-[var(--text-primary)]"> &quot;{activity.metadata.shelfName as string}&quot;</span>
            )}
          </span>
        );
      case "book_saved":
        return (
          <span>
            <UserLink user={activity.user} /> {t("bookSaved")}
            {activity.book && <BookLink book={activity.book} />}
          </span>
        );
      case "started_following":
        return (
          <span>
            <UserLink user={activity.user} /> {t("startedFollowing")}
            {activity.targetUser && <UserLink user={activity.targetUser} />}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 p-3 dark:border-amber-800/20 dark:bg-[var(--bg-card)]">
      <Link href={`/user/${activity.user.id}`} className="shrink-0">
        <Image
          src={activity.user.avatarUrl}
          alt={activity.user.name || "Avatar"}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-secondary)]">{renderContent()}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{timeAgo}</p>
      </div>
      {activity.book?.coverUrl && (
        <div className="relative shrink-0">
          <Link href={`/book/${activity.book.id}`}>
            <Image
              src={activity.book.coverUrl}
              alt={activity.book.title}
              width={40}
              height={56}
              className="h-14 w-10 rounded object-cover"
            />
          </Link>
          {session?.user?.id && activity.user.id !== session.user.id && activity.book && (
            <div className="absolute -right-1 -top-1">
              <SaveToLibraryButton
                bookId={activity.book.id}
                isOwned={false}
                variant="icon"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserLink({ user }: { user: { id: string; name: string | null } }) {
  return (
    <Link href={`/user/${user.id}`} className="font-semibold text-[var(--text-primary)] hover:underline">
      {user.name || "?"}
    </Link>
  );
}

function BookLink({ book }: { book: { id: string; title: string } }) {
  return (
    <>
      {" "}
      <Link href={`/book/${book.id}`} className="font-medium text-amber-700 hover:underline dark:text-[var(--accent-gold)]">
        {book.title}
      </Link>
    </>
  );
}
