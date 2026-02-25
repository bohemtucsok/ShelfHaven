import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ReaderView from "./ReaderView";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("readerTitle"),
  };
}

export default async function ReaderPage({ params }: PageProps) {
  const { id } = await params;
  return <ReaderView bookId={id} />;
}
