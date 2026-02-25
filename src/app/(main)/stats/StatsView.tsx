"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useThemeStore } from "@/store/theme-store";

interface StatsData {
  summary: {
    totalBooks: number;
    finishedBooks: number;
    averageProgress: number;
    totalMinutes: number;
    readingStreak: number;
    avgMinutesPerDay: number;
  };
  monthlyBooks: { month: string; label: string; count: number }[];
  weeklyActivity: { day: string; minutes: number }[];
  categoryDistribution: { name: string; value: number }[];
  recentlyFinished: {
    bookId: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    finishedAt: string;
  }[];
}

interface GoalData {
  goal: { year: number; targetBooks: number; targetMinutes: number } | null;
  progress: { booksFinished: number; minutesRead: number };
}

const PIE_COLORS = [
  "#d97706", "#b45309", "#92400e", "#78350f",
  "#059669", "#0891b2", "#7c3aed", "#dc2626",
];

export default function StatsView() {
  const t = useTranslations("stats");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const [data, setData] = useState<StatsData | null>(null);
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalTarget, setGoalTarget] = useState(12);
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [savingGoal, setSavingGoal] = useState(false);
  const { resolvedTheme } = useThemeStore();

  useEffect(() => {
    Promise.all([
      fetch("/api/user/stats").then((r) => r.json()),
      fetch("/api/user/goals").then((r) => r.json()),
    ])
      .then(([statsData, goalsData]) => {
        setData(statsData);
        setGoalData(goalsData);
        if (goalsData.goal) {
          setGoalTarget(goalsData.goal.targetBooks);
          setGoalMinutes(goalsData.goal.targetMinutes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveGoal() {
    setSavingGoal(true);
    try {
      const res = await fetch("/api/user/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: new Date().getFullYear(),
          targetBooks: goalTarget,
          targetMinutes: goalMinutes,
        }),
      });
      if (res.ok) {
        const { goal } = await res.json();
        setGoalData((prev) => prev ? { ...prev, goal } : prev);
        setShowGoalModal(false);
        toast.success(t("goalSaved"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setSavingGoal(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="text-amber-700/70 dark:text-[var(--text-muted)]">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-amber-700/70 dark:text-[var(--text-muted)]">{t("loadFailed")}</p>
        <Link href="/library" className="mt-4 text-amber-600 underline hover:text-amber-700">
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  const { summary } = data;
  const isDark = resolvedTheme === "dark";
  const axisColor = isDark ? "#a1947f" : "#92400e";
  const gridColor = isDark ? "#3d2b1a" : "#fef3c7";

  function formatMinutes(mins: number): string {
    if (mins < 60) return `${mins} ${tp("minutes")}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} ${tp("hours")} ${m} ${tp("minutes")}` : `${h} ${tp("hours")}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="mb-2 text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
        <p className="mb-8 text-sm text-[var(--text-muted)]">{t("subtitle")}</p>
      </motion.div>

      {/* Reading Goal */}
      {goalData && (
        <motion.div
          className="mb-8 rounded-xl border border-amber-800/20 bg-amber-50/80 p-5 shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {t("readingGoal")} — {new Date().getFullYear()}
            </h2>
            <button
              onClick={() => setShowGoalModal(true)}
              className="rounded-lg border border-amber-700/30 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-[var(--border)] dark:text-[var(--accent-gold)] dark:hover:bg-[var(--bg-secondary)]"
            >
              {goalData.goal ? t("editGoal") : t("setGoal")}
            </button>
          </div>
          {goalData.goal ? (
            <div className="space-y-3">
              {/* Books goal */}
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {t("booksGoal")}: {goalData.progress.booksFinished} / {goalData.goal.targetBooks}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {Math.min(100, Math.round((goalData.progress.booksFinished / goalData.goal.targetBooks) * 100))}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-amber-200/50 dark:bg-amber-900/30">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (goalData.progress.booksFinished / goalData.goal.targetBooks) * 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>
              {/* Minutes goal (if set) */}
              {goalData.goal.targetMinutes > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">
                      {t("minutesGoal")}: {formatMinutes(goalData.progress.minutesRead)} / {formatMinutes(goalData.goal.targetMinutes)}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {Math.min(100, Math.round((goalData.progress.minutesRead / goalData.goal.targetMinutes) * 100))}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-green-200/50 dark:bg-green-900/30">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (goalData.progress.minutesRead / goalData.goal.targetMinutes) * 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t("noGoalSet")}</p>
          )}
        </motion.div>
      )}

      {/* Goal Modal */}
      <AnimatePresence>
        {showGoalModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGoalModal(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-xl border border-amber-800/20 bg-white p-6 shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">{t("setGoalTitle")}</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                    {t("targetBooks")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(Number(e.target.value))}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-500 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                    {t("targetMinutes")} ({t("optional")})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={goalMinutes}
                    onChange={(e) => setGoalMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-500 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{t("targetMinutesHint")}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowGoalModal(false)}
                  className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-amber-50 dark:border-[var(--border)] dark:hover:bg-[var(--bg-secondary)]"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={saveGoal}
                  disabled={savingGoal || goalTarget < 1}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {savingGoal ? tc("saving") : tc("save")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: tp("uploadedBooks"), value: summary.totalBooks, icon: "📚" },
          { label: tp("finishedBooks"), value: summary.finishedBooks, icon: "✅" },
          { label: tp("averageProgress"), value: `${summary.averageProgress}%`, icon: "📊" },
          { label: tp("readingTime"), value: formatMinutes(summary.totalMinutes), icon: "⏱️" },
          { label: tp("readingStreak"), value: `${summary.readingStreak} ${tp("days")}`, icon: "🔥" },
          { label: t("avgPerDay"), value: formatMinutes(summary.avgMinutesPerDay), icon: "📖" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-4 text-center shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="mb-1 text-2xl">{card.icon}</div>
            <p className="text-lg font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Monthly books chart */}
        <motion.div
          className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-5 shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">{t("monthlyBooks")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyBooks}>
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? "#241c14" : "#fffbeb",
                  border: "1px solid " + (isDark ? "#3d2b1a" : "#d4a574"),
                  borderRadius: 8,
                  color: isDark ? "#e8ddd0" : "#1a1410",
                }}
              />
              <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} name={t("booksUploaded")} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Weekly activity chart */}
        <motion.div
          className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-5 shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">{t("weeklyActivity")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.weeklyActivity}>
              <XAxis dataKey="day" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? "#241c14" : "#fffbeb",
                  border: "1px solid " + (isDark ? "#3d2b1a" : "#d4a574"),
                  borderRadius: 8,
                  color: isDark ? "#e8ddd0" : "#1a1410",
                }}
                formatter={(value: number | undefined) => [formatMinutes(value ?? 0), t("readingTime")]}
              />
              <Bar dataKey="minutes" fill="#059669" radius={[4, 4, 0, 0]} name={t("readingTime")} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Second row: Category pie + Recently finished */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category distribution */}
        <motion.div
          className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-5 shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">{t("categoryBreakdown")}</h2>
          {data.categoryDistribution.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-muted)]">{tp("noData")}</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={data.categoryDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                  >
                    {data.categoryDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#241c14" : "#fffbeb",
                      border: "1px solid " + (isDark ? "#3d2b1a" : "#d4a574"),
                      borderRadius: 8,
                      color: isDark ? "#e8ddd0" : "#1a1410",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {data.categoryDistribution.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="flex-1 text-[var(--text-secondary)]">{cat.name}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{cat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Recently finished */}
        <motion.div
          className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-5 shadow-sm dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">{t("recentlyFinished")}</h2>
          {data.recentlyFinished.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-muted)]">{t("noFinishedYet")}</p>
          ) : (
            <div className="space-y-3">
              {data.recentlyFinished.map((book) => (
                <Link
                  key={book.bookId}
                  href={`/book/${book.bookId}`}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-amber-100/50 dark:hover:bg-[var(--bg-secondary)]"
                >
                  <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-gradient-to-br from-amber-800 to-amber-950">
                    {book.coverUrl ? (
                      <Image src={book.coverUrl} alt={book.title} fill className="object-cover" sizes="32px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs">📖</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-primary)]">{book.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {book.author || tp("unknownAuthor")} &middot;{" "}
                      {new Date(book.finishedAt).toLocaleDateString("hu-HU")}
                    </p>
                  </div>
                  <span className="text-green-600 dark:text-green-400">✓</span>
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
