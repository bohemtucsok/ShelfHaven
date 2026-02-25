/**
 * Cover image utilities: download external cover images and resize them.
 * Uses sharp for image processing.
 */

import sharp from "sharp";
import { encode } from "blurhash";

const COVER_MAX_WIDTH = 600;
const COVER_MAX_HEIGHT = 900;
const COVER_QUALITY = 85;

// Check if an IP is in the 172.16.0.0/12 private range (172.16.0.0 - 172.31.255.255)
function isPrivate172(hostname: string): boolean {
  const match = hostname.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

// Block requests to private/internal IP ranges (SSRF protection)
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;

    // Block non-HTTP protocols first
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }

    // Strip IPv6 brackets if present
    const cleanHost = hostname.replace(/^\[|\]$/g, "");

    // Block IPv6 loopback, mapped IPv4, and private ranges
    if (
      cleanHost === "::1" ||
      cleanHost.startsWith("::ffff:127.") ||
      cleanHost.startsWith("::ffff:10.") ||
      cleanHost.startsWith("::ffff:192.168.") ||
      cleanHost.startsWith("::ffff:169.254.") ||
      cleanHost.startsWith("fe80:") ||
      cleanHost.startsWith("fc00:") ||
      cleanHost.startsWith("fd")
    ) {
      return true;
    }

    // Block private IPv4, localhost, link-local, cloud metadata
    if (
      cleanHost === "localhost" ||
      cleanHost === "127.0.0.1" ||
      cleanHost === "0.0.0.0" ||
      cleanHost.startsWith("10.") ||
      isPrivate172(cleanHost) ||
      cleanHost.startsWith("192.168.") ||
      cleanHost.startsWith("169.254.") ||
      cleanHost.endsWith(".local") ||
      cleanHost.endsWith(".internal") ||
      // Block Docker internal hostnames
      cleanHost === "minio" ||
      cleanHost === "db" ||
      cleanHost === "calibre" ||
      cleanHost === "app"
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

const MAX_COVER_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB max cover image

/**
 * Download an image from a URL and return it as a Buffer.
 */
export async function downloadImage(url: string): Promise<Buffer | null> {
  if (isPrivateUrl(url)) return null;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShelfHaven/1.0; cover download)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    // SSRF: validate final URL after redirects
    if (res.url && isPrivateUrl(res.url)) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    // Check Content-Length before downloading
    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_COVER_DOWNLOAD_SIZE) return null;

    const arrayBuffer = await res.arrayBuffer();
    // Double-check actual size (Content-Length can be spoofed)
    if (arrayBuffer.byteLength > MAX_COVER_DOWNLOAD_SIZE) return null;

    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Resize and optimize an image buffer to standard cover dimensions.
 * Returns JPEG buffer.
 */
export async function resizeCover(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(COVER_MAX_WIDTH, COVER_MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: COVER_QUALITY })
    .toBuffer();
}

/**
 * Generate a blurhash string from an image buffer.
 * Uses sharp to resize to a small thumbnail and extract raw pixel data.
 */
export async function generateBlurHash(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4, // componentX
      3  // componentY
    );
  } catch {
    return null;
  }
}

/**
 * Download an image from URL, resize it, and return as JPEG buffer.
 */
export async function downloadAndResizeCover(
  url: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const imageBuffer = await downloadImage(url);
  if (!imageBuffer) return null;

  try {
    const resized = await resizeCover(imageBuffer);
    return { data: resized, contentType: "image/jpeg" };
  } catch {
    // If resize fails, return original
    return { data: imageBuffer, contentType: "image/jpeg" };
  }
}
