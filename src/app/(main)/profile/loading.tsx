export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center gap-6">
        {/* Avatar skeleton */}
        <div className="h-20 w-20 animate-pulse rounded-full bg-amber-200/40 dark:bg-amber-900/30" />
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          <div className="h-4 w-32 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
        </div>
      </div>

      {/* Stats cards skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-amber-800/20 p-5 dark:border-[var(--border)]">
            <div className="h-4 w-20 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="mt-2 h-8 w-12 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
        ))}
      </div>

      {/* Recent activity skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-12 w-8 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
