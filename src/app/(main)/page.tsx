import Link from "next/link";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import RecommendationSection from "@/components/bookshelf/RecommendationSection";

const DEMO_CATEGORIES = [
  { key: "catFiction" as const, slug: "szepirodalom", color: "#8B4513" },
  { key: "catSciFi" as const, slug: "sci-fi", color: "#2E4057" },
  { key: "catHistory" as const, slug: "tortenelem", color: "#6B3A2A" },
  { key: "catScience" as const, slug: "tudomany", color: "#2D6A4F" },
  { key: "catSelfHelp" as const, slug: "onfejlesztes", color: "#7B2D8E" },
  { key: "catITTech" as const, slug: "it-tech", color: "#1A5276" },
];

const SPINE_COLORS = [
  "#8B0000", "#00008B", "#006400", "#8B4513", "#4A0E4E",
  "#2F4F4F", "#800020", "#191970", "#556B2F", "#8B6914",
];

function BookSpine({ index }: { index: number }) {
  const color = SPINE_COLORS[index % SPINE_COLORS.length];
  const height = 160 + (index * 37 % 60); // deterministic 160-220 range
  const width = 30 + (index * 13 % 20);   // deterministic 30-50 range

  return (
    <div
      className="book-spine relative rounded-sm"
      style={{
        backgroundColor: color,
        height: `${height}px`,
        width: `${width}px`,
        perspective: "500px",
      }}
    >
      <div
        className="absolute inset-0 rounded-sm opacity-20"
        style={{
          background: `linear-gradient(90deg, rgba(255,255,255,0.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.2) 100%)`,
        }}
      />
    </div>
  );
}

function ShelfRow({ count }: { count: number }) {
  return (
    <div className="relative">
      {/* Books */}
      <div className="flex items-end gap-1 px-4 pb-1">
        {Array.from({ length: count }).map((_, i) => (
          <BookSpine key={i} index={i} />
        ))}
      </div>
      {/* Shelf */}
      <div className="shelf-texture h-4 rounded-sm" />
      {/* Shelf bracket shadow */}
      <div className="h-2 bg-gradient-to-b from-black/20 to-transparent" />
    </div>
  );
}

export default async function Home() {
  const session = await auth();
  const t = await getTranslations("home");
  const ta = await getTranslations("auth");

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/90 via-amber-900/70 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 text-center">
          <h1 className="mb-4 text-5xl font-bold tracking-tight text-amber-50 md:text-6xl">
            ShelfHaven
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/mascot.svg"
            alt="ShelfHaven manó mascot"
            width={140}
            height={210}
            className="mx-auto mb-4 drop-shadow-lg"
          />
          <p className="mx-auto mb-8 max-w-2xl text-lg text-amber-200/80">
            {t("heroDescription")}
          </p>
          <div className="flex justify-center gap-4">
            {session ? (
              <Link
                href="/library"
                className="rounded-lg bg-amber-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-amber-500 hover:shadow-xl"
              >
                {t("myLibrary")}
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-amber-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-amber-500 hover:shadow-xl"
              >
                {ta("login")}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="mb-6 text-center text-2xl font-bold text-[var(--text-primary)]">
          {t("categories")}
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {DEMO_CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/library?category=${cat.slug}`}
              className="rounded-lg border-2 border-amber-800/20 bg-amber-50 px-5 py-2.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-700/40 hover:shadow-md dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
              style={{ color: cat.color }}
            >
              {t(cat.key)}
            </Link>
          ))}
        </div>
      </section>

      {/* Bookshelf Demo */}
      <section className="mx-auto max-w-4xl px-4 py-12">
        <h2 className="mb-8 text-center text-2xl font-bold text-[var(--text-primary)]">
          {t("yourBookshelf")}
        </h2>
        <div
          className="rounded-xl p-6"
          style={{
            background:
              "linear-gradient(180deg, #D4A574 0%, #C69C6D 50%, #B8916A 100%)",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.1), 0 4px 20px rgba(0,0,0,0.15)",
          }}
        >
          <div className="space-y-6">
            <ShelfRow count={10} />
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          {t("signInPrompt")}
        </p>
      </section>

      {/* Recommendations (logged-in users) */}
      {session && (
        <section className="mx-auto max-w-5xl px-4 py-8">
          <RecommendationSection title={t("recommendedForYou")} />
        </section>
      )}

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-xl border border-amber-800/10 bg-amber-50/50 p-6 text-center dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
            <div className="mb-3 text-3xl">&#128218;</div>
            <h3 className="mb-2 text-lg font-bold text-[var(--text-primary)]">
              {t("uploadFeature")}
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {t("uploadFeatureDesc")}
            </p>
          </div>
          <div className="rounded-xl border border-amber-800/10 bg-amber-50/50 p-6 text-center dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
            <div className="mb-3 text-3xl">&#128214;</div>
            <h3 className="mb-2 text-lg font-bold text-[var(--text-primary)]">
              {t("readFeature")}
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {t("readFeatureDesc")}
            </p>
          </div>
          <div className="rounded-xl border border-amber-800/10 bg-amber-50/50 p-6 text-center dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
            <div className="mb-3 text-3xl">&#128451;</div>
            <h3 className="mb-2 text-lg font-bold text-[var(--text-primary)]">
              {t("organizeFeature")}
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {t("organizeFeatureDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
