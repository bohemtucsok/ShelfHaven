/**
 * Hardcover API client for book metadata search.
 * Uses GraphQL endpoint at api.hardcover.app.
 * API key is stored in the Setting table (hardcover_api_key).
 */

import { prisma } from "@/lib/prisma";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

export interface HardcoverBookResult {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  rating: number | null;
  categories: string[];
  source: "hardcover";
}

async function getApiKey(): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "hardcover_api_key" },
    });
    return setting?.value || null;
  } catch {
    return null;
  }
}

async function graphqlQuery(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(HARDCOVER_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Hardcover API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

/**
 * Search books on Hardcover by title and optionally author.
 */
export async function searchHardcover(
  title: string,
  author?: string,
  limit = 5
): Promise<HardcoverBookResult[]> {
  const apiKey = await getApiKey();
  if (!apiKey) return [];

  try {
    const searchQuery = author ? `${title} ${author}` : title;

    // Use the search endpoint
    const data = (await graphqlQuery(apiKey, SEARCH_QUERY, {
      query: searchQuery,
      limit,
    })) as { search?: { results?: string } };

    if (!data?.search?.results) return [];

    // Parse Typesense results blob
    const results = JSON.parse(data.search.results);
    const hits = results?.hits || [];

    if (hits.length === 0) return [];

    // Extract book IDs from search hits
    const bookIds = hits
      .slice(0, limit)
      .map((hit: { document?: { id?: number } }) => hit.document?.id)
      .filter(Boolean) as number[];

    if (bookIds.length === 0) return [];

    // Fetch detailed info for found books
    const detailData = (await graphqlQuery(apiKey, BOOKS_DETAIL_QUERY, {
      bookIds,
    })) as {
      books?: Array<{
        id: number;
        title: string;
        description: string | null;
        release_year: number | null;
        cached_image: unknown;
        image?: { url?: string } | null;
        contributions?: Array<{ author?: { name?: string } }>;
        editions?: Array<{
          isbn_13?: string | null;
          isbn_10?: string | null;
          images?: Array<{ url?: string }>;
        }>;
        taggings?: Array<{ tag?: { tag?: string } }>;
      }>;
    };

    if (!detailData?.books) return [];

    return detailData.books.map((book) => {
      // Extract author from contributions
      const authorName =
        book.contributions?.[0]?.author?.name || null;

      // Extract cover URL (try image relation first, then editions)
      let coverUrl: string | null = null;
      if (book.image?.url) {
        coverUrl = book.image.url;
      } else if (book.editions?.[0]?.images?.[0]?.url) {
        coverUrl = book.editions[0].images[0].url;
      }

      // Extract ISBN from first edition
      const isbn =
        book.editions?.[0]?.isbn_13 ||
        book.editions?.[0]?.isbn_10 ||
        null;

      // Extract genre/tag names
      const categories = (book.taggings || [])
        .map((t) => t.tag?.tag)
        .filter(Boolean) as string[];

      return {
        id: book.id,
        title: book.title,
        author: authorName,
        description: book.description || null,
        publishedYear: book.release_year || null,
        coverUrl,
        isbn,
        rating: null,
        categories,
        source: "hardcover" as const,
      };
    });
  } catch (err) {
    console.error("[hardcover] Search error:", err);
    return [];
  }
}

const SEARCH_QUERY = `
  query SearchBooks($query: String!, $limit: Int!) {
    search(
      query: $query,
      query_type: "books",
      per_page: $limit,
      page: 1
    ) {
      results
    }
  }
`;

const BOOKS_DETAIL_QUERY = `
  query BookDetails($bookIds: [Int!]!) {
    books(where: { id: { _in: $bookIds } }) {
      id
      title
      description
      release_year
      image { url }
      contributions(limit: 3) {
        author { name }
      }
      editions(limit: 3, order_by: { users_count: desc }) {
        isbn_13
        isbn_10
        images(limit: 1) { url }
      }
      taggings(limit: 10) {
        tag { tag }
      }
    }
  }
`;
