import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProfileView from "./ProfileView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("profileTitle"),
    description: t("profileDescription"),
  };
}

export default function ProfilePage() {
  return <ProfileView />;
}
