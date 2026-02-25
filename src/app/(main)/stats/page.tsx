import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import StatsLoader from "./StatsLoader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("statsTitle"),
    description: t("statsDescription"),
  };
}

export default function StatsPage() {
  return <StatsLoader />;
}
