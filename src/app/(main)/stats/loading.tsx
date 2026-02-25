export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 h-8 w-48 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />

      {/* Summary cards skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-amber-800/20 p-5 dark:border-[var(--border)]">
            <div className="h-4 w-20 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
        ))}
      </div>

      {/* Chart skeletons */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-amber-200/40 dark:bg-amber-900/30" />
        <div className="h-64 animate-pulse rounded-xl bg-amber-200/40 dark:bg-amber-900/30" />
      </div>
    </div>
  );
}
