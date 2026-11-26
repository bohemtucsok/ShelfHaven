/**
 * Conversion failure classification.
 *
 * The Calibre service can answer with a full Python traceback. That text is
 * useful in the server log, but it must never reach the user (toast,
 * notification, API response, rendered page): it is unreadable and exposes
 * internal paths. Everything user-facing goes through a short error code.
 */

export const CONVERSION_ERROR_CODES = [
  "unsupported_content",
  "timeout",
  "too_large",
  "busy",
  "unknown",
] as const;

export type ConversionErrorCode = (typeof CONVERSION_ERROR_CODES)[number];

export function isConversionErrorCode(value: unknown): value is ConversionErrorCode {
  return typeof value === "string" && (CONVERSION_ERROR_CODES as readonly string[]).includes(value);
}

/** Map a Calibre service HTTP status (plus its error text) to an error code. */
export function classifyServiceStatus(status: number, text?: string): ConversionErrorCode {
  if (status === 413) return "too_large";
  if (status === 503 || status === 429) return "busy";
  if (status === 504 || (text && /timed out|time-?out|időtúllépés/i.test(text))) return "timeout";
  if (status === 400 || status === 415 || status === 422 || status === 500) return "unsupported_content";
  return "unknown";
}

/**
 * Classify a free-text error. Used for values stored before error codes
 * existed, so old rows never leak their raw text either.
 */
export function classifyLegacyText(text: string): ConversionErrorCode {
  if (/timed out|time-?out|időtúllépés/i.test(text)) return "timeout";
  if (/too large|túl nagy/i.test(text)) return "too_large";
  if (/busy|foglalt/i.test(text)) return "busy";
  if (/traceback|conversion failed|output file not created|error/i.test(text)) return "unsupported_content";
  return "unknown";
}

const MAX_SUMMARY = 160;

/**
 * One-line, path-free summary of a raw error (the last non-empty line,
 * e.g. "IndexError: list index out of range"). Safe to store; still not
 * meant for display.
 */
export function summarizeConversionDetail(raw: string | undefined | null): string {
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  const stripped = last
    // POSIX and Windows style paths
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@+~-]+){2,}[\\/]?/g, "<path>")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > MAX_SUMMARY ? `${stripped.slice(0, MAX_SUMMARY - 1)}…` : stripped;
}

/** Value written to Book.conversionError: "<code>" or "<code>: <summary>". */
export function storedConversionError(code: ConversionErrorCode, raw?: string | null): string {
  const summary = summarizeConversionDetail(raw);
  return summary ? `${code}: ${summary}` : code;
}

/** Turn whatever is stored in Book.conversionError into a public error code. */
export function publicConversionError(stored: string | null | undefined): ConversionErrorCode | null {
  if (!stored) return null;
  const prefix = stored.split(":", 1)[0].trim();
  if (isConversionErrorCode(prefix)) return prefix;
  return classifyLegacyText(stored);
}

/** Short Hungarian text for server-side notifications (the bell). */
const NOTIFICATION_TEXT_HU: Record<ConversionErrorCode, string> = {
  unsupported_content: "a fájl nem alakítható EPUB-bá, az eredeti továbbra is letölthető",
  timeout: "a konverzió túl sokáig tartott",
  too_large: "a fájl túl nagy a konverzióhoz",
  busy: "a konvertáló szolgáltatás most foglalt, próbáld újra később",
  unknown: "ismeretlen hiba történt",
};

export function conversionFailureNotificationText(code: ConversionErrorCode): string {
  return NOTIFICATION_TEXT_HU[code];
}
