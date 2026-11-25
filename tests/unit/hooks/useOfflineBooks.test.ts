import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const store = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  keys: vi.fn(async () => [...store.keys()]),
}));

import { useOfflineBooks } from "@/hooks/useOfflineBooks";

const originalStorage = navigator.storage;

function mockEstimate(estimate: () => Promise<StorageEstimate>) {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { estimate: vi.fn(estimate) },
  });
}

describe("useOfflineBooks", () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: originalStorage,
    });
    vi.unstubAllGlobals();
  });

  it("loads the storage estimate on mount", async () => {
    mockEstimate(async () => ({ usage: 1234, quota: 5000 }));

    const { result } = renderHook(() => useOfflineBooks());

    expect(result.current.storageUsage).toBeNull();
    await waitFor(() =>
      expect(result.current.storageUsage).toEqual({ used: 1234, quota: 5000 })
    );
  });

  it("defaults missing usage/quota to 0", async () => {
    mockEstimate(async () => ({}));

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() =>
      expect(result.current.storageUsage).toEqual({ used: 0, quota: 0 })
    );
  });

  it("keeps storageUsage null when the Storage API is unavailable", async () => {
    Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });

    const { result } = renderHook(() => useOfflineBooks());

    await act(async () => {});
    expect(result.current.storageUsage).toBeNull();
  });

  it("keeps storageUsage null when estimate() rejects", async () => {
    mockEstimate(async () => {
      throw new Error("denied");
    });

    const { result } = renderHook(() => useOfflineBooks());

    await act(async () => {});
    expect(result.current.storageUsage).toBeNull();
  });

  it("loads offline book ids on mount", async () => {
    mockEstimate(async () => ({ usage: 0, quota: 0 }));
    store.set("offline-book-a1", { bookId: "a1" });
    store.set("unrelated-key", 1);

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() => expect(result.current.isBookOffline("a1")).toBe(true));
    expect(result.current.offlineBookIds.size).toBe(1);
  });

  it("refreshes the estimate after saving a book", async () => {
    let usage = 100;
    mockEstimate(async () => ({ usage, quota: 1000 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["epub-bytes"]) }))
    );

    const { result } = renderHook(() => useOfflineBooks());
    await waitFor(() => expect(result.current.storageUsage?.used).toBe(100));

    usage = 300;
    await act(async () => {
      await result.current.saveBookOffline("b2", "/api/books/b2/download", {
        title: "T",
        author: "A",
        coverUrl: null,
      });
    });

    expect(result.current.isBookOffline("b2")).toBe(true);
    expect(result.current.storageUsage).toEqual({ used: 300, quota: 1000 });
  });

  it("lists offline books without the blob, newest first", async () => {
    mockEstimate(async () => ({ usage: 0, quota: 0 }));
    store.set("offline-book-old", {
      bookId: "old", title: "Old", author: "X", coverUrl: null,
      savedAt: "2026-01-01T00:00:00.000Z", fileSize: 1, blob: new Blob(["1"]),
    });
    store.set("offline-book-new", {
      bookId: "new", title: "New", author: "Y", coverUrl: null,
      savedAt: "2026-06-01T00:00:00.000Z", fileSize: 2, blob: new Blob(["22"]),
    });

    const { result } = renderHook(() => useOfflineBooks());
    let books: Awaited<ReturnType<typeof result.current.listOfflineBooks>> = [];
    await act(async () => {
      books = await result.current.listOfflineBooks();
    });

    expect(books.map((b) => b.bookId)).toEqual(["new", "old"]);
    expect(books[0]).not.toHaveProperty("blob");
  });
});
