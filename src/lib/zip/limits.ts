import type JSZip from "jszip";

/**
 * Shared zip bomb protection helpers (JSZip based).
 *
 * Two layers:
 * 1. Before anything is decompressed: the entry count from the
 *    end-of-central-directory record, then the sizes declared in the central
 *    directory (total uncompressed size, compression ratio).
 * 2. While decompressing: every entry is read as a stream with a hard byte
 *    limit, because declared sizes can lie (JSZip only notices a size mismatch
 *    after decompressing the whole entry).
 */

export interface ZipArchiveLimits {
  maxFileCount: number;
  /** Sum of declared uncompressed sizes */
  maxTotalUncompressedBytes: number;
  /** Declared total uncompressed size / archive size */
  maxCompressionRatio: number;
  /** The ratio is only meaningful for archives that expand to something big */
  ratioCheckMinUncompressedBytes: number;
}

export type ZipLimitViolation =
  | { kind: "file_count"; fileCount: number }
  | { kind: "total_size"; totalUncompressed: number }
  | { kind: "ratio"; ratio: number };

/** Private JSZip field holding the sizes read from the central directory. */
interface ZipEntryDeclaredSizes {
  _data?: { compressedSize?: number; uncompressedSize?: number };
}

/**
 * Read the entry count from the ZIP end-of-central-directory record without
 * parsing the archive, so a huge central directory is rejected before JSZip
 * builds an object per entry. Returns null if not found or ZIP64 (0xFFFF).
 */
export function readEocdEntryCount(buffer: Uint8Array): number | null {
  const EOCD_SIGNATURE = 0x06054b50;
  const EOCD_MIN_SIZE = 22;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const minOffset = Math.max(0, buffer.length - EOCD_MIN_SIZE - 0xffff);
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      const total = view.getUint16(i + 10, true);
      return total === 0xffff ? null : total;
    }
  }
  return null;
}

/** Entry-count check on the raw archive, before JSZip.loadAsync(). */
export function checkEocdEntryCount(
  buffer: Uint8Array,
  limits: Pick<ZipArchiveLimits, "maxFileCount">
): ZipLimitViolation | null {
  const declared = readEocdEntryCount(buffer);
  if (declared !== null && declared > limits.maxFileCount) {
    return { kind: "file_count", fileCount: declared };
  }
  return null;
}

/** Uncompressed size declared in the central directory (0 if unknown). */
export function declaredUncompressedSize(file: JSZip.JSZipObject): number {
  return (file as unknown as ZipEntryDeclaredSizes)._data?.uncompressedSize ?? 0;
}

/** Count files and declared sizes of a loaded archive. */
export function summarizeDeclaredSizes(zip: JSZip): { fileCount: number; totalUncompressed: number } {
  let fileCount = 0;
  let totalUncompressed = 0;
  zip.forEach((_, file) => {
    if (file.dir) return;
    fileCount++;
    totalUncompressed += declaredUncompressedSize(file);
  });
  return { fileCount, totalUncompressed };
}

/** Declared-size checks on a loaded archive (nothing is decompressed). */
export function checkDeclaredSizes(
  zip: JSZip,
  archiveBytes: number,
  limits: ZipArchiveLimits
): ZipLimitViolation | null {
  const { fileCount, totalUncompressed } = summarizeDeclaredSizes(zip);
  if (fileCount > limits.maxFileCount) {
    return { kind: "file_count", fileCount };
  }
  if (totalUncompressed > limits.maxTotalUncompressedBytes) {
    return { kind: "total_size", totalUncompressed };
  }
  if (
    archiveBytes > 0 &&
    totalUncompressed > limits.ratioCheckMinUncompressedBytes &&
    totalUncompressed / archiveBytes > limits.maxCompressionRatio
  ) {
    return { kind: "ratio", ratio: totalUncompressed / archiveBytes };
  }
  return null;
}

export type LimitedReadResult =
  | { ok: true; data: Buffer }
  | { ok: false; reason: "too_large" | "error" };

/**
 * Decompress one ZIP entry, aborting as soon as more than `maxBytes` came out.
 * Never throws.
 */
export function readEntryLimited(
  file: JSZip.JSZipObject,
  maxBytes: number
): Promise<LimitedReadResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: LimitedReadResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let stream: NodeJS.ReadableStream;
    try {
      stream = file.nodeStream("nodebuffer");
    } catch {
      finish({ ok: false, reason: "error" });
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        stream.pause();
        (stream as { destroy?: () => void }).destroy?.();
        finish({ ok: false, reason: "too_large" });
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => finish({ ok: true, data: Buffer.concat(chunks) }));
    stream.on("error", () => finish({ ok: false, reason: "error" }));
  });
}
