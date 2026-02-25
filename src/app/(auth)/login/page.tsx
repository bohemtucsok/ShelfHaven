"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oidcConfig, setOidcConfig] = useState<{
    oidcEnabled: boolean;
    oidcOnly: boolean;
    registrationEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/oidc-config")
      .then((r) => r.json())
      .then(setOidcConfig)
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      toast.error(t("invalidCredentials"));
    } else {
      // Full page navigation to ensure session cookie is sent with the request
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("callbackUrl") || "/library";
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--text-primary)]">
          {t("login")}
        </h1>

        <div className="space-y-4">
          {/* OIDC login button */}
          {oidcConfig?.oidcEnabled && (
            <button
              onClick={() => signIn("authentik")}
              className="w-full rounded-lg border-2 border-amber-700 bg-amber-50 dark:bg-[var(--bg-input)] dark:border-[var(--accent-gold)] px-4 py-2.5 font-semibold text-amber-800 dark:text-[var(--accent-gold)] transition-colors hover:bg-amber-100 dark:hover:bg-[var(--bg-secondary)]"
            >
              {t("loginWithAuthentik")}
            </button>
          )}

          {/* Divider between OIDC and credentials */}
          {oidcConfig?.oidcEnabled && !oidcConfig?.oidcOnly && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-amber-800/20 dark:bg-[var(--border)]" />
              <span className="text-sm text-[var(--text-muted)]">{tc("or")}</span>
              <div className="h-px flex-1 bg-amber-800/20 dark:bg-[var(--border)]" />
            </div>
          )}

          {/* Credential login form - hidden when oidcOnly */}
          {!oidcConfig?.oidcOnly && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  placeholder={t("emailPlaceholder")}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  {t("password")}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  placeholder={t("passwordPlaceholder")}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-amber-700 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {loading ? `${t("login")}...` : t("login")}
              </button>
            </form>
          )}
        </div>

        {/* Registration link - hidden when registrationEnabled is false */}
        {oidcConfig?.registrationEnabled !== false && (
          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            {t("noAccount")}{" "}
            <Link href="/register" className="font-semibold text-amber-700 hover:text-amber-600">
              {t("register")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
