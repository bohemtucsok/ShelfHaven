import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function getBookFormatLabel(format: string): string {
  const labels: Record<string, string> = {
    epub: "EPUB",
    pdf: "PDF",
    mobi: "MOBI",
    fb2: "FB2",
    djvu: "DJVU",
    azw3: "AZW3",
    cbr: "CBR",
    cbz: "CBZ",
  };
  return labels[format.toLowerCase()] || format.toUpperCase();
}

