import { getTranslations } from "next-intl/server";
import ActivityFeed from "@/components/social/ActivityFeed";

export async function generateMetadata() {
  const t = await getTranslations("activity");
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ActivityFeed />
    </div>
  );
}
