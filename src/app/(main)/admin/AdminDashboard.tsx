"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslations } from "next-intl";
import BackupPanel from "@/components/admin/BackupPanel";

type Tab = "stats" | "users" | "books" | "settings" | "topics" | "rateLimits" | "backup";
type SettingsSection = "smtp" | "oidc" | "registration" | "metadata";

interface Stats {
  totalUsers: number;
  totalBooks: number;
  totalReviews: number;
  newUsersThisMonth: number;
  newBooksThisMonth: number;
  storageUsedMB: number;
  activeReadersThisMonth: number;
  totalPlatformReadingMinutes: number;
  popularBooks: { title: string; author: string; readers: number }[];
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  _count: { books: number };
}

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  originalFormat: string;
  fileSize: number;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

interface TopicRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
  _count: { books: number };
  createdAt: string;
}

interface RateLimitEntry {
  prefix: string;
  ip: string;
  count: number;
  maxRequests: number;
  remaining: number;
  resetsIn: number;
}

interface RateLimitData {
  entries: RateLimitEntry[];
  summary: { prefix: string; activeLimits: number; blockedIps: number; uniqueIps: number }[];
  totalActive: number;
  totalBlocked: number;
}

export default function AdminDashboard() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "user" | "book" | "topic"; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("smtp");

  // User creation modal
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "USER" as "USER" | "ADMIN" });

  // Topics state
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [topicSearch, setTopicSearch] = useState("");
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [showEditTopicModal, setShowEditTopicModal] = useState(false);
  const [editTopic, setEditTopic] = useState<TopicRow | null>(null);
  const [newTopic, setNewTopic] = useState({ name: "", color: "#C9A96E", description: "" });
  const [savingTopic, setSavingTopic] = useState(false);

  // Rate limits state
  const [rateLimitData, setRateLimitData] = useState<RateLimitData | null>(null);

  // Search & pagination
  const [bookSearch, setBookSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [bookPage, setBookPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [bookTotal, setBookTotal] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchUsers = useCallback((page: number, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d) => { setUsers(d.users); setUserTotal(d.total); })
      .catch(() => toast.error(t("loadUsersFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  const fetchBooks = useCallback((page: number, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    fetch(`/api/admin/books?${params}`)
      .then((r) => r.json())
      .then((d) => { setBooks(d.books); setBookTotal(d.total); })
      .catch(() => toast.error(t("loadBooksFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  const fetchTopics = useCallback(() => {
    setLoading(true);
    fetch("/api/topics")
      .then((r) => r.json())
      .then((data) => setTopics(data))
      .catch(() => toast.error(t("loadTopicsFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (tab === "stats") {
      setLoading(true);
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => toast.error(t("loadStatsFailed")))
        .finally(() => setLoading(false));
    } else if (tab === "users") {
      fetchUsers(userPage, userSearch);
    } else if (tab === "books") {
      fetchBooks(bookPage, bookSearch);
    } else if (tab === "topics") {
      fetchTopics();
    } else if (tab === "rateLimits") {
      setLoading(true);
      fetch("/api/admin/rate-limits")
        .then((r) => r.json())
        .then(setRateLimitData)
        .catch(() => toast.error(t("loadRateLimitsFailed")))
        .finally(() => setLoading(false));
    } else if (tab === "backup") {
      setLoading(false);
    }
  }, [tab, userPage, bookPage, fetchUsers, fetchBooks, fetchTopics, userSearch, bookSearch, t]);

  // Auto-refresh rate limits every 10 seconds
  useEffect(() => {
    if (tab !== "rateLimits") return;
    const interval = setInterval(() => {
      fetch("/api/admin/rate-limits")
        .then((r) => r.json())
        .then(setRateLimitData)
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [tab]);

  function handleUserSearch(q: string) {
    setUserSearch(q);
    setUserPage(1);
  }

  function handleBookSearch(q: string) {
    setBookSearch(q);
    setBookPage(1);
  }

  async function toggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole as "USER" | "ADMIN" } : u))
        );
        toast.success(t("roleChanged", { role: newRole }));
      } else {
        toast.error(t("roleChangeFailed"));
      }
    } catch {
      toast.error(tc("networkError"));
    }
  }

  function requestDeleteUser(userId: string, label: string) {
    setDeleteTarget({ id: userId, type: "user", label });
    setShowDeleteModal(true);
  }

  function requestDeleteBook(bookId: string, label: string) {
    setDeleteTarget({ id: bookId, type: "book", label });
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "user") {
        const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
        if (res.ok) {
          setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
          toast.success(t("userDeleted"));
        } else {
          const data = await res.json();
          toast.error(data.error || tc("error"));
        }
      } else if (deleteTarget.type === "book") {
        const res = await fetch(`/api/admin/books/${deleteTarget.id}`, { method: "DELETE" });
        if (res.ok) {
          setBooks((prev) => prev.filter((b) => b.id !== deleteTarget.id));
          toast.success(t("bookDeleted"));
        } else {
          toast.error(tc("error"));
        }
      } else if (deleteTarget.type === "topic") {
        const res = await fetch(`/api/topics/${deleteTarget.id}`, { method: "DELETE" });
        if (res.ok) {
          setTopics((prev) => prev.filter((tp) => tp.id !== deleteTarget.id));
          toast.success(t("topicDeleted"));
        } else {
          toast.error(tc("error"));
        }
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  }

  async function createUser() {
    if (!newUser.name || !newUser.email || newUser.password.length < 8) {
      toast.error(t("allFieldsRequired"));
      return;
    }
    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (res.ok) {
        toast.success(t("userCreated"));
        setShowCreateUserModal(false);
        setNewUser({ name: "", email: "", password: "", role: "USER" });
        fetchUsers(userPage, userSearch);
      } else {
        const data = await res.json();
        toast.error(data.error || t("userCreateFailed"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setCreatingUser(false);
    }
  }

  // Topic CRUD
  async function createTopic() {
    if (!newTopic.name.trim()) {
      toast.error(t("topicNameRequired"));
      return;
    }
    setSavingTopic(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTopic),
      });
      if (res.ok) {
        toast.success(t("topicCreated"));
        setShowCreateTopicModal(false);
        setNewTopic({ name: "", color: "#C9A96E", description: "" });
        fetchTopics();
      } else {
        const data = await res.json();
        toast.error(data.error || t("topicCreateFailed"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSavingTopic(false);
    }
  }

  async function updateTopic() {
    if (!editTopic) return;
    setSavingTopic(true);
    try {
      const res = await fetch(`/api/topics/${editTopic.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editTopic.name,
          color: editTopic.color,
          description: editTopic.description,
        }),
      });
      if (res.ok) {
        toast.success(t("topicUpdated"));
        setShowEditTopicModal(false);
        setEditTopic(null);
        fetchTopics();
      } else {
        const data = await res.json();
        toast.error(data.error || t("topicUpdateFailed"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSavingTopic(false);
    }
  }

  function requestDeleteTopic(topicId: string, label: string) {
    setDeleteTarget({ id: topicId, type: "topic", label });
    setShowDeleteModal(true);
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-amber-700 text-white"
        : "text-amber-800 hover:bg-amber-100 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30"
    }`;

  const subTabClass = (s: SettingsSection) =>
    `px-3 py-1.5 text-sm transition-colors ${
      settingsSection === s
        ? "border-b-2 border-amber-700 text-amber-900 font-semibold"
        : "text-amber-600 hover:text-amber-800"
    }`;

  const totalUserPages = Math.ceil(userTotal / PAGE_SIZE);
  const totalBookPages = Math.ceil(bookTotal / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--text-primary)]">
        {t("title")}
      </h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <button onClick={() => setTab("stats")} className={tabClass("stats")}>
          {t("tabStats")}
        </button>
        <button onClick={() => setTab("users")} className={tabClass("users")}>
          {t("tabUsers")}
        </button>
        <button onClick={() => setTab("books")} className={tabClass("books")}>
          {t("tabBooks")}
        </button>
        <button onClick={() => setTab("topics")} className={tabClass("topics")}>
          {t("tabTopics")}
        </button>
        <button onClick={() => setTab("settings")} className={tabClass("settings")}>
          {t("tabSettings")}
        </button>
        <button onClick={() => setTab("rateLimits")} className={tabClass("rateLimits")}>
          {t("tabRateLimits")}
        </button>
        <button onClick={() => setTab("backup")} className={tabClass("backup")}>
          {t("tabBackup")}
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
        </div>
      ) : (
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Stats tab */}
          {tab === "stats" && stats && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label={t("totalUsers")} value={stats.totalUsers} />
                <StatCard label={t("totalBooks")} value={stats.totalBooks} />
                <StatCard label={t("totalRatings")} value={stats.totalReviews} />
                <StatCard label={t("newUsersMonth")} value={stats.newUsersThisMonth} />
                <StatCard label={t("newBooksMonth")} value={stats.newBooksThisMonth} />
                <StatCard label={t("storageUsage")} value={`${stats.storageUsedMB} MB`} />
                <StatCard label={t("activeReadersMonth")} value={stats.activeReadersThisMonth} />
                <StatCard
                  label={t("platformReadingTime")}
                  value={
                    stats.totalPlatformReadingMinutes >= 60
                      ? `${Math.floor(stats.totalPlatformReadingMinutes / 60)} ora ${stats.totalPlatformReadingMinutes % 60} perc`
                      : `${stats.totalPlatformReadingMinutes} perc`
                  }
                />
              </div>

              {/* Popular Books */}
              {stats.popularBooks && stats.popularBooks.length > 0 && (
                <div className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                    {t("popularBooks")}
                  </h3>
                  <div className="space-y-2">
                    {stats.popularBooks.map((book, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-amber-50/50 px-3 py-2 dark:bg-[var(--bg-secondary)]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{book.title}</p>
                          <p className="truncate text-xs text-[var(--text-muted)]">{book.author}</p>
                        </div>
                        <span className="ml-3 shrink-0 rounded-full bg-amber-200/60 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-800/30 dark:text-[var(--accent-gold)]">
                          {book.readers} {t("readers")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Users tab */}
          {tab === "users" && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1">
                  <SearchBar
                    value={userSearch}
                    onChange={handleUserSearch}
                    placeholder={t("searchUsers")}
                  />
                </div>
                <button
                  onClick={() => setShowCreateUserModal(true)}
                  className="shrink-0 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
                >
                  + {t("newUser")}
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-amber-800/20 dark:border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-amber-800/20 bg-amber-100/50 dark:bg-amber-900/30 dark:border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("name")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("email")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("role")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("totalBooks")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("registration")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, i) => (
                      <tr
                        key={user.id}
                        className={i % 2 === 0 ? "bg-white dark:bg-[var(--bg-card)]" : "bg-amber-50/30 dark:bg-[var(--bg-secondary)]"}
                      >
                        <td className="px-4 py-3 font-medium">{user.name || "-"}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{user.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.role === "ADMIN"
                                ? "bg-amber-700 text-white"
                                : "bg-amber-200/60 text-amber-800"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">{user._count.books}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                          {new Date(user.createdAt).toLocaleDateString("hu-HU")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleRole(user.id, user.role)}
                              className="rounded border border-amber-800/20 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                            >
                              {user.role === "ADMIN" ? "-> USER" : "-> ADMIN"}
                            </button>
                            <button
                              onClick={() => requestDeleteUser(user.id, user.name || user.email)}
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              {tc("delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">{tc("noResults")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalUserPages > 1 && (
                <Pagination page={userPage} totalPages={totalUserPages} onPageChange={setUserPage} />
              )}
            </div>
          )}

          {/* Topics tab */}
          {tab === "topics" && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder={t("searchTopics")}
                    className="w-full max-w-md rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  />
                </div>
                <button
                  onClick={() => setShowCreateTopicModal(true)}
                  className="shrink-0 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
                >
                  + {t("newTopic")}
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-amber-800/20 dark:border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-amber-800/20 bg-amber-100/50 dark:bg-amber-900/30 dark:border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("color")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("name")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("slug")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("topicDescription")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("totalBooks")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics
                      .filter((tp) =>
                        !topicSearch || tp.name.toLowerCase().includes(topicSearch.toLowerCase())
                      )
                      .map((topic, i) => (
                        <tr
                          key={topic.id}
                          className={i % 2 === 0 ? "bg-white dark:bg-[var(--bg-card)]" : "bg-amber-50/30 dark:bg-[var(--bg-secondary)]"}
                        >
                          <td className="px-4 py-3">
                            <span
                              className="inline-block h-5 w-5 rounded-full border border-amber-200"
                              style={{ backgroundColor: topic.color || "#C9A96E" }}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium">{topic.name}</td>
                          <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{topic.slug}</td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-sm text-[var(--text-secondary)]">
                            {topic.description || "-"}
                          </td>
                          <td className="px-4 py-3">{topic._count.books}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditTopic(topic);
                                  setShowEditTopicModal(true);
                                }}
                                className="rounded border border-amber-800/20 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                              >
                                {tc("edit")}
                              </button>
                              <button
                                onClick={() => requestDeleteTopic(topic.id, topic.name)}
                                className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                {tc("delete")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {topics.filter((tp) =>
                      !topicSearch || tp.name.toLowerCase().includes(topicSearch.toLowerCase())
                    ).length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">{tc("noResults")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings tab */}
          {tab === "settings" && (
            <div>
              <div className="mb-6 flex gap-2 border-b border-amber-200 pb-3 dark:border-[var(--border)]">
                <button className={subTabClass("smtp")} onClick={() => setSettingsSection("smtp")}>
                  {t("smtpSettings")}
                </button>
                <button className={subTabClass("oidc")} onClick={() => setSettingsSection("oidc")}>
                  {t("oidcSettings")}
                </button>
                <button className={subTabClass("registration")} onClick={() => setSettingsSection("registration")}>
                  {t("registrationSettings")}
                </button>
                <button className={subTabClass("metadata")} onClick={() => setSettingsSection("metadata")}>
                  {t("metadataSettings")}
                </button>
              </div>
              {settingsSection === "smtp" && <SmtpSettings />}
              {settingsSection === "oidc" && <OidcSettings />}
              {settingsSection === "registration" && <RegistrationSettings />}
              {settingsSection === "metadata" && <MetadataSettings />}
            </div>
          )}

          {/* Books tab */}
          {/* Rate Limits tab */}
          {tab === "rateLimits" && rateLimitData && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label={t("rlActiveLimits")} value={rateLimitData.totalActive} />
                <StatCard label={t("rlBlockedIps")} value={rateLimitData.totalBlocked} />
                {rateLimitData.summary.map((s) => (
                  <div key={s.prefix} className="rounded-xl border border-amber-800/20 bg-white p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
                    <p className="text-xs font-medium uppercase text-[var(--text-muted)]">{s.prefix}</p>
                    <p className="mt-1 text-xl font-bold text-amber-700 dark:text-[var(--accent-gold)]">{s.activeLimits}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {s.blockedIps > 0 && <span className="text-red-500">{s.blockedIps} {t("rlBlocked")}</span>}
                      {s.blockedIps === 0 && <span>{s.uniqueIps} IP</span>}
                    </p>
                  </div>
                ))}
              </div>

              {/* Entries table */}
              <div className="overflow-x-auto rounded-xl border border-amber-800/20 dark:border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-amber-800/20 bg-amber-100/50 dark:bg-amber-900/30 dark:border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("rlEndpoint")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">IP</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("rlRequests")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("rlRemaining")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("rlResetsIn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateLimitData.entries.map((entry, i) => (
                      <tr
                        key={`${entry.prefix}-${entry.ip}`}
                        className={`${i % 2 === 0 ? "bg-white dark:bg-[var(--bg-card)]" : "bg-amber-50/30 dark:bg-[var(--bg-secondary)]"} ${entry.remaining === 0 ? "text-red-600" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{entry.prefix}</td>
                        <td className="px-4 py-3 font-mono text-xs">{entry.ip}</td>
                        <td className="px-4 py-3">
                          <span className={entry.remaining === 0 ? "font-bold text-red-600" : ""}>
                            {entry.count}
                          </span>
                          <span className="text-[var(--text-muted)]"> / {entry.maxRequests}</span>
                        </td>
                        <td className="px-4 py-3">{entry.remaining}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{entry.resetsIn}s</td>
                      </tr>
                    ))}
                    {rateLimitData.entries.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">{t("rlNoActiveEntries")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-[var(--text-muted)]">{t("rlAutoRefresh")}</p>
            </div>
          )}

          {tab === "books" && (
            <div>
              <SearchBar
                value={bookSearch}
                onChange={handleBookSearch}
                placeholder={t("searchBooks")}
              />
              <div className="overflow-x-auto rounded-xl border border-amber-800/20 dark:border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-amber-800/20 bg-amber-100/50 dark:bg-amber-900/30 dark:border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("bookTitle")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("author")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("uploader")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("format")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("fileSize")}</th>
                      <th className="px-4 py-3 font-semibold text-amber-900 dark:text-[var(--text-primary)]">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book, i) => (
                      <tr
                        key={book.id}
                        className={i % 2 === 0 ? "bg-white dark:bg-[var(--bg-card)]" : "bg-amber-50/30 dark:bg-[var(--bg-secondary)]"}
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/book/${book.id}`} className="text-amber-700 hover:underline">
                            {book.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {book.author || "-"}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {book.user.name || book.user.email}
                        </td>
                        <td className="px-4 py-3 uppercase">{book.originalFormat}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                          {book.fileSize ? `${(book.fileSize / (1024 * 1024)).toFixed(1)} MB` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => requestDeleteBook(book.id, book.title)}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            {tc("delete")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {books.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">{tc("noResults")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalBookPages > 1 && (
                <Pagination page={bookPage} totalPages={totalBookPages} onPageChange={setBookPage} />
              )}
            </div>
          )}

          {tab === "backup" && (
            <BackupPanel />
          )}
        </motion.div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setShowDeleteModal(false);
            setDeleteTarget(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="w-full max-w-sm rounded-xl border border-amber-800/20 bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">
              {deleteTarget.type === "user" ? t("deleteUserTitle") : deleteTarget.type === "book" ? t("deleteBookTitle") : t("deleteTopicTitle")}
            </h3>
            <p className="mt-2 text-sm text-amber-800/70">
              {t("confirmDelete", { name: deleteTarget.label })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? tc("deleting") : tc("delete")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create user modal */}
      {showCreateUserModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setShowCreateUserModal(false);
            setNewUser({ name: "", email: "", password: "", role: "USER" });
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="w-full max-w-sm rounded-xl border border-amber-800/20 bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">{t("createUserTitle")}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("name")} *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                  placeholder={t("fullName")}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("email")} *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("passwordMin")}</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                  placeholder={t("passwordPlaceholder")}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("role")}</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as "USER" | "ADMIN" }))}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateUserModal(false);
                  setNewUser({ name: "", email: "", password: "", role: "USER" });
                }}
                className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={createUser}
                disabled={creatingUser}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {creatingUser ? tc("creating") : tc("create")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create topic modal */}
      {showCreateTopicModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setShowCreateTopicModal(false);
            setNewTopic({ name: "", color: "#C9A96E", description: "" });
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="w-full max-w-sm rounded-xl border border-amber-800/20 bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">{t("createTopicTitle")}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("name")} *</label>
                <input
                  type="text"
                  value={newTopic.name}
                  onChange={(e) => setNewTopic((tp) => ({ ...tp, name: e.target.value }))}
                  placeholder={t("topicNamePlaceholder")}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("color")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newTopic.color}
                    onChange={(e) => setNewTopic((tp) => ({ ...tp, color: e.target.value }))}
                    className="h-10 w-14 cursor-pointer rounded border border-amber-800/20"
                  />
                  <input
                    type="text"
                    value={newTopic.color}
                    onChange={(e) => setNewTopic((tp) => ({ ...tp, color: e.target.value }))}
                    className="flex-1 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("topicDescription")}</label>
                <textarea
                  value={newTopic.description}
                  onChange={(e) => setNewTopic((tp) => ({ ...tp, description: e.target.value }))}
                  placeholder={t("topicDescPlaceholder")}
                  rows={3}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateTopicModal(false);
                  setNewTopic({ name: "", color: "#C9A96E", description: "" });
                }}
                className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={createTopic}
                disabled={savingTopic}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {savingTopic ? tc("creating") : tc("create")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit topic modal */}
      {showEditTopicModal && editTopic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setShowEditTopicModal(false);
            setEditTopic(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="w-full max-w-sm rounded-xl border border-amber-800/20 bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">{t("editTopicTitle")}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("name")} *</label>
                <input
                  type="text"
                  value={editTopic.name}
                  onChange={(e) => setEditTopic((tp) => tp ? { ...tp, name: e.target.value } : tp)}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("color")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={editTopic.color || "#C9A96E"}
                    onChange={(e) => setEditTopic((tp) => tp ? { ...tp, color: e.target.value } : tp)}
                    className="h-10 w-14 cursor-pointer rounded border border-amber-800/20"
                  />
                  <input
                    type="text"
                    value={editTopic.color || ""}
                    onChange={(e) => setEditTopic((tp) => tp ? { ...tp, color: e.target.value } : tp)}
                    className="flex-1 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("topicDescription")}</label>
                <textarea
                  value={editTopic.description || ""}
                  onChange={(e) => setEditTopic((tp) => tp ? { ...tp, description: e.target.value } : tp)}
                  rows={3}
                  className="w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditTopicModal(false);
                  setEditTopic(null);
                }}
                className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={updateTopic}
                disabled={savingTopic}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {savingTopic ? tc("saving") : tc("save")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-amber-800/20 bg-white p-5 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-[var(--accent-gold)]">{value}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div className="mb-4">
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onChange(local); }}
        onBlur={() => onChange(local)}
        placeholder={placeholder}
        className="w-full max-w-md rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
      />
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const tc = useTranslations("common");

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-amber-800/20 px-3 py-1.5 text-sm text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30 dark:border-[var(--border)]"
      >
        {tc("previous")}
      </button>
      <span className="text-sm text-[var(--text-muted)]">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-amber-800/20 px-3 py-1.5 text-sm text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/30 dark:border-[var(--border)]"
      >
        {tc("next")}
      </button>
    </div>
  );
}

function SmtpSettings() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    email_verification_enabled: "false",
    smtp_host: "",
    smtp_port: "587",
    smtp_secure: "false",
    smtp_user: "",
    smtp_pass: "",
    smtp_from: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm((prev) => ({ ...prev, ...d.settings }));
        }
      })
      .catch(() => toast.error(tc("networkError")))
      .finally(() => setLoading(false));
  }, [tc]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      if (res.ok) {
        toast.success(t("smtpSaved"));
      } else {
        toast.error(tc("error"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(t("connectionSuccess"));
      } else {
        toast.error(`SMTP: ${data.error}`);
      }
    } catch {
      setTestResult({ success: false, error: tc("networkError") });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]";

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-amber-800/20 bg-white p-6 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
        <h2 className="mb-1 text-lg font-bold text-amber-900 dark:text-[var(--text-primary)] dark:text-[var(--text-primary)]">{t("smtpSettings")}</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {t("smtpDesc")}
        </p>

        <div className="space-y-4">
          {/* Email verification toggle */}
          <div className="rounded-lg border border-amber-800/20 bg-amber-50/50 p-4 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("emailVerification")}</label>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("emailVerificationDesc")}</p>
              </div>
              <select
                value={form.email_verification_enabled}
                onChange={(e) => setForm((f) => ({ ...f, email_verification_enabled: e.target.value }))}
                className="ml-4 rounded-lg border border-amber-800/20 bg-white px-3 py-1.5 text-sm dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
              >
                <option value="false">{t("sslNo")}</option>
                <option value="true">{t("sslYes")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("smtpHost")}</label>
            <input
              type="text"
              value={form.smtp_host}
              onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
              placeholder={t("smtpHostPlaceholder")}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("port")}</label>
              <input
                type="text"
                value={form.smtp_port}
                onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                placeholder="587"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("sslTls")}</label>
              <select
                value={form.smtp_secure}
                onChange={(e) => setForm((f) => ({ ...f, smtp_secure: e.target.value }))}
                className={inputClass}
              >
                <option value="false">{t("sslNo")}</option>
                <option value="true">{t("sslYes")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("username")}</label>
            <input
              type="text"
              value={form.smtp_user}
              onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
              placeholder="email@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("appPassword")}</label>
            <input
              type="password"
              value={form.smtp_pass}
              onChange={(e) => setForm((f) => ({ ...f, smtp_pass: e.target.value }))}
              placeholder={t("appPassword")}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("fromAddress")}</label>
            <input
              type="text"
              value={form.smtp_from}
              onChange={(e) => setForm((f) => ({ ...f, smtp_from: e.target.value }))}
              placeholder="ShelfHaven <noreply@shelfhaven.app>"
              className={inputClass}
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              testResult.success
                ? "border border-green-200 bg-green-50 text-green-800"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {testResult.success
              ? t("connectionSuccess")
              : `${tc("error")}: ${testResult.error}`}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? tc("saving") : tc("save")}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !form.smtp_host}
            className="rounded-lg border border-amber-800/20 px-5 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40"
          >
            {testing ? t("testing") : t("testConnection")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OidcSettings() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    oidc_enabled: "false",
    oidc_issuer: "",
    oidc_client_id: "",
    oidc_client_secret: "",
    oidc_only: "false",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm((prev) => ({ ...prev, ...d.settings }));
        }
      })
      .catch(() => toast.error(tc("networkError")))
      .finally(() => setLoading(false));
  }, [tc]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      if (res.ok) {
        toast.success(t("oidcSaved"));
      } else {
        toast.error(tc("error"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]";

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-amber-800/20 bg-white p-6 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
        <h2 className="mb-1 text-lg font-bold text-amber-900 dark:text-[var(--text-primary)] dark:text-[var(--text-primary)]">{t("oidcSettings")}</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {t("oidcDesc")}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("oidcEnabled")}</label>
            <select
              value={form.oidc_enabled}
              onChange={(e) => setForm((f) => ({ ...f, oidc_enabled: e.target.value }))}
              className={inputClass}
            >
              <option value="false">{tc("no")}</option>
              <option value="true">{tc("yes")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("issuerUrl")}</label>
            <input
              type="text"
              value={form.oidc_issuer}
              onChange={(e) => setForm((f) => ({ ...f, oidc_issuer: e.target.value }))}
              placeholder="https://auth.example.com/application/o/app/"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("clientId")}</label>
            <input
              type="text"
              value={form.oidc_client_id}
              onChange={(e) => setForm((f) => ({ ...f, oidc_client_id: e.target.value }))}
              placeholder={t("clientId")}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("clientSecret")}</label>
            <input
              type="password"
              value={form.oidc_client_secret}
              onChange={(e) => setForm((f) => ({ ...f, oidc_client_secret: e.target.value }))}
              placeholder={t("clientSecret")}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("oidcOnly")}</label>
            <select
              value={form.oidc_only}
              onChange={(e) => setForm((f) => ({ ...f, oidc_only: e.target.value }))}
              className={inputClass}
            >
              <option value="false">{tc("no")}</option>
              <option value="true">{tc("yes")}</option>
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("oidcOnlyDesc")}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistrationSettings() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    registration_enabled: "true",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm((prev) => ({ ...prev, ...d.settings }));
        }
      })
      .catch(() => toast.error(tc("networkError")))
      .finally(() => setLoading(false));
  }, [tc]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      if (res.ok) {
        toast.success(t("registrationSaved"));
      } else {
        toast.error(tc("error"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]";

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-amber-800/20 bg-white p-6 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
        <h2 className="mb-1 text-lg font-bold text-amber-900 dark:text-[var(--text-primary)] dark:text-[var(--text-primary)]">{t("registrationSettings")}</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {t("registrationSettingsDesc")}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("registrationEnabled")}</label>
            <select
              value={form.registration_enabled}
              onChange={(e) => setForm((f) => ({ ...f, registration_enabled: e.target.value }))}
              className={inputClass}
            >
              <option value="true">{tc("yes")}</option>
              <option value="false">{tc("no")}</option>
            </select>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetadataSettings() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    hardcover_api_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm((prev) => ({ ...prev, ...d.settings }));
        }
      })
      .catch(() => toast.error(tc("networkError")))
      .finally(() => setLoading(false));
  }, [tc]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      if (res.ok) {
        toast.success(t("metadataSaved"));
      } else {
        toast.error(tc("error"));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 dark:bg-[var(--bg-input)] dark:border-[var(--border)]";

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-amber-800/20 bg-white p-6 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
        <h2 className="mb-1 text-lg font-bold text-amber-900 dark:text-[var(--text-primary)] dark:text-[var(--text-primary)]">{t("metadataSettings")}</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {t("metadataSettingsDesc")}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)]">{t("hardcoverApiKey")}</label>
            <input
              type="password"
              value={form.hardcover_api_key}
              onChange={(e) => setForm((f) => ({ ...f, hardcover_api_key: e.target.value }))}
              placeholder={t("hardcoverApiPlaceholder")}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("hardcoverApiHint")}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
