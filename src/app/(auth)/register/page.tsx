"use client";

import { useState, useMemo, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  // Password requirements matching the backend Zod schema
  const passwordRequirements = useMemo(
    () => [
      { label: t("reqMinLength"), test: (pw: string) => pw.length >= 8 },
      { label: t("reqUppercase"), test: (pw: string) => /[A-Z]/.test(pw) },
      { label: t("reqLowercase"), test: (pw: string) => /[a-z]/.test(pw) },
      { label: t("reqNumber"), test: (pw: string) => /[0-9]/.test(pw) },
    ],
    [t]
  );

  useEffect(() => {
    fetch("/api/auth/oidc-config")
      .then((r) => r.json())
      .then((d) => setRegistrationEnabled(d.registrationEnabled !== false))
      .catch(() => {});
  }, []);

  const passwordChecks = useMemo(
    () => passwordRequirements.map((req) => ({ ...req, passed: req.test(password) })),
    [password, passwordRequirements]
  );
  const allPasswordReqsMet = passwordChecks.every((c) => c.passed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!allPasswordReqsMet) {
      toast.error(t("passwordNotMeetReqs"));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("passwordsNotMatch"));
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || t("registrationError"));
      setLoading(false);
      return;
    }

    // Auto-login after registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      toast.error(t("registrationSuccessLoginFail"));
    } else {
      router.push("/library");
      router.refresh();
    }
  }

  if (!registrationEnabled) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-8 shadow-lg text-center">
          <h1 className="mb-4 text-2xl font-bold text-[var(--text-primary)]">
            {t("registrationDisabled")}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t("registrationDisabledDesc")}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block font-semibold text-amber-700 hover:text-amber-600"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--text-primary)]">
          {t("register")}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              {t("name")}
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
              placeholder={t("namePlaceholder")}
            />
          </div>

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
              placeholder={t("passwordRequirements")}
            />
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {passwordChecks.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        passwordChecks.slice(0, i + 1).every((c) => c.passed)
                          ? i < 2 ? "bg-amber-500" : "bg-green-500"
                          : "bg-gray-300 dark:bg-gray-700"
                      }`}
                    />
                  ))}
                </div>
                <ul className="space-y-0.5">
                  {passwordChecks.map((check, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${
                        check.passed ? "text-green-600" : "text-[var(--text-muted)]"
                      }`}
                    >
                      <span className="inline-block w-3.5 text-center">
                        {check.passed ? "\u2713" : "\u2022"}
                      </span>
                      {check.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              {t("confirmPassword")}
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
              placeholder={t("confirmPasswordPlaceholder")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-700 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? `${t("register")}...` : t("register")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-amber-700 hover:text-amber-600">
            {t("login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
