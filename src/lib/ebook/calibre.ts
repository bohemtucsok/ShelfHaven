const CALIBRE_SERVICE_URL =
  process.env.CALIBRE_SERVICE_URL || "http://calibre:8080";

export interface ConversionResult {
  success: boolean;
  data?: Buffer;
  error?: string;
}

/**
 * Sanitize filename to prevent path traversal and command injection.
 * Only allow alphanumeric, dots, hyphens, and underscores.
 */
function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.split(/[/\\]/).pop() || "input";
  // Keep only safe characters
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Prevent hidden files and ensure there's a name
  const cleaned = safe.replace(/^\.+/, "");
  return cleaned || "input";
}

/**
 * Convert an ebook file to EPUB using the Calibre conversion service.
 */
export async function convertToEpub(
  fileBuffer: Buffer,
  filename: string
): Promise<ConversionResult> {
  const safeFilename = sanitizeFilename(filename);
  const formData = new FormData();
  const arrayBuf = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  formData.append("file", new Blob([arrayBuf]), safeFilename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

  try {
    const response = await fetch(`${CALIBRE_SERVICE_URL}/convert`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return {
        success: false,
        error: errorData?.error || `Conversion failed (${response.status})`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { success: true, data: Buffer.from(arrayBuffer) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Konverzió időtúllépés (5 perc)" };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Ismeretlen konverziós hiba",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the Calibre service is healthy.
 */
export async function isCalibreHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${CALIBRE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
