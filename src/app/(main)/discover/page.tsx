import { getTranslations } from "next-intl/server";
import DiscoverView from "@/components/discover/DiscoverView";

export async function generateMetadata() {
  const t = await getTranslations("discover");
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <DiscoverView />
    </div>
  );
}
