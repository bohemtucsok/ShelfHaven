export default function LibraryLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Search + view toggle skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
        <div className="flex gap-2">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
          <div className="h-10 w-10 animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
        </div>
      </div>

      {/* Category tabs skeleton */}
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-amber-200/40 dark:bg-amber-900/30" />
        ))}
      </div>

      {/* Book grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
