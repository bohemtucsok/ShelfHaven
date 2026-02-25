"use client";

import { useTranslations } from "next-intl";

export default function OfflinePage() {
  const t = useTranslations("offline");

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50">
      <div className="text-center px-6">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-200/60">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-amber-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m2.828 2.828a5 5 0 010 7.072M15.536 8.464a5 5 0 010 7.072M12 12h.01"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-amber-900">
          {t("title")}
        </h1>
        <p className="mt-3 text-amber-700/70">
          {t("description")}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-amber-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
