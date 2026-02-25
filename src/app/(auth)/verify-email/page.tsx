"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("missingToken"));
      return;
    }

    fetch(`/api/auth/verify-email?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message || t("emailVerifiedDefault"));
        } else {
          setStatus("error");
          setMessage(data.error || t("verificationErrorDefault"));
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage(tc("networkError"));
      });
  }, [token, t, tc]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-amber-800/20 bg-amber-50/80 p-8 shadow-lg text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
            <p className="text-[var(--text-secondary)]">{t("verifyingEmail")}</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 text-3xl">
              &#10003;
            </div>
            <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">{t("verificationSuccess")}</h1>
            <p className="mb-6 text-[var(--text-secondary)]">{message}</p>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-amber-700 px-6 py-2.5 font-semibold text-white hover:bg-amber-600"
            >
              {t("login")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 text-3xl">
              &#10007;
            </div>
            <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">{t("verificationFailed")}</h1>
            <p className="mb-6 text-[var(--text-secondary)]">{message}</p>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-amber-700 px-6 py-2.5 font-semibold text-white hover:bg-amber-600"
            >
              {t("backToLogin")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
