import { Suspense } from "react";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ShelvesView from "./ShelvesView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("shelvesTitle"),
    description: t("shelvesDescription"),
  };
}

export default function ShelvesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
        </div>
      }
    >
      <ShelvesView />
    </Suspense>
  );
}
