"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { useThemeStore, type Theme } from "@/store/theme-store";

interface Notification {
  id: string;
  type: string;
  message: string;
  bookId: string | null;
  read: boolean;
  createdAt: string;
}

export function Header() {
  const { data: session } = useSession();
  const t = useTranslations("header");
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useThemeStore();
  const [isOffline, setIsOffline] = useState(false);

  // Online/offline detection
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowNotifications(false);
  }, [pathname]);

  // Fetch notifications periodically
  useEffect(() => {
    if (!session?.user) return;
    const fetchNotifs = () => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((data) => {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        })
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    return () => clearInterval(interval);
  }, [session]);

  // Close notification dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PUT" }).catch(() => {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  // Lock body scroll when menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleSearch = useCallback(() => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/library?q=${encodeURIComponent(trimmed)}`);
      setSearchQuery("");
      setMobileMenuOpen(false);
    }
  }, [searchQuery, router]);

  const toggleLocale = useCallback(async () => {
    const newLocale = locale === "hu" ? "en" : "hu";
    document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`;
    // Also save to DB if logged in
    if (session?.user) {
      fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: newLocale }),
      }).catch(() => {});
    }
    router.refresh();
  }, [locale, session, router]);

  const cycleTheme = useCallback(() => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    if (session?.user) {
      fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
    }
  }, [theme, setTheme, session]);

  const themeIcon = theme === "dark" ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  ) : theme === "light" ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
    </svg>
  );

  const themeLabel = theme === "dark" ? t("themeDark") : theme === "light" ? t("themeLight") : t("themeSystem");

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDrop = (name: string) => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    setOpenDropdown(name);
  };
  const closeDrop = () => {
    dropdownTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 150);
  };

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  const navLinkClass =
    "text-sm font-medium text-amber-200/80 transition-colors hover:text-amber-100";
  const dropdownTriggerClass =
    "flex items-center gap-1 text-sm font-medium text-amber-200/80 transition-colors hover:text-amber-100 cursor-default";
  const dropdownItemClass =
    "block w-full px-4 py-2 text-left text-sm text-amber-900 dark:text-[var(--text-primary)] transition-colors hover:bg-amber-100 dark:hover:bg-[var(--bg-secondary)]";
  const mobileNavLinkClass =
    "rounded-lg px-4 py-2.5 text-sm font-medium text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100";
  const mobileSubLinkClass =
    "rounded-lg px-4 py-2 pl-8 text-sm text-amber-200/60 transition-colors hover:bg-amber-800/30 hover:text-amber-100";

  const chevronDown = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 shadow-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/mascot.svg" alt="ShelfHaven" width={32} height={48} className="drop-shadow-md" />
          <span className="text-2xl font-bold tracking-tight text-amber-100">
            ShelfHaven
          </span>
        </Link>

        {/* Offline indicator */}
        {isOffline && (
          <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white animate-pulse">
            {t("offline")}
          </span>
        )}

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-5 md:flex">
          {session && (
            <div
              className="relative"
              onMouseEnter={() => openDrop("library")}
              onMouseLeave={closeDrop}
            >
              <span className={dropdownTriggerClass}>
                {t("library")} {chevronDown}
              </span>
              <AnimatePresence>
                {openDropdown === "library" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-amber-800/20 bg-white shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
                  >
                    <Link href="/library" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                      {t("library")}
                    </Link>
                    <Link href="/shelves" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                      {t("shelves")}
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {session && (
            <div
              className="relative"
              onMouseEnter={() => openDrop("activity")}
              onMouseLeave={closeDrop}
            >
              <span className={dropdownTriggerClass}>
                {t("activity")} {chevronDown}
              </span>
              <AnimatePresence>
                {openDropdown === "activity" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-amber-800/20 bg-white shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
                  >
                    <Link href="/activity" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                      {t("activity")}
                    </Link>
                    <Link href="/discover" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                      {t("discover")}
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {session && (
            <Link href="/upload" className={navLinkClass}>
              {t("upload")}
            </Link>
          )}
        </nav>

        {/* Desktop Search - only when logged in */}
        {session && (
          <div className="hidden md:block">
            <input
              type="text"
              placeholder={t("search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="w-64 rounded-lg border border-amber-700/50 bg-amber-950/50 px-4 py-2 text-sm text-amber-100 placeholder-amber-400/50 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
            />
          </div>
        )}

        {/* Desktop Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {session ? (
            <>
              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications && unreadCount > 0) markAllRead();
                  }}
                  className="relative rounded-lg p-2 text-amber-200/80 transition-colors hover:text-amber-100"
                  aria-label={t("notifications")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification dropdown */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-amber-800/20 bg-white dark:bg-[var(--bg-card)] dark:border-[var(--border)] shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-amber-100 dark:border-[var(--border)] px-4 py-3">
                        <h3 className="text-sm font-bold text-amber-900 dark:text-[var(--text-primary)]">{t("notifications")}</h3>
                        {notifications.length > 0 && (
                          <button
                            onClick={markAllRead}
                            className="text-xs text-amber-600 hover:text-amber-700"
                          >
                            {t("markAllRead")}
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-amber-700/50 dark:text-[var(--text-muted)]">
                            {t("noNotifications")}
                          </p>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              onClick={() => {
                                if (n.bookId) router.push(`/book/${n.bookId}`);
                                setShowNotifications(false);
                              }}
                              className={`cursor-pointer border-b border-amber-50 dark:border-[var(--border)] px-4 py-3 text-sm transition-colors hover:bg-amber-50 dark:hover:bg-[var(--bg-secondary)] ${!n.read ? "bg-amber-50/60 dark:bg-amber-900/20" : ""}`}
                            >
                              <p className="text-amber-900 dark:text-[var(--text-primary)]">{n.message}</p>
                              <p className="mt-0.5 text-xs text-amber-600/50 dark:text-[var(--text-muted)]">
                                {new Date(n.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "hu-HU")}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Profile dropdown */}
              <div
                className="relative"
                onMouseEnter={() => openDrop("profile")}
                onMouseLeave={closeDrop}
              >
                <button className="flex items-center gap-2 rounded-lg border border-amber-700/50 px-3 py-1.5 text-sm font-medium text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100">
                  {session.user?.image && (
                    <Image
                      src={session.user.image}
                      alt="Avatar"
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  )}
                  {session.user?.name || t("profile")}
                  {chevronDown}
                </button>
                <AnimatePresence>
                  {openDropdown === "profile" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-amber-800/20 bg-white shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
                    >
                      <Link href="/profile" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                        {t("profile")}
                      </Link>
                      <Link href="/topics" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                        {t("topics")}
                      </Link>
                      <Link href="/stats" className={dropdownItemClass} onClick={() => setOpenDropdown(null)}>
                        {t("stats")}
                      </Link>
                      {session.user?.role === "ADMIN" && (
                        <Link href="/admin" className={`${dropdownItemClass} !text-amber-600 dark:!text-amber-400 font-medium`} onClick={() => setOpenDropdown(null)}>
                          {t("admin")}
                        </Link>
                      )}
                      <div className="border-t border-amber-100 dark:border-[var(--border)]" />
                      <button
                        onClick={() => { setOpenDropdown(null); signOut(); }}
                        className={`${dropdownItemClass} !text-red-600 dark:!text-red-400`}
                      >
                        {t("logout")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={cycleTheme}
                className="rounded-lg border border-amber-700/50 px-2 py-1.5 text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                title={themeLabel}
              >
                {themeIcon}
              </button>
              <button
                onClick={toggleLocale}
                className="rounded-lg border border-amber-700/50 px-2 py-1.5 text-xs font-bold text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                title={locale === "hu" ? "Switch to English" : "Váltás magyarra"}
              >
                {locale === "hu" ? "EN" : "HU"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cycleTheme}
                className="rounded-lg border border-amber-700/50 px-2 py-1.5 text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                title={themeLabel}
              >
                {themeIcon}
              </button>
              <button
                onClick={toggleLocale}
                className="rounded-lg border border-amber-700/50 px-2 py-1.5 text-xs font-bold text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                title={locale === "hu" ? "Switch to English" : "Váltás magyarra"}
              >
                {locale === "hu" ? "EN" : "HU"}
              </button>
              <Link
                href="/login"
                className="text-sm font-medium text-amber-200/80 transition-colors hover:text-amber-100"
              >
                {t("signIn")}
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-600"
              >
                {t("register")}
              </Link>
            </>
          )}
        </div>

        {/* Hamburger button - mobile only */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg md:hidden"
          aria-label={t("menu")}
          aria-expanded={mobileMenuOpen}
        >
          <motion.span
            animate={mobileMenuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
            className="block h-0.5 w-6 bg-amber-200"
          />
          <motion.span
            animate={mobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="block h-0.5 w-6 bg-amber-200"
          />
          <motion.span
            animate={mobileMenuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
            className="block h-0.5 w-6 bg-amber-200"
          />
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-16 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Menu panel */}
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="absolute left-0 top-16 z-50 w-full border-b border-amber-900/20 bg-amber-950 shadow-lg md:hidden"
            >
              <nav className="flex flex-col gap-1 px-4 py-4">
                {/* Mobile search - only when logged in */}
                {session && (
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder={t("search")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearch();
                      }}
                      className="w-full rounded-lg border border-amber-700/50 bg-amber-950/50 px-4 py-2.5 text-sm text-amber-100 placeholder-amber-400/50 outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Nav links - grouped */}
                {session && (
                  <>
                    {/* Könyvtár group */}
                    <Link href="/library" className={mobileNavLinkClass}>
                      {t("library")}
                    </Link>
                    <Link href="/shelves" className={mobileSubLinkClass}>
                      {t("shelves")}
                    </Link>

                    {/* Hírfolyam group */}
                    <Link href="/activity" className={mobileNavLinkClass}>
                      {t("activity")}
                    </Link>
                    <Link href="/discover" className={mobileSubLinkClass}>
                      {t("discover")}
                    </Link>

                    {/* Feltöltés */}
                    <Link href="/upload" className={mobileNavLinkClass}>
                      {t("upload")}
                    </Link>
                  </>
                )}

                {/* Divider */}
                <div className="my-2 border-t border-amber-700/30" />

                {/* Settings row */}
                <div className="flex items-center gap-2 px-4 py-1">
                  <button
                    onClick={cycleTheme}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                  >
                    {themeIcon}
                    <span>{themeLabel}</span>
                  </button>
                  <button
                    onClick={toggleLocale}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-amber-200/80 transition-colors hover:bg-amber-800/30 hover:text-amber-100"
                  >
                    {locale === "hu" ? "EN" : "HU"}
                  </button>
                </div>

                {/* Divider */}
                <div className="my-2 border-t border-amber-700/30" />

                {/* Auth / Profile section */}
                {session ? (
                  <>
                    <Link href="/profile" className={mobileNavLinkClass}>
                      {session.user?.name || t("profile")}
                    </Link>
                    <Link href="/topics" className={mobileSubLinkClass}>
                      {t("topics")}
                    </Link>
                    <Link href="/stats" className={mobileSubLinkClass}>
                      {t("stats")}
                    </Link>
                    {session.user?.role === "ADMIN" && (
                      <Link href="/admin" className="rounded-lg px-4 py-2 pl-8 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-800/30 hover:text-amber-300">
                        {t("admin")}
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="rounded-lg px-4 py-2.5 text-left text-sm font-medium text-red-400/80 transition-colors hover:bg-amber-800/30 hover:text-red-300"
                    >
                      {t("logout")}
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={mobileNavLinkClass}>
                      {t("signIn")}
                    </Link>
                    <Link
                      href="/register"
                      className="mx-4 mt-2 rounded-lg bg-amber-700 px-4 py-2.5 text-center text-sm font-medium text-amber-50 transition-colors hover:bg-amber-600"
                    >
                      {t("register")}
                    </Link>
                  </>
                )}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
