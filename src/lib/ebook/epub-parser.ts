import JSZip from "jszip";

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

/** Private JSZip field holding the sizes read from the central directory. */
interface ZipEntryDeclaredSizes {
  _data?: { compressedSize?: number; uncompressedSize?: number };
}

/**
 * Read the entry count from the ZIP end-of-central-directory record without
 * parsing the archive, so a huge central directory is rejected before JSZip
 * builds an object per entry. Returns null if not found or ZIP64 (0xFFFF).
 */
function readEocdEntryCount(buffer: Buffer): number | null {
  const EOCD_SIGNATURE = 0x06054b50;
  const EOCD_MIN_SIZE = 22;
  const minOffset = Math.max(0, buffer.length - EOCD_MIN_SIZE - 0xffff);
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      const total = buffer.readUInt16LE(i + 10);
      return total === 0xffff ? null : total;
    }
  }
  return null;
}

/**
 * Decompress one ZIP entry, aborting as soon as more than `maxBytes` came out.
 * Resolves to null if the entry is too large or cannot be decompressed.
 */
function readEntryLimited(
  file: JSZip.JSZipObject,
  maxBytes: number
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let stream: NodeJS.ReadableStream;
    try {
      stream = file.nodeStream("nodebuffer");
    } catch {
      finish(null);
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        console.warn(
          `[epub-parser] Entry "${file.name}" exceeds ${maxBytes} bytes when decompressed, skipping`
        );
        stream.pause();
        (stream as { destroy?: () => void }).destroy?.();
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => finish(Buffer.concat(chunks)));
    stream.on("error", () => finish(null));
  });
}

async function readTextEntryLimited(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  const data = await readEntryLimited(file, EPUB_ZIP_LIMITS.maxXmlEntryBytes);
  return data ? data.toString("utf8") : null;
}

/**
 * Parse an EPUB file buffer and extract metadata + cover image.
 * EPUB is a ZIP archive containing XML files.
 */
export async function parseEpub(buffer: Buffer): Promise<EpubMetadata> {
  // Zip bomb protection (1): entry count from the EOCD, before parsing
  const declaredEntries = readEocdEntryCount(buffer);
  if (declaredEntries !== null && declaredEntries > EPUB_ZIP_LIMITS.maxFileCount) {
    console.warn(`[epub-parser] Suspicious file count: ${declaredEntries} exceeds limit`);
    return {};
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {};
  }

  // Zip bomb protection (1): declared sizes from the central directory
  let fileCount = 0;
  let totalUncompressed = 0;
  zip.forEach((_, file) => {
    if (file.dir) return;
    fileCount++;
    totalUncompressed += (file as unknown as ZipEntryDeclaredSizes)._data?.uncompressedSize ?? 0;
  });
  if (fileCount > EPUB_ZIP_LIMITS.maxFileCount) {
    console.warn(`[epub-parser] Suspicious file count: ${fileCount} exceeds limit`);
    return {};
  }
  if (totalUncompressed > EPUB_ZIP_LIMITS.maxTotalUncompressedBytes) {
    console.warn(`[epub-parser] Suspicious: declared uncompressed size ${totalUncompressed} exceeds limit`);
    return {};
  }
  if (
    buffer.length > 0 &&
    totalUncompressed > EPUB_ZIP_LIMITS.ratioCheckMinUncompressedBytes &&
    totalUncompressed / buffer.length > EPUB_ZIP_LIMITS.maxCompressionRatio
  ) {
    console.warn(
      `[epub-parser] Suspicious compression ratio: ${(totalUncompressed / buffer.length).toFixed(0)}:1 exceeds limit`
    );
    return {};
  }
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
    const data = await readEntryLimited(file, EPUB_ZIP_LIMITS.maxCoverImageBytes);
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
