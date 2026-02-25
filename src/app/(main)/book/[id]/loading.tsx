export default function BookDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-8 sm:flex-row">
        {/* Cover skeleton */}
        <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30 sm:w-64 sm:shrink-0" />

        {/* Info skeleton */}
        <div className="flex-1 space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          <div className="flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-full bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
          <div className="space-y-2 pt-4">
            <div className="h-4 w-full animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-4 w-full animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
          <div className="flex gap-3 pt-4">
            <div className="h-10 w-32 animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-10 w-24 animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
