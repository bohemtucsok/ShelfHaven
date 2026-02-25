export default function MainLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
        <p className="text-sm text-[var(--text-muted)]">Betöltés...</p>
      </div>
    </div>
  );
}
