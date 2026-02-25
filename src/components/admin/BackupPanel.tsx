"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface BackupInfo {
  lastBackup: {
    date: string;
    size: string;
    counts: Record<string, number>;
  } | null;
}

interface ProgressState {
  operationId: string;
  type: "backup" | "restore";
  status: "running" | "completed" | "failed";
  step: string;
  percentage: number;
  message: string;
  current?: number;
  total?: number;
  error?: string;
}

export default function BackupPanel() {
  const t = useTranslations("admin");
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<"wipe" | "merge">("wipe");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchBackupInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup");
      if (res.ok) {
        const data = await res.json();
        setBackupInfo(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackupInfo();
  }, [fetchBackupInfo]);

  function subscribeToProgress(operationId: string) {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/admin/backup/progress?operationId=${operationId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data: ProgressState = JSON.parse(event.data);
      setProgress(data);

      if (data.status === "completed") {
        es.close();
        eventSourceRef.current = null;

        if (data.type === "backup") {
          // Trigger download
          window.open(`/api/admin/backup/download?operationId=${operationId}`, "_blank");
          toast.success(t("backupSuccess"));
          setCreating(false);
          fetchBackupInfo();
        } else {
          toast.success(t("restoreSuccess"));
          setRestoring(false);
          fetchBackupInfo();
        }

        setTimeout(() => setProgress(null), 2000);
      } else if (data.status === "failed") {
        es.close();
        eventSourceRef.current = null;
        const errorMsg = data.type === "backup" ? t("backupFailed") : t("restoreFailed");
        toast.error(data.error || errorMsg);
        setCreating(false);
        setRestoring(false);
        setTimeout(() => setProgress(null), 3000);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  }

  async function handleCreateBackup() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("backupFailed"));
        setCreating(false);
        return;
      }

      const { operationId } = await res.json();
      subscribeToProgress(operationId);
    } catch {
      toast.error(t("backupFailed"));
      setCreating(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    setShowRestoreConfirm(false);
    setRestoring(true);

    try {
      const formData = new FormData();
      formData.append("file", restoreFile);
      formData.append("mode", restoreMode);

      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("restoreFailed"));
        setRestoring(false);
        return;
      }

      const { operationId } = await res.json();
      subscribeToProgress(operationId);
    } catch {
      toast.error(t("restoreFailed"));
      setRestoring(false);
    }
  }

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Section 1: Last backup info */}
      <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-5 dark:border-amber-800/20 dark:bg-[var(--bg-card)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("lastBackup")}</h3>
        {loading ? (
          <div className="mt-3 h-6 w-48 animate-pulse rounded bg-amber-200/30" />
        ) : backupInfo?.lastBackup ? (
          <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
            <p>
              <span className="font-medium">{t("lastBackupDate")}:</span>{" "}
              {new Date(backupInfo.lastBackup.date).toLocaleString("hu-HU")}
            </p>
            <p>
              <span className="font-medium">{t("lastBackupSize")}:</span> {backupInfo.lastBackup.size}
            </p>
            <p>
              <span className="font-medium">{t("backupContents")}:</span>{" "}
              {Object.entries(backupInfo.lastBackup.counts)
                .filter(([, v]) => v > 0)
                .slice(0, 6)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("noBackupYet")}</p>
        )}
      </div>

      {/* Section 2: Create backup */}
      <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-5 dark:border-amber-800/20 dark:bg-[var(--bg-card)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("backupTitle")}</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("backupDesc")}</p>
        <button
          onClick={handleCreateBackup}
          disabled={creating || restoring}
          className="mt-4 rounded-lg bg-amber-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {creating ? t("creatingBackup") : t("createBackup")}
        </button>
      </div>

      {/* Section 3: Restore from backup */}
      <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-5 dark:border-amber-800/20 dark:bg-[var(--bg-card)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("restoreTitle")}</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("restoreDesc")}</p>

        {/* File input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--text-primary)]">{t("restoreSelectFile")}</label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:rounded-lg file:border-0 file:bg-amber-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-amber-600"
            disabled={restoring}
          />
        </div>

        {/* Restore mode */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--text-primary)]">{t("restoreMode")}</label>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="radio"
                name="restoreMode"
                value="wipe"
                checked={restoreMode === "wipe"}
                onChange={() => setRestoreMode("wipe")}
                className="accent-amber-700"
              />
              {t("restoreModeWipe")}
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="radio"
                name="restoreMode"
                value="merge"
                checked={restoreMode === "merge"}
                onChange={() => setRestoreMode("merge")}
                className="accent-amber-700"
              />
              {t("restoreModeMerge")}
            </label>
          </div>
        </div>

        {/* Wipe warning */}
        {restoreMode === "wipe" && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/30 dark:bg-red-900/10 dark:text-red-400">
            {t("restoreWipeWarning")}
          </div>
        )}

        <button
          onClick={() => setShowRestoreConfirm(true)}
          disabled={!restoreFile || restoring || creating}
          className="mt-4 rounded-lg bg-amber-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {restoring ? t("restoring") : t("restoreStart")}
        </button>
      </div>

      {/* Restore confirmation modal */}
      <AnimatePresence>
        {showRestoreConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowRestoreConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[var(--bg-card)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("restoreConfirmTitle")}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("restoreConfirmMessage")}</p>
              <div className="mt-4 flex gap-3 justify-end">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {t("cancel") || "Mégse"}
                </button>
                <button
                  onClick={handleRestore}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  {t("restoreStart")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress overlay */}
      <AnimatePresence>
        {progress && progress.status === "running" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-[var(--bg-card)]"
            >
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {progress.type === "backup" ? t("creatingBackup") : t("restoring")}
              </h3>
              <div className="mt-4">
                <div className="h-3 w-full rounded-full bg-amber-100 dark:bg-amber-900/20">
                  <motion.div
                    className="h-3 rounded-full bg-amber-700"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-sm text-[var(--text-muted)]">
                  <span>{progress.message}</span>
                  <span>{progress.percentage}%</span>
                </div>
                {progress.current !== undefined && progress.total !== undefined && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {progress.current} / {progress.total}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
