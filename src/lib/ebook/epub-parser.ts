import JSZip from "jszip";
import { checkEocdEntryCount, checkDeclaredSizes, readEntryLimited } from "@/lib/zip/limits";

export interface EpubMetadata {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  coverImage?: {
    data: Buffer;
    contentType: string;
    filename: string;
  };
}

/**
 * Zip bomb protection limits for uploaded EPUB archives.
 *
 * Two layers:
 * 1. Before anything is decompressed, the sizes declared in the ZIP central
 *    directory are checked (entry count, total uncompressed size, ratio).
 * 2. Every entry that is actually decompressed (container.xml, OPF, cover) is
 *    read as a stream with a hard byte limit, because declared sizes can lie.
 */
export const EPUB_ZIP_LIMITS = {
  /** EPUBs rarely have more than a few hundred files */
  maxFileCount: 5000,
  /** Sum of declared uncompressed sizes */
  maxTotalUncompressedBytes: 500 * 1024 * 1024,
  /** Declared total uncompressed size / archive size */
  maxCompressionRatio: 100,
  /** The ratio is only meaningful for archives that expand to something big */
  ratioCheckMinUncompressedBytes: 10 * 1024 * 1024,
  /** META-INF/container.xml and the OPF package document */
  maxXmlEntryBytes: 5 * 1024 * 1024,
  /** Cover image */
  maxCoverImageBytes: 20 * 1024 * 1024,
} as const;

/**
 * Decompress one entry with a hard byte limit; logs and returns null if the
 * entry is too large or cannot be decompressed.
 */
async function readEpubEntryLimited(file: JSZip.JSZipObject, maxBytes: number): Promise<Buffer | null> {
  const result = await readEntryLimited(file, maxBytes);
  if (result.ok) return result.data;
  if (result.reason === "too_large") {
    console.warn(
      `[epub-parser] Entry "${file.name}" exceeds ${maxBytes} bytes when decompressed, skipping`
    );
  }
  return null;
}

async function readTextEntryLimited(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  const data = await readEpubEntryLimited(file, EPUB_ZIP_LIMITS.maxXmlEntryBytes);
  return data ? data.toString("utf8") : null;
}

/**
 * Parse an EPUB file buffer and extract metadata + cover image.
 * EPUB is a ZIP archive containing XML files.
 */
export async function parseEpub(buffer: Buffer): Promise<EpubMetadata> {
  // Zip bomb protection (1): entry count from the EOCD, before parsing
  const eocdViolation = checkEocdEntryCount(buffer, EPUB_ZIP_LIMITS);
  if (eocdViolation?.kind === "file_count") {
    console.warn(`[epub-parser] Suspicious file count: ${eocdViolation.fileCount} exceeds limit`);
    return {};
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {};
  }

  // Zip bomb protection (1): declared sizes from the central directory
  const violation = checkDeclaredSizes(zip, buffer.length, EPUB_ZIP_LIMITS);
  if (violation) {
    if (violation.kind === "file_count") {
      console.warn(`[epub-parser] Suspicious file count: ${violation.fileCount} exceeds limit`);
    } else if (violation.kind === "total_size") {
      console.warn(`[epub-parser] Suspicious: declared uncompressed size ${violation.totalUncompressed} exceeds limit`);
    } else {
      console.warn(`[epub-parser] Suspicious compression ratio: ${violation.ratio.toFixed(0)}:1 exceeds limit`);
    }
    return {};
  }
  const fileCount = zip.filter((_, file) => !file.dir).length;
  // Many tiny entries are suspicious even if the declared sizes are small
  if (buffer.length > 0 && fileCount > 0) {
    const avgFileSize = buffer.length / fileCount;
    // If average compressed file is less than 10 bytes but there are thousands of files, suspicious
    if (avgFileSize < 10 && fileCount > 1000) {
      console.warn(`[epub-parser] Suspicious: ${fileCount} files with avg ${avgFileSize.toFixed(0)} bytes`);
      return {};
    }
  }
  const result: EpubMetadata = {};

  // 1. Find content.opf path from META-INF/container.xml
  // Zip bomb protection (2): entries are decompressed with a hard byte limit
  const containerXml = await readTextEntryLimited(zip, "META-INF/container.xml");
  if (!containerXml) return result;

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) return result;

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  // 2. Parse content.opf for metadata
  const opfXml = await readTextEntryLimited(zip, opfPath);
  if (!opfXml) return result;

  // Extract metadata using regex (no DOM available server-side)
  result.title = extractTag(opfXml, "dc:title");
  result.author = extractTag(opfXml, "dc:creator");
  result.description = extractTag(opfXml, "dc:description");
  result.language = extractTag(opfXml, "dc:language");

  // 3. Find cover image
  const coverImage = await extractCoverImage(zip, opfXml, opfDir);
  if (coverImage) {
    result.coverImage = coverImage;
  }

  return result;
}

