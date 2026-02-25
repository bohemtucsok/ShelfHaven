import Link from "next/link";
import { auth } from "@/lib/auth";

export async function Footer() {
  const session = await auth();

  return (
    <footer className="border-t border-amber-900/20 dark:border-[var(--border)] bg-amber-950 dark:bg-[var(--bg-primary)] py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div>
            <p className="text-lg font-bold text-amber-100">ShelfHaven</p>
            <p className="text-sm text-amber-400/60">
              A te személyes digitális könyvtárad
            </p>
          </div>
          {session && (
            <div className="flex gap-6">
              <Link
                href="/library"
                className="text-sm text-amber-400/60 transition-colors hover:text-amber-200"
              >
                Könyvtár
              </Link>
              <Link
                href="/topics"
                className="text-sm text-amber-400/60 transition-colors hover:text-amber-200"
              >
                Témák
              </Link>
              <Link
                href="/shelves"
                className="text-sm text-amber-400/60 transition-colors hover:text-amber-200"
              >
                Polcaim
              </Link>
              <Link
                href="/upload"
                className="text-sm text-amber-400/60 transition-colors hover:text-amber-200"
              >
                Feltöltés
              </Link>
            </div>
          )}
          <p className="text-xs text-amber-400/40">
            &copy; {new Date().getFullYear()} ShelfHaven
          </p>
        </div>
      </div>
    </footer>
  );
}
