export interface BookData {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  fileUrl: string;
  originalFormat: string;
  fileSize: number;
  pageCount: number | null;
  isbn: string | null;
  language: string | null;
  publishedYear: number | null;
  createdAt: Date;
  categories: { category: { id: string; name: string; slug: string; color: string | null } }[];
  topics: { topic: { id: string; name: string; slug: string; color: string | null } }[];
}

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order: number;
  _count?: { books: number };
}

export interface TopicData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  _count?: { books: number };
}

export interface ReadingProgressData {
  bookId: string;
  cfi: string | null;
  percentage: number;
  currentPage: number | null;
  totalPages: number | null;
  lastReadAt: Date;
}

export type SupportedFormat = "epub" | "pdf" | "mobi" | "fb2" | "djvu" | "azw3" | "cbr" | "cbz";

export const SUPPORTED_FORMATS: SupportedFormat[] = ["epub", "pdf", "mobi", "fb2", "djvu", "azw3", "cbr", "cbz"];

export const SUPPORTED_MIME_TYPES: Record<string, SupportedFormat> = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
  "application/x-mobipocket-ebook": "mobi",
  "application/x-fictionbook+xml": "fb2",
  "image/vnd.djvu": "djvu",
  "application/vnd.amazon.ebook": "azw3",
  "application/x-cbr": "cbr",
  "application/x-cbz": "cbz",
};
