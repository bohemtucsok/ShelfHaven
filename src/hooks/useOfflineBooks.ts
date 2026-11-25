"use client";

import { useState, useEffect, useCallback } from "react";
import { get, set, del, keys } from "idb-keyval";

const OFFLINE_PREFIX = "offline-book-";

interface OfflineBookMeta {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  savedAt: string;
  fileSize: number;
}

interface OfflineBookData extends OfflineBookMeta {
  blob: Blob;
}

async function readStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return { used: estimate.usage || 0, quota: estimate.quota || 0 };
    }
  } catch {}
  return null;
}

export function useOfflineBooks() {
  const [offlineBookIds, setOfflineBookIds] = useState<Set<string>>(new Set());
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);

  // Load offline book IDs on mount
  useEffect(() => {
    async function loadIds() {
      try {
        const allKeys = await keys();
        const bookIds = (allKeys as string[])
          .filter((k) => typeof k === "string" && k.startsWith(OFFLINE_PREFIX))
          .map((k) => k.replace(OFFLINE_PREFIX, ""));
        setOfflineBookIds(new Set(bookIds));
      } catch {}
    }
    loadIds();
  }, []);

  // Update storage usage estimate
  const updateStorageEstimate = useCallback(async () => {
    const estimate = await readStorageEstimate();
    if (estimate) setStorageUsage(estimate);
  }, []);

  useEffect(() => {
    readStorageEstimate().then((estimate) => {
      if (estimate) setStorageUsage(estimate);
    });
  }, []);

  const saveBookOffline = useCallback(
    async (bookId: string, fileUrl: string, meta: { title: string; author: string; coverUrl: string | null }) => {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Failed to download book");
      const blob = await response.blob();

      const data: OfflineBookData = {
        bookId,
        blob,
        title: meta.title,
        author: meta.author,
        coverUrl: meta.coverUrl,
        savedAt: new Date().toISOString(),
        fileSize: blob.size,
      };

      await set(`${OFFLINE_PREFIX}${bookId}`, data);
      setOfflineBookIds((prev) => new Set([...prev, bookId]));
      await updateStorageEstimate();
    },
    [updateStorageEstimate]
  );

  const removeOfflineBook = useCallback(
    async (bookId: string) => {
      await del(`${OFFLINE_PREFIX}${bookId}`);
      setOfflineBookIds((prev) => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
      await updateStorageEstimate();
    },
    [updateStorageEstimate]
  );

  const getOfflineBook = useCallback(async (bookId: string): Promise<OfflineBookData | null> => {
    try {
      const data = await get(`${OFFLINE_PREFIX}${bookId}`);
      return data || null;
    } catch {
      return null;
    }
  }, []);

  const getOfflineBookUrl = useCallback(async (bookId: string): Promise<string | null> => {
    const data = await getOfflineBook(bookId);
    if (!data?.blob) return null;
    return URL.createObjectURL(data.blob);
  }, [getOfflineBook]);

  const isBookOffline = useCallback(
    (bookId: string): boolean => offlineBookIds.has(bookId),
    [offlineBookIds]
  );

  const listOfflineBooks = useCallback(async (): Promise<OfflineBookMeta[]> => {
    const allKeys = await keys();
    const bookKeys = (allKeys as string[]).filter(
      (k) => typeof k === "string" && k.startsWith(OFFLINE_PREFIX)
    );
    const books: OfflineBookMeta[] = [];
    for (const key of bookKeys) {
      try {
        const data = await get(key) as OfflineBookData | undefined;
        if (data) {
          const meta: OfflineBookMeta = {
            bookId: data.bookId,
            title: data.title,
            author: data.author,
            coverUrl: data.coverUrl,
            savedAt: data.savedAt,
            fileSize: data.fileSize,
          };
          books.push(meta);
        }
      } catch {}
    }
    return books.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }, []);

  const removeAllOfflineBooks = useCallback(async () => {
    const allKeys = await keys();
    const bookKeys = (allKeys as string[]).filter(
      (k) => typeof k === "string" && k.startsWith(OFFLINE_PREFIX)
    );
    for (const key of bookKeys) {
      await del(key);
    }
    setOfflineBookIds(new Set());
    await updateStorageEstimate();
  }, [updateStorageEstimate]);

  return {
    saveBookOffline,
    removeOfflineBook,
    getOfflineBook,
    getOfflineBookUrl,
    isBookOffline,
    listOfflineBooks,
    removeAllOfflineBooks,
    offlineBookIds,
    storageUsage,
  };
}