/**
 * Extract text content from an XML tag using regex.
 */
function extractTag(xml: string, tagName: string): string | undefined {
  // Handle both <dc:title> and <dc:title id="...">
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return undefined;

  // Clean up HTML entities and whitespace
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "") // Strip any nested HTML tags
    .trim() || undefined;
}

/**
 * Find and extract cover image from EPUB.
 * Tries multiple strategies since EPUBs store covers differently.
 */
async function extractCoverImage(
  zip: JSZip,
  opfXml: string,
  opfDir: string
): Promise<EpubMetadata["coverImage"] | null> {
  // Strategy 1: Look for meta name="cover" content="cover-image-id"
  const coverMetaMatch = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)
    || opfXml.match(/<meta\s+content="([^"]+)"\s+name="cover"/i);

  if (coverMetaMatch) {
    const coverId = coverMetaMatch[1];
    // Find the manifest item with this id
    const itemRegex = new RegExp(
      `<item[^>]+id="${coverId}"[^>]+href="([^"]+)"[^>]*>`,
      "i"
    );
    const itemMatch = opfXml.match(itemRegex);
    if (itemMatch) {
      const result = await loadImage(zip, opfDir + itemMatch[1]);
      if (result) return result;
    }
  }

  // Strategy 2: Look for manifest item with properties="cover-image" (EPUB3)
  const coverPropMatch = opfXml.match(
    /<item[^>]+properties="[^"]*cover-image[^"]*"[^>]+href="([^"]+)"[^>]*>/i
  ) || opfXml.match(
    /<item[^>]+href="([^"]+)"[^>]+properties="[^"]*cover-image[^"]*"[^>]*>/i
  );

  if (coverPropMatch) {
    const result = await loadImage(zip, opfDir + coverPropMatch[1]);
    if (result) return result;
  }

  // Strategy 3: Look for common cover filenames
  const commonPaths = [
    "cover.jpg", "cover.jpeg", "cover.png",
    "images/cover.jpg", "images/cover.jpeg", "images/cover.png",
    "OEBPS/cover.jpg", "OEBPS/images/cover.jpg",
    "OEBPS/cover.png", "OEBPS/images/cover.png",
  ];

  for (const path of commonPaths) {
    const result = await loadImage(zip, path);
    if (result) return result;
  }

  return null;
}

/**
 * Load an image file from the ZIP and return it as a Buffer.
 */
async function loadImage(
  zip: JSZip,
  path: string
): Promise<EpubMetadata["coverImage"] | null> {
  const file = zip.file(path);
  if (!file) return null;

  try {
    const data = await readEpubEntryLimited(file, EPUB_ZIP_LIMITS.maxCoverImageBytes);
    if (!data) return null;
    const ext = path.split(".").pop()?.toLowerCase() || "jpg";
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
    };
    const contentType = contentTypeMap[ext] || "image/jpeg";
    const filename = path.split("/").pop() || `cover.${ext}`;

    return { data, contentType, filename };
  } catch {
    return null;
  }
}
