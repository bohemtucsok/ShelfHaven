"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { matchCategoriesAndTopics } from "@/lib/ebook/category-matcher";

const SUPPORTED_FORMATS = [
  "application/epub+zip",
  "application/pdf",
  "application/x-mobipocket-ebook",
  "application/vnd.amazon.ebook",
  "application/x-fictionbook+xml",
  "application/x-cbr",
  "application/x-cbz",
  "image/vnd.djvu",
];

const FORMAT_LABELS: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "application/x-mobipocket-ebook": "MOBI",
  "application/vnd.amazon.ebook": "AZW3",
  "application/x-fictionbook+xml": "FB2",
  "application/x-cbr": "CBR",
  "application/x-cbz": "CBZ",
  "image/vnd.djvu": "DJVU",
};

const ACCEPTED_EXTENSIONS = ".epub,.pdf,.mobi,.azw3,.fb2,.cbr,.cbz,.djvu";

type UploadStatus = "idle" | "uploading" | "success" | "error";
type BulkFileStatus = "pending" | "uploading" | "done" | "error";

interface BulkFile {
  file: File;
  title: string;
  author: string;
  description?: string;
  coverUrl?: string;
  status: BulkFileStatus;
  error?: string;
}

interface Topic {
  id: string;
  name: string;
  color: string | null;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

interface MetadataResult {
  title: string;
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  rating: number | null;
  categories: string[];
  source: "hardcover" | "google";
  sourceUrl?: string;
}

const MAX_BULK_FILES = 10;

interface DuplicateBook {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  originalFormat: string;
  createdAt: string;
}

interface DuplicateWarning {
  duplicates: DuplicateBook[];
  onConfirm: () => void;
}

export default function UploadForm() {
  const router = useRouter();
  const t = useTranslations("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverExternalUrl, setCoverExternalUrl] = useState<string | null>(null);
  const [extractingMetadata, setExtractingMetadata] = useState(false);

  // Bulk upload
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // Online metadata search
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [metadataResults, setMetadataResults] = useState<MetadataResult[]>([]);
  const [searchingMetadata, setSearchingMetadata] = useState(false);
  const [loadingCover, setLoadingCover] = useState<number | null>(null);

  // Bulk file metadata search
  const [bulkSearchIndex, setBulkSearchIndex] = useState<number | null>(null);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);

  // Fetch available topics and categories
  useEffect(() => {
    fetch("/api/topics")
      .then((res) => res.json())
      .then((data) => setTopics(data || []))
      .catch(() => {});
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data))
      .catch(() => {});
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setCoverPreview(null);

    // Try to extract title from filename as fallback
    const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
    const parts = nameWithoutExt.split(" - ");
    if (parts.length >= 2) {
      setAuthor(parts[0].trim());
      setTitle(parts.slice(1).join(" - ").trim());
    } else {
      setTitle(nameWithoutExt);
    }

    // If EPUB, extract metadata automatically
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext === "epub") {
      setExtractingMetadata(true);
      try {
        const fd = new FormData();
        fd.append("file", selectedFile);
        const res = await fetch("/api/books/epub-metadata", { method: "POST", body: fd });
        if (res.ok) {
          const meta = await res.json();
          if (meta.title) setTitle(meta.title);
          if (meta.author) setAuthor(meta.author);
          if (meta.description) setDescription(meta.description);
          if (meta.coverPreview) setCoverPreview(meta.coverPreview);
        }
      } catch {
        // Silent fail - user can still enter manually
      } finally {
        setExtractingMetadata(false);
      }
    }
  }, []);

  const handleMultipleFiles = useCallback((files: FileList) => {
    if (files.length === 1) {
      setBulkFiles([]);
      handleFileSelect(files[0]);
      return;
    }
    // Check max file limit
    if (files.length > MAX_BULK_FILES) {
      toast.error(t("maxFilesExceeded", { max: MAX_BULK_FILES }));
      return;
    }
    // Multiple files → bulk mode
    setFile(null);
    setTitle("");
    setAuthor("");
    setDescription("");
    setCoverPreview(null);
    setCoverExternalUrl(null);

    const items: BulkFile[] = Array.from(files).map((f) => {
      const nameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
      const parts = nameWithoutExt.split(" - ");
      let parsedAuthor = "";
      let parsedTitle = nameWithoutExt;
      if (parts.length >= 2) {
        parsedAuthor = parts[0].trim();
        parsedTitle = parts.slice(1).join(" - ").trim();
      }
      return { file: f, title: parsedTitle, author: parsedAuthor, status: "pending" as const };
    });
    setBulkFiles(items);
  }, [handleFileSelect, t]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleMultipleFiles(files);
      }
    },
    [handleMultipleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  async function performUpload() {
    if (!file) return;

    setStatus("uploading");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("author", author);
    if (description) formData.append("description", description);
    if (selectedCategories.length > 0) {
      formData.append("categoryIds", JSON.stringify(selectedCategories));
    }
    for (const topicId of selectedTopics) {
      formData.append("topicIds", topicId);
    }

    // Send external cover URL for server-side download
    if (coverExternalUrl) {
      formData.append("coverUrl", coverExternalUrl);
    }

    try {
      // Simulate progress (real progress needs XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const res = await fetch("/api/books/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("uploadError"));
      }

      setProgress(100);
      setStatus("success");
      const bookData = await res.json();
      if (bookData.conversionStatus === "pending") {
        toast.success(t("uploadSuccessConversion"));
      } else {
        toast.success(t("uploadSuccessRedirect"));
      }

      // Redirect to library after short delay
      setTimeout(() => {
        router.push("/library");
        router.refresh();
      }, 1500);
    } catch (err) {
      setStatus("error");
      toast.error(err instanceof Error ? err.message : t("unknownAuthor"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error(t("selectFile"));
      return;
    }

    // Check for duplicates before uploading
    const duplicates = await checkDuplicates(title, author);
    if (duplicates.length > 0) {
      setDuplicateWarning({
        duplicates,
        onConfirm: () => {
          setDuplicateWarning(null);
          performUpload();
        },
      });
      return;
    }

    performUpload();
  }

  async function performBulkUpload(skipDuplicateCheck = false) {
    if (bulkFiles.length === 0) return;

    // Check duplicates for all files before starting
    if (!skipDuplicateCheck) {
      const allDuplicates: DuplicateBook[] = [];
      for (const item of bulkFiles) {
        if (item.status === "done") continue;
        const dupes = await checkDuplicates(item.title, item.author);
        for (const d of dupes) {
          if (!allDuplicates.find((x) => x.id === d.id)) {
            allDuplicates.push(d);
          }
        }
      }
      if (allDuplicates.length > 0) {
        setDuplicateWarning({
          duplicates: allDuplicates,
          onConfirm: () => {
            setDuplicateWarning(null);
            performBulkUpload(true);
          },
        });
        return;
      }
    }

    setBulkUploading(true);
    setBulkProgress({ done: 0, total: bulkFiles.length });

    for (let i = 0; i < bulkFiles.length; i++) {
      const item = bulkFiles[i];
      if (item.status === "done") continue;

      setBulkFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("title", item.title || item.file.name);
      formData.append("author", item.author || t("unknownAuthor"));
      if (item.description) formData.append("description", item.description);
      if (item.coverUrl) formData.append("coverUrl", item.coverUrl);
      if (selectedCategories.length > 0) {
        formData.append("categoryIds", JSON.stringify(selectedCategories));
      }
      for (const topicId of selectedTopics) {
        formData.append("topicIds", topicId);
      }

      try {
        const res = await fetch("/api/books/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Ismeretlen hiba" }));
          setBulkFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "error", error: data.error || "Hiba" } : f
            )
          );
        } else {
          setBulkFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
          );
        }
      } catch {
        setBulkFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: "Hálózati hiba" } : f
          )
        );
      }

      setBulkProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setBulkUploading(false);
    toast.success(t("bulkUploadDone"));
    setTimeout(() => {
      router.push("/library");
      router.refresh();
    }, 1500);
  }

  async function handleBulkUpload() {
    performBulkUpload();
  }

  const getFileFormatLabel = () => {
    if (!file) return "";
    return FORMAT_LABELS[file.type] || file.name.split(".").pop()?.toUpperCase() || "?";
  };

  function getFileFormatFromName(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
      epub: "EPUB", pdf: "PDF", mobi: "MOBI", azw3: "AZW3",
      fb2: "FB2", cbr: "CBR", cbz: "CBZ", djvu: "DJVU",
    };
    return map[ext] || ext.toUpperCase();
  }

  function getFormatColor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "epub": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
      case "pdf": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
      case "mobi": return "bg-orange-100 text-orange-700";
      case "azw3": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }

  async function handleBulkMetadataSearch(index: number) {
    const item = bulkFiles[index];
    if (!item.title && !item.author) {
      toast.error(t("searchRequiresInput"));
      return;
    }
    setBulkSearchIndex(index);
    setSearchingMetadata(true);
    setMetadataResults([]);
    setShowMetadataSearch(true);
    try {
      const res = await fetch("/api/books/metadata-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title || undefined, author: item.author || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetadataResults(data.results || []);
        if ((data.results || []).length === 0) {
          toast.info(t("noMatchesOnline"));
        }
      } else {
        toast.error(t("metadataSearchError"));
      }
    } catch {
      toast.error(t("searchNetworkError"));
    } finally {
      setSearchingMetadata(false);
    }
  }

  async function checkDuplicates(
    checkTitle: string,
    checkAuthor: string
  ): Promise<DuplicateBook[]> {
    if (!checkTitle || checkTitle.trim().length < 2) return [];
    try {
      const res = await fetch("/api/books/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: checkTitle, author: checkAuthor || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.duplicates || [];
      }
    } catch {
      // Silent fail - don't block upload for duplicate check failure
    }
    return [];
  }

  async function handleMetadataSearch() {
    if (!title && !author) {
      toast.error(t("searchRequiresInput"));
      return;
    }
    setSearchingMetadata(true);
    setMetadataResults([]);
    setShowMetadataSearch(true);
    try {
      const res = await fetch("/api/books/metadata-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || undefined, author: author || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetadataResults(data.results || []);
        if ((data.results || []).length === 0) {
          toast.info(t("noMatchesOnline"));
        }
      } else {
        toast.error(t("metadataSearchError"));
      }
    } catch {
      toast.error(t("searchNetworkError"));
    } finally {
      setSearchingMetadata(false);
    }
  }

  async function applyMetadataResult(result: MetadataResult, index: number) {
    // If in bulk search mode, apply to specific bulk file
    if (bulkSearchIndex !== null) {
      setBulkFiles((prev) =>
        prev.map((f, idx) =>
          idx === bulkSearchIndex
            ? {
                ...f,
                title: result.title || f.title,
                author: result.author || f.author,
                description: result.description || undefined,
                coverUrl: result.coverUrl || undefined,
              }
            : f
        )
      );

      // Auto-match categories and topics
      const matched = matchCategoriesAndTopics(
        result.categories,
        result.title,
        result.author,
        result.description,
        categories,
        topics
      );
      if (matched.categoryIds.length > 0) {
        setSelectedCategories((prev) => [...new Set([...prev, ...matched.categoryIds])]);
      }
      if (matched.topicIds.length > 0) {
        setSelectedTopics((prev) => [...new Set([...prev, ...matched.topicIds])]);
      }

      setShowMetadataSearch(false);
      setBulkSearchIndex(null);
      toast.success(t("metadataApplied"));
      return;
    }

    // Single file mode
    if (result.title) setTitle(result.title);
    if (result.author) setAuthor(result.author);
    if (result.description) setDescription(result.description);

    // Auto-match categories and topics using shared utility
    const matched = matchCategoriesAndTopics(
      result.categories,
      result.title,
      result.author,
      result.description,
      categories,
      topics
    );

    if (matched.categoryIds.length > 0) {
      setSelectedCategories((prev) => [...new Set([...prev, ...matched.categoryIds])]);
    }
    if (matched.topicIds.length > 0) {
      setSelectedTopics((prev) => [...new Set([...prev, ...matched.topicIds])]);
    }

    // Show auto-match feedback
    const parts: string[] = [];
    if (matched.categoryNames.length > 0) {
      parts.push(`Kategória: ${matched.categoryNames.join(", ")}`);
    }
    if (matched.topicNames.length > 0) {
      parts.push(`Téma: ${matched.topicNames.join(", ")}`);
    }
    if (parts.length > 0) {
      toast.info(`Auto-felismerés: ${parts.join(" | ")}`);
    }

    // Download and resize cover if available
    if (result.coverUrl) {
      setCoverExternalUrl(result.coverUrl);
      setLoadingCover(index);
      try {
        const res = await fetch("/api/books/metadata-search", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: result.coverUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.coverPreview) setCoverPreview(data.coverPreview);
        }
      } catch {
        // Silent fail for cover preview
      } finally {
        setLoadingCover(null);
      }
    }

    setShowMetadataSearch(false);
    toast.success(t("metadataApplied"));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-[var(--text-primary)]">
        {t("title")}
      </h1>
      <p className="mb-8 text-sm text-[var(--text-muted)]">
        {t("supportedFormats")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File drop zone */}
        <div
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? "border-amber-500 bg-amber-50 dark:bg-[var(--bg-secondary)]"
              : file
                ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/20"
                : "border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-card)] dark:border-[var(--border)] hover:border-amber-600/50 hover:bg-amber-50 dark:hover:bg-[var(--bg-secondary)]"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                handleMultipleFiles(files);
              }
            }}
          />

          <AnimatePresence mode="wait">
            {bulkFiles.length > 0 ? (
              <motion.div
                key="bulk-selected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-2 text-4xl">📚</div>
                <p className="font-semibold text-[var(--text-primary)]">
                  {t("filesSelected", { count: bulkFiles.length })}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {t("totalSize", { size: (bulkFiles.reduce((sum, f) => sum + f.file.size, 0) / (1024 * 1024)).toFixed(1) })}
                </p>
                <p className="mt-2 text-xs text-amber-600">
                  {t("clickToChangeMultiple")}
                </p>
              </motion.div>
            ) : file ? (
              <motion.div
                key="file-selected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-2 text-4xl">📚</div>
                <p className="font-semibold text-[var(--text-primary)]">{file.name}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB &middot; {getFileFormatLabel()}
                </p>
                {extractingMetadata && (
                  <p className="mt-2 text-xs text-amber-600 animate-pulse">
                    {t("extractingMetadata")}
                  </p>
                )}
                {coverPreview && (
                  <div className="mt-3 flex justify-center">
                    <Image
                      src={coverPreview}
                      alt={t("coverImage")}
                      width={80}
                      height={120}
                      className="rounded shadow-md"
                    />
                  </div>
                )}
                <p className="mt-2 text-xs text-amber-600">
                  {t("clickToChange")}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="no-file"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-2 text-4xl">📤</div>
                <p className="font-semibold text-[var(--text-primary)]">
                  {t("dropZone")}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {t("maxFileSize")} &middot; {t("maxFilesHint")}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bulk upload mode */}
        {bulkFiles.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {t("bulkUpload", { count: bulkFiles.length })}
            </h3>

            {/* Bulk file list */}
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-amber-800/20 bg-white dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-3">
              {bulkFiles.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2.5 ${
                    item.status === "done"
                      ? "bg-green-50 dark:bg-green-950/20"
                      : item.status === "error"
                        ? "bg-red-50 dark:bg-red-950/20"
                        : item.status === "uploading"
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : "bg-gray-50/50 dark:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Status icon */}
                    <div className="shrink-0">
                      {item.status === "done" ? (
                        <span className="text-green-600">✓</span>
                      ) : item.status === "error" ? (
                        <span className="text-red-500">✗</span>
                      ) : item.status === "uploading" ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700 inline-block" />
                      ) : (
                        <span className="text-amber-400">○</span>
                      )}
                    </div>

                    {/* Format badge */}
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${getFormatColor(item.file.name)}`}>
                      {getFileFormatFromName(item.file.name)}
                    </span>

                    {/* Editable fields */}
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        setBulkFiles((prev) =>
                          prev.map((f, idx) =>
                            idx === i ? { ...f, title: e.target.value } : f
                          )
                        )
                      }
                      disabled={bulkUploading}
                      className="min-w-0 flex-1 rounded border border-amber-800/10 bg-transparent px-2 py-0.5 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600"
                      placeholder={t("titlePlaceholder")}
                    />
                    <input
                      type="text"
                      value={item.author}
                      onChange={(e) =>
                        setBulkFiles((prev) =>
                          prev.map((f, idx) =>
                            idx === i ? { ...f, author: e.target.value } : f
                          )
                        )
                      }
                      disabled={bulkUploading}
                      className="w-36 shrink-0 rounded border border-amber-800/10 bg-transparent px-2 py-0.5 text-sm text-[var(--text-muted)] outline-none focus:border-amber-600"
                      placeholder={t("authorPlaceholder")}
                    />

                    {/* Search button */}
                    {!bulkUploading && (
                      <button
                        type="button"
                        onClick={() => handleBulkMetadataSearch(i)}
                        className="shrink-0 rounded p-1 text-amber-600/60 transition-colors hover:bg-amber-100 hover:text-amber-700"
                        title={t("searchForBook")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}

                    {/* Remove button */}
                    {!bulkUploading && (
                      <button
                        type="button"
                        onClick={() => setBulkFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 rounded p-1 text-amber-700/40 transition-colors hover:bg-amber-100 hover:text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* File details row */}
                  <div className="mt-1 flex items-center gap-2 pl-6 text-xs text-[var(--text-muted)]">
                    <span>{item.file.name}</span>
                    <span>&middot;</span>
                    <span>{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    {item.coverUrl && (
                      <>
                        <span>&middot;</span>
                        <span className="text-green-600">borító</span>
                      </>
                    )}
                    {item.description && (
                      <>
                        <span>&middot;</span>
                        <span className="text-green-600">leírás</span>
                      </>
                    )}
                    {item.error && <span className="ml-2 text-red-500">{item.error}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk progress bar */}
            {bulkUploading && (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-amber-200">
                  <motion.div
                    className="h-full bg-amber-700"
                    initial={{ width: 0 }}
                    animate={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-center text-sm text-amber-700">
                  {bulkProgress.done} / {bulkProgress.total} {t("uploaded")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Single file mode: Title, Author, Description, Metadata */}
        {bulkFiles.length === 0 && (
        <>
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
            {t("bookTitle")}
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
            placeholder={t("bookTitlePlaceholder")}
          />
        </div>

        {/* Author */}
        <div>
          <label htmlFor="author" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
            {t("bookAuthor")}
          </label>
          <input
            id="author"
            type="text"
            required
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
            placeholder={t("bookAuthorPlaceholder")}
          />
        </div>

        {/* Online metadata search button */}
        {(title || author) && (
          <button
            type="button"
            onClick={handleMetadataSearch}
            disabled={searchingMetadata}
            className="w-full rounded-lg border-2 border-dashed border-amber-600/40 bg-amber-50/50 dark:bg-[var(--bg-secondary)] dark:border-[var(--accent-gold)]/40 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-[var(--accent-gold)] transition-colors hover:border-amber-600 hover:bg-amber-50 disabled:opacity-50"
          >
            {searchingMetadata ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
                {t("searching")}
              </span>
            ) : (
              t("searchOnline")
            )}
          </button>
        )}

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
            {t("description")}
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] px-4 py-2.5 text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 resize-none"
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
        </>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-amber-900 dark:text-[var(--accent-gold)]">
              {t("categoryOptional")}
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = selectedCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        selected ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-amber-700 text-white"
                        : "border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] text-amber-800 dark:text-[var(--text-secondary)] hover:bg-amber-100 dark:hover:bg-[var(--bg-secondary)]"
                    }`}
                  >
                    {cat.icon && <span className="mr-1">{cat.icon}</span>}
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Topics */}
        {topics.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
              {t("topicsOptional")}
            </label>
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => {
                const isSelected = selectedTopics.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() =>
                      setSelectedTopics((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== topic.id)
                          : [...prev, topic.id]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-amber-700 text-white"
                        : "border border-amber-800/20 bg-white dark:bg-[var(--bg-input)] dark:border-[var(--border)] text-amber-800 dark:text-[var(--text-secondary)] hover:bg-amber-100 dark:hover:bg-[var(--bg-secondary)]"
                    }`}
                    style={{
                      borderLeft: `3px solid ${topic.color || "#d97706"}`,
                    }}
                  >
                    {topic.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload progress (single file mode) */}
        {bulkFiles.length === 0 && status === "uploading" && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-amber-200">
              <motion.div
                className="h-full bg-amber-700"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-center text-sm text-amber-700">{t("uploadProgress", { progress })}</p>
          </div>
        )}

        {/* Submit button */}
        {bulkFiles.length > 0 ? (
          <button
            type="button"
            onClick={handleBulkUpload}
            disabled={bulkUploading || bulkFiles.length === 0}
            className="w-full rounded-lg bg-amber-700 px-4 py-3 text-lg font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {bulkUploading
              ? t("uploadingProgress", { done: bulkProgress.done, total: bulkProgress.total })
              : t("uploadNBooks", { count: bulkFiles.length })}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!file || status === "uploading" || status === "success"}
            className="w-full rounded-lg bg-amber-700 px-4 py-3 text-lg font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {status === "uploading" ? t("uploading") : t("submitUpload")}
          </button>
        )}
      </form>

      {/* Duplicate warning modal */}
      {duplicateWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDuplicateWarning(null)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-800/20 bg-white dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">
                  {t("duplicateWarningTitle")}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {t("duplicateWarningDesc")}
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              {duplicateWarning.duplicates.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center gap-3 rounded-lg border border-amber-800/10 bg-amber-50/50 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] p-3"
                >
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-amber-200/50">
                    {book.coverUrl ? (
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        width={40}
                        height={56}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      {book.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {book.author || t("unknownAuthor")}
                      {" · "}
                      <span className="uppercase">{book.originalFormat}</span>
                      {" · "}
                      {new Date(book.createdAt).toLocaleDateString("hu-HU")}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="flex-1 rounded-lg border border-amber-800/20 bg-white dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] px-4 py-2.5 text-sm font-medium text-amber-800 dark:text-[var(--text-secondary)] transition-colors hover:bg-amber-50"
              >
                {t("duplicateCancel")}
              </button>
              <button
                type="button"
                onClick={duplicateWarning.onConfirm}
                className="flex-1 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
              >
                {t("duplicateUploadAnyway")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Online metadata search results modal */}
      {showMetadataSearch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setShowMetadataSearch(false); setBulkSearchIndex(null); }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-amber-800/20 bg-white dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-amber-900 dark:text-[var(--text-primary)]">
                {t("metadataResults")}
              </h3>
              <button
                onClick={() => { setShowMetadataSearch(false); setBulkSearchIndex(null); }}
                className="rounded-lg p-1.5 text-amber-700/60 transition-colors hover:bg-amber-100 hover:text-amber-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {searchingMetadata ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
                  <p className="text-sm text-amber-700/70">
                    {t("searchingDatabases")}
                  </p>
                </div>
              </div>
            ) : metadataResults.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-muted)]">
                {t("noMatchesTryAgain")}
              </div>
            ) : (
              <div className="space-y-3">
                {metadataResults.map((result, i) => (
                  <div
                    key={`${result.source}-${i}`}
                    className="flex gap-4 rounded-xl border border-amber-800/20 bg-amber-50/30 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] p-4 transition-colors hover:bg-amber-50 dark:hover:bg-[var(--bg-card)]"
                  >
                    {/* Cover thumbnail */}
                    <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-amber-200/50">
                      {result.coverUrl ? (
                        <Image
                          src={result.coverUrl}
                          alt={result.title}
                          width={64}
                          height={96}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {result.title}
                      </p>
                      {result.author && (
                        <p className="text-sm text-[var(--text-secondary)]">
                          {result.author}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {result.publishedYear && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {result.publishedYear}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          result.source === "google"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        }`}>
                          {result.source === "google" ? "Google Books" : "Hardcover"}
                        </span>
                        {result.rating && (
                          <span className="text-xs text-amber-600">
                            {result.rating}/5
                          </span>
                        )}
                      </div>
                      {result.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                          {result.description}
                        </p>
                      )}
                    </div>

                    {/* Apply button */}
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => applyMetadataResult(result, i)}
                        disabled={loadingCover === i}
                        className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                      >
                        {loadingCover === i ? (
                          <span className="flex items-center gap-1">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-white" />
                          </span>
                        ) : (
                          t("applyBtn")
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
