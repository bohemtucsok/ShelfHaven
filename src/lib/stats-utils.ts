/**
 * Shared statistics utility functions.
 * Used by both /api/user/profile and /api/user/stats routes.
 */

export function calculateReadingStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const uniqueDays = new Set<string>();
  for (const d of dates) {
    uniqueDays.add(d.toISOString().slice(0, 10));
  }

  const sortedDays = Array.from(uniqueDays).sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak must start from today or yesterday
  if (sortedDays[0] !== today && sortedDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffMs = prev.getTime() - curr.getTime();
    if (diffMs <= 86400000 + 1000) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Group reading activity dates by month for the last 12 months.
 * Returns array of { month: "2026-01", count: 3 } sorted chronologically.
 */
export function groupByMonth(
  items: { createdAt: Date }[],
  months = 12
): { month: string; label: string; count: number }[] {
  const now = new Date();
  const result: { month: string; label: string; count: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("hu-HU", { month: "short" });
    result.push({ month: key, label, count: 0 });
  }

  for (const item of items) {
    const key = `${item.createdAt.getFullYear()}-${String(item.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const entry = result.find((r) => r.month === key);
    if (entry) entry.count++;
  }

  return result;
}

/**
 * Group reading activity by day of the week (Mon-Sun).
 * Returns array of 7 entries with total minutes per day.
 */
export function groupByWeekday(
  activities: { lastReadAt: Date; totalReadingMinutes: number }[]
): { day: string; minutes: number }[] {
  const dayNames = ["Vas", "Hét", "Ke", "Sze", "Csüt", "Pén", "Szo"];
  const totals = new Array(7).fill(0);

  for (const a of activities) {
    const dayIndex = a.lastReadAt.getDay();
    totals[dayIndex] += a.totalReadingMinutes;
  }

  // Reorder to start from Monday
  const ordered = [1, 2, 3, 4, 5, 6, 0];
  return ordered.map((i) => ({ day: dayNames[i], minutes: totals[i] }));
}
