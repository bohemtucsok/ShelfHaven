"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import FollowButton from "@/components/social/FollowButton";
import FollowersList from "@/components/social/FollowersList";

interface PublicUser {
  id: string;
  name: string | null;
  avatarUrl: string;
  createdAt: string;
  _count: { books: number; followers: number; following: number };
  shelves: Array<{
    id: string;
    name: string;
    description: string | null;
    _count: { books: number };
    books: Array<{
      book: { id: string; title: string; coverUrl: string | null };
    }>;
  }>;
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const t = useTranslations("profile");
  const tf = useTranslations("follow");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/user/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-amber-700/70">{t("userNotFound")}</p>
      </div>
    );
  }

  const initials = (user.name || "?")[0].toUpperCase();
  const memberSince = new Date(user.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "hu-HU", {
    year: "numeric",
    month: "long",
  });
  const isOwnProfile = session?.user?.id === user.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl px-4 py-8"
    >
      {/* User card */}
      <div className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-6 shadow-lg dark:border-amber-800/30 dark:bg-[var(--bg-card)]">
        <div className="flex items-center gap-4">
          <Image
            src={user.avatarUrl}
            alt={user.name || "Avatar"}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                {user.name || t("anonymousUser")}
              </h1>
              {!isOwnProfile && session?.user && (
                <FollowButton userId={user.id} />
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {tc("memberSince")} {memberSince} &middot; {user._count.books} {tc("books")}
            </p>
            {/* Follower/following counts */}
            <div className="mt-2 flex items-center gap-4 text-sm">
              <button
                onClick={() => setFollowersOpen(true)}
                className="text-[var(--text-secondary)] transition-colors hover:text-amber-700"
              >
                <span className="font-semibold text-[var(--text-primary)]">{user._count.followers}</span>{" "}
                {tf("followers")}
              </button>
              <button
                onClick={() => setFollowingOpen(true)}
                className="text-[var(--text-secondary)] transition-colors hover:text-amber-700"
              >
                <span className="font-semibold text-[var(--text-primary)]">{user._count.following}</span>{" "}
                {tf("following")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Public shelves */}
      {user.shelves.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">
            {t("publicShelves")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {user.shelves.map((shelf) => (
              <div
                key={shelf.id}
                className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-4 shadow-md dark:border-amber-800/30 dark:bg-[var(--bg-card)]"
              >
                <h3 className="font-bold text-[var(--text-primary)]">{shelf.name}</h3>
                {shelf.description && (
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {shelf.description}
                  </p>
                )}
                <p className="mt-2 text-sm text-amber-700/70">
                  {shelf._count.books} {tc("books")}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  {shelf.books.map((sb) => (
                    <div
                      key={sb.book.id}
                      className="relative h-14 w-10 overflow-hidden rounded-sm border border-amber-800/20 bg-gradient-to-br from-amber-800 to-amber-950 shadow-sm"
                    >
                      {sb.book.coverUrl ? (
                        <Image
                          src={sb.book.coverUrl}
                          alt={sb.book.title}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-xs">📖</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {user.shelves.length === 0 && (
        <div className="mt-8 text-center text-amber-700/60">
          <p>{t("noPublicShelves")}</p>
        </div>
      )}

      {/* Followers/Following modals */}
      <FollowersList
        userId={user.id}
        type="followers"
        isOpen={followersOpen}
        onClose={() => setFollowersOpen(false)}
      />
      <FollowersList
        userId={user.id}
        type="following"
        isOpen={followingOpen}
        onClose={() => setFollowingOpen(false)}
      />
    </motion.div>
  );
}
