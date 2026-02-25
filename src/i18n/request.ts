import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const locales = ["hu", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "hu";

export default getRequestConfig(async () => {
  // Priority: 1) cookie  2) Accept-Language header  3) default "hu"
  const cookieStore = await cookies();
  let locale: Locale = defaultLocale;

  const cookieLocale = cookieStore.get("locale")?.value;
  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    locale = cookieLocale as Locale;
  } else {
    const headerStore = await headers();
    const acceptLang = headerStore.get("accept-language") || "";
    if (acceptLang.startsWith("en")) {
      locale = "en";
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
