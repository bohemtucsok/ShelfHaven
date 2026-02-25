import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import TopicsView from "./TopicsView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("topicsTitle"),
    description: t("topicsDescription"),
  };
}

export default function TopicsPage() {
  return <TopicsView />;
}
