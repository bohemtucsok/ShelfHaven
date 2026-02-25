import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import UploadForm from "./UploadForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("uploadTitle"),
    description: t("uploadDescription"),
  };
}

export default function UploadPage() {
  return <UploadForm />;
}
