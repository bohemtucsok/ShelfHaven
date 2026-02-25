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

// Zip bomb protection limits
const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024; // 500MB total uncompressed
const MAX_COMPRESSION_RATIO = 100; // Max 100:1 ratio

/**
 * Parse an EPUB file buffer and extract metadata + cover image.
 * EPUB is a ZIP archive containing XML files.
 */
export async function parseEpub(buffer: Buffer): Promise<EpubMetadata> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {};
  }

  // Zip bomb protection: count files and estimate total size
  let fileCount = 0;
  const MAX_FILE_COUNT = 5000; // EPUBs rarely have more than a few hundred files
  zip.forEach((_, file) => {
    if (!file.dir) fileCount++;
  });
  if (fileCount > MAX_FILE_COUNT) {
    console.warn(`[epub-parser] Suspicious file count: ${fileCount} exceeds limit`);
    return {};
  }
  // Check compressed-to-input ratio: a 1MB EPUB shouldn't contain 100MB+ of data
  // We limit metadata extraction to only read small text files (OPF/XML),
  // and the cover image is bounded by loadImage's buffer handling
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
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) return result;

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) return result;

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  // 2. Parse content.opf for metadata
  const opfXml = await zip.file(opfPath)?.async("text");
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
    const data = Buffer.from(await file.async("uint8array"));
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
