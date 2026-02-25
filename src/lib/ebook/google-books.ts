/**
 * Google Books API client for book metadata search.
 * Free API, no key required for basic searches.
 * Supports language filtering with langRestrict parameter.
 */

const API_URL = "https://www.googleapis.com/books/v1/volumes";

export interface GoogleBookResult {
  title: string;
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  rating: number | null;
  googleUrl: string;
  categories: string[];
  source: "google";
}

interface GoogleVolume {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    averageRating?: number;
    infoLink?: string;
    language?: string;
    categories?: string[];
  };
}

interface GoogleSearchResponse {
  totalItems: number;
  items?: GoogleVolume[];
}

/**
 * Search Google Books for books matching title and optionally author.
 * @param title - Book title
 * @param author - Optional author name
 * @param langRestrict - Language restriction (e.g., "hu", "en")
 * @param limit - Max results (1-40)
 */
export async function searchGoogleBooks(
  title: string,
  author?: string,
  langRestrict = "hu",
  limit = 5
): Promise<GoogleBookResult[]> {
  try {
    // Build query - combine title and author
    let query = `intitle:${title}`;
    if (author) {
      query += `+inauthor:${author}`;
    }

    const params = new URLSearchParams({
      q: query,
      langRestrict,
      maxResults: String(Math.min(limit, 40)),
      printType: "books",
      orderBy: "relevance",
    });

    const res = await fetch(`${API_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Don't retry or throw on rate limit (429) or server errors
      if (res.status === 429) {
        console.warn("[google-books] Rate limited (429), returning empty results");
        return [];
      }
      throw new Error(`Google Books API error: ${res.status}`);
    }

    const data: GoogleSearchResponse = await res.json();

    if (!data.items || data.items.length === 0) {
      // If language-restricted search found nothing, try without restriction
      if (langRestrict !== "en") {
        return searchGoogleBooks(title, author, "en", limit);
      }
      return [];
    }

    return data.items.map(volumeToResult);
  } catch (err) {
    console.error("[google-books] Search error:", err);
    return [];
  }
}

function volumeToResult(volume: GoogleVolume): GoogleBookResult {
  const info = volume.volumeInfo;

  // Get best cover URL (prefer higher resolution)
  let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
  if (coverUrl) {
    // Google returns http URLs, upgrade to https and request larger image
    coverUrl = coverUrl
      .replace("http://", "https://")
      .replace("&edge=curl", "")
      .replace("zoom=1", "zoom=2");
  }

  // Extract ISBN-13 first, fallback to ISBN-10
  let isbn: string | null = null;
  if (info.industryIdentifiers) {
    const isbn13 = info.industryIdentifiers.find((id) => id.type === "ISBN_13");
    const isbn10 = info.industryIdentifiers.find((id) => id.type === "ISBN_10");
    isbn = isbn13?.identifier || isbn10?.identifier || null;
  }

  // Extract year from publishedDate (format: "2020-12-23" or "2020")
  let publishedYear: number | null = null;
  if (info.publishedDate) {
    const yearMatch = info.publishedDate.match(/^(\d{4})/);
    if (yearMatch) publishedYear = parseInt(yearMatch[1], 10);
  }

  return {
    title: info.title || "Ismeretlen",
    author: info.authors?.join(", ") || null,
    description: info.description || null,
    publishedYear,
    coverUrl,
    isbn,
    rating: info.averageRating || null,
    googleUrl: info.infoLink || `https://books.google.com/books?id=${volume.id}`,
    categories: info.categories || [],
    source: "google" as const,
  };
}
