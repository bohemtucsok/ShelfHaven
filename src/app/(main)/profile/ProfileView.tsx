"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useThemeStore, type Theme } from "@/store/theme-store";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";

interface ProfileData {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    avatarUrl: string;
    language: string;
    theme: string;
    defaultView: string;
    createdAt: string;
  };
  stats: {
    totalBooks: number;
    averageProgress: number;
    formatBreakdown: { format: string; count: number }[];
    finishedBooks: number;
    totalReadingMinutes: number;
    readingStreak: number;
    categoryStats: { name: string; count: number }[];
    followersCount: number;
    followingCount: number;
  };
  recentActivity: {
    bookId: string;
    bookTitle: string;
    bookAuthor: string | null;
    bookCoverUrl: string | null;
    percentage: number;
    lastReadAt: string;
  }[];
}

export default function ProfileView() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const router = useRouter();
  const { theme: currentTheme, setTheme } = useThemeStore();
  const { listOfflineBooks, removeOfflineBook, removeAllOfflineBooks, storageUsage } = useOfflineBooks();
  const [offlineBooks, setOfflineBooks] = useState<Array<{ bookId: string; title: string; author: string; fileSize: number; savedAt: string }>>([]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editLanguage, setEditLanguage] = useState("hu");
  const [readerSettings, setReaderSettings] = useState({
    fontSize: 100,
    isDarkTheme: false,
    fontFamily: "Georgia, serif",
  });
  const [savingReader, setSavingReader] = useState(false);

  useEffect(() => {
    fetch("/api/user/reader-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setReaderSettings(data); })
      .catch(() => {});
  }, []);

  async function saveReaderSettings(updated: typeof readerSettings) {
    setReaderSettings(updated);
    setSavingReader(true);
    try {
      const res = await fetch("/api/user/reader-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        toast.success(t("settingsSaved"));
        try { localStorage.setItem("reader-settings", JSON.stringify(updated)); } catch {}
      } else {
        toast.error(t("settingsSaveFailed"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSavingReader(false);
    }
  }

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) throw new Error("Failed to fetch profile");
        const data = await res.json();
        setProfileData(data);
        setEditName(data.user.name || "");
        setEditLanguage(data.user.language || "hu");
      } catch {
        console.error("Failed to fetch profile data");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // Load offline books list
  useEffect(() => {
    listOfflineBooks().then(setOfflineBooks).catch(() => {});
  }, [listOfflineBooks]);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleSave() {
    if (!profileData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, language: editLanguage }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      const data = await res.json();
      setProfileData({
        ...profileData,
        user: data.user,
      });
      setEditing(false);
      toast.success(t("profileUpdated"));
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="text-amber-700/70">{t("loadingProfile")}</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-amber-700/70">{t("loadFailed")}</p>
      </div>
    );
  }

  const { user, stats, recentActivity } = profileData;
  const memberSince = new Date(user.createdAt).toLocaleDateString(editLanguage === "en" ? "en-US" : "hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-4 py-8"
    >
      {/* User Card */}
      <div className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-6 shadow-lg dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Avatar (Gravatar) */}
          <Image
            src={user.avatarUrl}
            alt={user.name || "Avatar"}
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded-full"
          />

          {/* User Info */}
          <div className="flex-1 text-center sm:text-left">
            {!editing ? (
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                  {user.name || t("anonymousUser")}
                </h1>
                <button
                  onClick={() => {
                    setEditName(user.name || "");
                    setEditing(true);
                  }}
                  className="rounded-md p-1.5 text-amber-700/60 transition-colors hover:bg-amber-200/50 hover:text-amber-700"
                  title={t("editName")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-lg border border-amber-800/20 bg-white px-3 py-1.5 text-lg dark:bg-[var(--bg-input)] dark:border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving || editName.trim().length < 2}
                  className="rounded-lg bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? tc("saving") : tc("save")}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-amber-800/20 bg-white px-4 py-1.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                >
                  {tc("cancel")}
                </button>
              </div>
            )}
            <p className="mt-1 text-[var(--text-muted)]">{user.email}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {tc("memberSince")} {memberSince}
            </p>
            {/* Follower/following stats */}
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)]">{stats.followersCount}</span>{" "}
                {t("followers")}
              </span>
              <span className="text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)]">{stats.followingCount}</span>{" "}
                {t("following")}
              </span>
            </div>
            {/* Language selector */}
            <div className="mt-3 flex items-center gap-2">
              <label
                htmlFor="language-select"
                className="text-sm text-[var(--text-muted)]"
              >
                {tc("language")}
              </label>
              <select
                id="language-select"
                value={editLanguage}
                onChange={async (e) => {
                  const newLang = e.target.value;
                  setEditLanguage(newLang);
                  // Set locale cookie for next-intl
                  document.cookie = `locale=${newLang};path=/;max-age=${365 * 24 * 60 * 60}`;
                  // Auto-save language change
                  try {
                    const res = await fetch("/api/user/profile", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ language: newLang }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setProfileData((prev) =>
                        prev ? { ...prev, user: data.user } : prev
                      );
                      router.refresh();
                    }
                  } catch {
                    toast.error(t("languageUpdateFailed"));
                  }
                }}
                className="rounded-lg border border-amber-800/20 bg-white px-3 py-1 text-sm dark:bg-[var(--bg-input)] dark:border-[var(--border)] text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
              >
                <option value="hu">{tc("hungarian")}</option>
                <option value="en">{tc("english")}</option>
              </select>
            </div>

            {/* Site theme selector */}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm text-[var(--text-muted)]">
                {t("siteTheme")}
              </label>
              <div className="flex gap-1">
                {(["light", "dark", "system"] as Theme[]).map((themeOption) => (
                  <button
                    key={themeOption}
                    onClick={async () => {
                      setTheme(themeOption);
                      try {
                        await fetch("/api/user/profile", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ theme: themeOption }),
                        });
                      } catch {}
                    }}
                    className={`rounded-lg border px-3 py-1 text-sm font-medium transition-colors ${
                      currentTheme === themeOption
                        ? "border-amber-600 bg-amber-700 text-white"
                        : "border-amber-800/20 bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    }`}
                  >
                    {themeOption === "light" && t("themeLight")}
                    {themeOption === "dark" && t("themeDark")}
                    {themeOption === "system" && t("themeSystem")}
                  </button>
                ))}
              </div>
            </div>

            {/* Default library view selector */}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm text-[var(--text-muted)]">
                {t("defaultView")}
              </label>
              <div className="flex gap-1">
                {(["shelf", "grid"] as const).map((viewOption) => (
                  <button
                    key={viewOption}
                    onClick={async () => {
                      setProfileData((prev) => prev ? { ...prev, user: { ...prev.user, defaultView: viewOption } } : prev);
                      try {
                        await fetch("/api/user/profile", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ defaultView: viewOption }),
                        });
                      } catch {}
                    }}
                    className={`rounded-lg border px-3 py-1 text-sm font-medium transition-colors ${
                      profileData?.user.defaultView === viewOption
                        ? "border-amber-600 bg-amber-700 text-white"
                        : "border-amber-800/20 bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    }`}
                  >
                    {viewOption === "shelf" && t("viewShelf")}
                    {viewOption === "grid" && t("viewGrid")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Total Books */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("uploadedBooks")}</p>
          <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-[var(--accent-gold)]">
            {stats.totalBooks}
          </p>
        </div>

        {/* Average Progress */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("averageProgress")}</p>
          <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-[var(--accent-gold)]">
            {Math.round(stats.averageProgress)}%
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/40">
            <div
              className="h-full rounded-full bg-amber-600 transition-all"
              style={{ width: `${Math.min(stats.averageProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* Finished Books */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("finishedBooks")}</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">
            {stats.finishedBooks}
          </p>
        </div>

        {/* Reading Time */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("readingTime")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-[var(--accent-gold)]">
            {stats.totalReadingMinutes >= 60
              ? `${Math.floor(stats.totalReadingMinutes / 60)} ${t("hours")} ${stats.totalReadingMinutes % 60} ${t("minutes")}`
              : `${stats.totalReadingMinutes} ${t("minutes")}`}
          </p>
        </div>

        {/* Reading Streak */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("readingStreak")}</p>
          <p className="mt-1 text-3xl font-bold text-orange-600">
            {stats.readingStreak} <span className="text-lg font-normal">{t("days")}</span>
          </p>
        </div>

        {/* Formats */}
        <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">{t("formats")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.formatBreakdown.length > 0 ? (
              stats.formatBreakdown.map((fb) => (
                <span
                  key={fb.format}
                  className="rounded-full bg-amber-200/60 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-800/30 dark:text-[var(--accent-gold)]"
                >
                  {fb.format} ({fb.count})
                </span>
              ))
            ) : (
              <span className="text-sm text-amber-700/50">{t("noData")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Favorite Categories */}
      {stats.categoryStats.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-xl font-bold text-[var(--text-primary)]">
            {t("favoriteCategories")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.categoryStats.map((cat) => (
              <span
                key={cat.name}
                className="rounded-full bg-amber-700/10 px-4 py-2 text-sm font-medium text-amber-800 dark:bg-amber-800/30 dark:text-[var(--accent-gold)]"
              >
                {cat.name} <span className="text-amber-600/70">({cat.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reader Settings */}
      <div className="mt-6">
        <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">
          {t("readerSettings")}
        </h2>
        <div className="rounded-xl border border-amber-800/20 bg-white p-6 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Theme */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">{t("background")}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => saveReaderSettings({ ...readerSettings, isDarkTheme: false })}
                  disabled={savingReader}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !readerSettings.isDarkTheme
                      ? "border-amber-600 bg-amber-100 text-amber-800"
                      : "border-amber-800/20 bg-amber-50 text-amber-700/60 hover:bg-amber-100"
                  }`}
                >
                  {t("lightTheme")}
                </button>
                <button
                  onClick={() => saveReaderSettings({ ...readerSettings, isDarkTheme: true })}
                  disabled={savingReader}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    readerSettings.isDarkTheme
                      ? "border-amber-600 bg-amber-900 text-amber-100"
                      : "border-amber-800/20 bg-amber-50 text-amber-700/60 hover:bg-amber-100"
                  }`}
                >
                  {t("darkTheme")}
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">{t("fontSize")}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveReaderSettings({ ...readerSettings, fontSize: Math.max(70, readerSettings.fontSize - 10) })}
                  disabled={savingReader || readerSettings.fontSize <= 70}
                  className="rounded-lg border border-amber-800/20 px-3 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                >
                  A-
                </button>
                <span className="flex-1 text-center text-lg font-bold text-amber-800">{readerSettings.fontSize}%</span>
                <button
                  onClick={() => saveReaderSettings({ ...readerSettings, fontSize: Math.min(150, readerSettings.fontSize + 10) })}
                  disabled={savingReader || readerSettings.fontSize >= 150}
                  className="rounded-lg border border-amber-800/20 px-3 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Font Family */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">{t("fontFamily")}</label>
              <div className="flex gap-1">
                {[
                  { label: t("serif"), value: "Georgia, serif" },
                  { label: t("sans"), value: "Inter, system-ui, sans-serif" },
                  { label: t("mono"), value: "Courier New, monospace" },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => saveReaderSettings({ ...readerSettings, fontFamily: f.value })}
                    disabled={savingReader}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      readerSettings.fontFamily === f.value
                        ? "border-amber-600 bg-amber-100 text-amber-800"
                        : "border-amber-800/20 bg-amber-50 text-amber-700/60 hover:bg-amber-100"
                    }`}
                    style={{ fontFamily: f.value }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div
            className={`mt-4 rounded-lg border p-4 transition-colors ${
              readerSettings.isDarkTheme
                ? "border-amber-900/30 bg-[#1a1410] text-[#e0d5c1]"
                : "border-amber-200 bg-[#fefbf6] text-[#2d1b0e]"
            }`}
            style={{ fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize * 0.14}px` }}
          >
            <p>{t("previewText")}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">
          {t("recentReadings")}
        </h2>
        {recentActivity.length === 0 ? (
          <div className="rounded-xl border border-amber-800/20 bg-white p-8 text-center dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
            <p className="text-amber-700/60">
              {t("noReadingsYet")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <Link
                key={item.bookId}
                href={`/book/${item.bookId}`}
                className="flex items-center gap-4 rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)] transition-colors hover:bg-amber-50/50"
              >
                {item.bookCoverUrl ? (
                  <Image
                    src={item.bookCoverUrl}
                    alt={item.bookTitle}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-amber-200 text-amber-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                    </svg>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {item.bookTitle}
                  </p>
                  <p className="truncate text-sm text-[var(--text-muted)]">
                    {item.bookAuthor || t("unknownAuthor")}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-amber-700 dark:text-[var(--accent-gold)]">
                    {Math.round(item.percentage)}%
                  </p>
                  <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/40">
                    <div
                      className="h-full rounded-full bg-amber-600 transition-all"
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                </div>

                <p className="hidden shrink-0 text-xs text-[var(--text-muted)] sm:block">
                  {new Date(item.lastReadAt).toLocaleDateString(editLanguage === "en" ? "en-US" : "hu-HU", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
      {/* Export / Import */}
      <div className="mt-6">
        <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">{t("exportImport")}</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/user/export"
            download
            className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:bg-[var(--bg-card)] dark:border-[var(--border)] dark:text-[var(--text-primary)] dark:hover:bg-amber-900/30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {t("exportLibrary")}
          </a>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:bg-[var(--bg-card)] dark:border-[var(--border)] dark:text-[var(--text-primary)] dark:hover:bg-amber-900/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {t("importLibrary")}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const res = await fetch("/api/user/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  if (res.ok) {
                    const result = await res.json();
                    toast.success(t("importSuccess", { imported: result.imported, skipped: result.skipped }));
                  } else {
                    toast.error(t("importFailed"));
                  }
                } catch {
                  toast.error(t("importFailed"));
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {/* Offline Books */}
      <div className="mt-6">
        <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">{t("offlineBooks")}</h2>
        {storageUsage && (
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            {t("offlineStorage")}: {t("usedSpace", { used: formatBytes(storageUsage.used), quota: formatBytes(storageUsage.quota) })}
          </p>
        )}
        {offlineBooks.length === 0 ? (
          <p className="text-sm italic text-[var(--text-muted)]">{t("noOfflineBooks")}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {offlineBooks.map((ob) => (
                <li
                  key={ob.bookId}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{ob.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ob.author} &middot; {formatBytes(ob.fileSize)} &middot; {new Date(ob.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await removeOfflineBook(ob.bookId);
                      setOfflineBooks((prev) => prev.filter((b) => b.bookId !== ob.bookId));
                      toast.success(tc("delete"));
                    }}
                    className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                    title={tc("delete")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            {offlineBooks.length > 1 && (
              <button
                onClick={async () => {
                  await removeAllOfflineBooks();
                  setOfflineBooks([]);
                  toast.success(t("removeAllOffline"));
                }}
                className="mt-3 text-sm text-red-500 underline hover:text-red-600"
              >
                {t("removeAllOffline")}
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
