"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { useThemeStore } from "@/store/theme-store";

/** Sync locale cookie with user's DB language preference on login */
function LocaleSync() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session?.user?.language) return;
    const lang = session.user.language;
    const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
    const currentCookie = match?.[1];
    if (currentCookie !== lang) {
      document.cookie = `locale=${lang};path=/;max-age=${365 * 24 * 60 * 60}`;
      router.refresh();
    }
  }, [session?.user?.language, router]);

  return null;
}

/** Sync theme from session + system preference → apply to <html> */
function ThemeSync() {
  const { data: session } = useSession();
  const { theme, setTheme, setResolvedTheme } = useThemeStore();

  // Sync DB theme preference on login
  useEffect(() => {
    if (session?.user?.theme) {
      const dbTheme = session.user.theme as "light" | "dark" | "system";
      if (dbTheme !== theme) {
        setTheme(dbTheme);
      }
    }
  }, [session?.user?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply theme to <html> element and listen for system preference
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(resolved: "light" | "dark") {
      if (resolved === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      setResolvedTheme(resolved);
    }

    if (theme === "light" || theme === "dark") {
      applyTheme(theme);
      return;
    }

    // System mode: detect and listen
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(mq.matches ? "dark" : "light");

    function onChange(e: MediaQueryListEvent) {
      applyTheme(e.matches ? "dark" : "light");
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, setResolvedTheme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  return (
    <SessionProvider>
      <LocaleSync />
      <ThemeSync />
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: resolvedTheme === "dark" ? "#2a2018" : "#FFFBF0",
            border: `1px solid ${resolvedTheme === "dark" ? "rgba(212, 165, 116, 0.2)" : "rgba(139, 69, 19, 0.2)"}`,
            color: resolvedTheme === "dark" ? "#e8ddd0" : "#2C1810",
          },
        }}
      />
    </SessionProvider>
  );
}
