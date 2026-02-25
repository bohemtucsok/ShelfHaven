/**
 * Unified book metadata search orchestrator.
 * Searches Google Books and Hardcover API based on user language preference.
 * Hungarian users → Google Books (hu) first, then Hardcover.
 * Other languages → Hardcover first, then Google Books (en).
 */

import { searchHardcover, type HardcoverBookResult } from "./hardcover";
import { searchGoogleBooks, type GoogleBookResult } from "./google-books";

export interface MetadataSearchResult {
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

/**
 * Search for book metadata across all sources.
 * @param title - Book title to search for
 * @param author - Optional author name
 * @param userLanguage - User's language preference (e.g., "hu", "en")
 * @param limit - Max results per source
 */
export async function searchBookMetadata(
  title: string,
  author?: string,
  userLanguage = "hu",
  limit = 5
): Promise<MetadataSearchResult[]> {
  const isHungarian = userLanguage === "hu";
  const langRestrict = isHungarian ? "hu" : "en";

  // Run searches in parallel
  const [googleResults, hardcoverResults] = await Promise.allSettled([
    searchGoogleBooks(title, author, langRestrict, limit),
    searchHardcover(title, author, limit),
  ]);

  const google: MetadataSearchResult[] =
    googleResults.status === "fulfilled"
      ? googleResults.value.map(googleToResult)
      : [];

  const hardcover: MetadataSearchResult[] =
    hardcoverResults.status === "fulfilled"
      ? hardcoverResults.value.map(hardcoverToResult)
      : [];

  // Hungarian users see Google Books (hu) results first
  if (isHungarian) {
    return [...google, ...hardcover];
  }

  // Other languages see Hardcover results first
  return [...hardcover, ...google];
}

function googleToResult(g: GoogleBookResult): MetadataSearchResult {
  return {
    title: g.title,
    author: g.author,
    description: g.description,
    publishedYear: g.publishedYear,
    coverUrl: g.coverUrl,
    isbn: g.isbn,
    rating: g.rating,
    categories: g.categories,
    source: "google",
    sourceUrl: g.googleUrl,
  };
}

function hardcoverToResult(h: HardcoverBookResult): MetadataSearchResult {
  return {
    title: h.title,
    author: h.author,
    description: h.description,
    publishedYear: h.publishedYear,
    coverUrl: h.coverUrl,
    isbn: h.isbn,
    rating: h.rating,
    categories: h.categories,
    source: "hardcover",
  };
}
