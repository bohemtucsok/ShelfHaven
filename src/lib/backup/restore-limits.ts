import type { ZipArchiveLimits } from "@/lib/zip/limits";

/**
 * Zip bomb limits for backup restore.
 *
 * Calibration (production, 2026-11-25): storage 43 MB in 48 files, largest
 * e-book 7.2 MB; a single upload is capped at 100 MB. The defaults leave a lot
 * of headroom so a much larger library still restores, and every value can be
 * raised with an environment variable instead of failing silently.
 */
export interface RestoreZipLimits extends ZipArchiveLimits {
  /** manifest.json */
  maxManifestBytes: number;
  /** database.json (string + JSON.parse in a 512 MB app container, so it is the tightest one) */
  maxDatabaseJsonBytes: number;
  /** Each stored file under files/ (e-books, originals, covers) */
  maxFileEntryBytes: number;
}

const MB = 1024 * 1024;

export const RESTORE_ZIP_LIMIT_DEFAULTS: RestoreZipLimits = {
  // ~400x today's 48 files
  maxFileCount: 20_000,
  // ~100x today's 43 MB storage; files are restored one by one, so this bounds
  // disk usage and run time rather than memory
  maxTotalUncompressedBytes: 4096 * MB,
  // E-books are already compressed (EPUB/PDF), a real backup is close to 1:1;
  // database.json compresses ~10-20:1, so 100:1 (above 64 MB) only hits bombs
  maxCompressionRatio: 100,
  ratioCheckMinUncompressedBytes: 64 * MB,
  maxManifestBytes: 1 * MB,
  maxDatabaseJsonBytes: 64 * MB,
  // 100 MB upload limit + room for a larger converted EPUB of a 100 MB PDF
  maxFileEntryBytes: 256 * MB,
};

/** Environment variable → limit key; size values are given in MB. */
const ENV_OVERRIDES: { env: string; key: keyof RestoreZipLimits; unit: number }[] = [
  { env: "RESTORE_ZIP_MAX_FILES", key: "maxFileCount", unit: 1 },
  { env: "RESTORE_ZIP_MAX_TOTAL_MB", key: "maxTotalUncompressedBytes", unit: MB },
  { env: "RESTORE_ZIP_MAX_RATIO", key: "maxCompressionRatio", unit: 1 },
  { env: "RESTORE_ZIP_MAX_DATABASE_MB", key: "maxDatabaseJsonBytes", unit: MB },
  { env: "RESTORE_ZIP_MAX_FILE_MB", key: "maxFileEntryBytes", unit: MB },
];

export function getRestoreZipLimits(
  env: Record<string, string | undefined> = process.env
): RestoreZipLimits {
  const limits = { ...RESTORE_ZIP_LIMIT_DEFAULTS };
  for (const { env: name, key, unit } of ENV_OVERRIDES) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      limits[key] = Math.floor(value * unit);
    } else {
      console.warn(`[restore] Ignoring invalid ${name}=${raw}, using default`);
    }
  }
  return limits;
}
