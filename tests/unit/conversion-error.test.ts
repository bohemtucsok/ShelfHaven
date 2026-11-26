import { describe, it, expect } from "vitest";
import {
  classifyLegacyText,
  classifyServiceStatus,
  conversionFailureNotificationText,
  CONVERSION_ERROR_CODES,
  publicConversionError,
  storedConversionError,
  summarizeConversionDetail,
} from "@/lib/ebook/conversion-error";
import hu from "../../messages/hu.json";
import en from "../../messages/en.json";

const TRACEBACK = `Traceback (most recent call last):
  File "/opt/tool/bin/convert", line 3, in <module>
    run()
IndexError: list index out of range
`;

describe("conversion-error", () => {
  it("summarizes to the last line", () => {
    expect(summarizeConversionDetail(TRACEBACK)).toBe("IndexError: list index out of range");
  });

  it("removes paths and truncates long lines", () => {
    const out = summarizeConversionDetail(`OSError: cannot open /srv/data/x/in.pdf or C:\\tmp\\a\\b.pdf ${"y".repeat(400)}`);
    expect(out).not.toMatch(/\/srv|C:\\tmp/);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it("stores code plus summary and reads back only the code", () => {
    const stored = storedConversionError("unsupported_content", TRACEBACK);
    expect(stored).toBe("unsupported_content: IndexError: list index out of range");
    expect(publicConversionError(stored)).toBe("unsupported_content");
    expect(storedConversionError("busy", undefined)).toBe("busy");
  });

  it("classifies legacy free-text values", () => {
    expect(publicConversionError(null)).toBeNull();
    expect(publicConversionError(TRACEBACK)).toBe("unsupported_content");
    expect(publicConversionError("Konverzió időtúllépés (5 perc)")).toBe("timeout");
    expect(classifyLegacyText("Ismeretlen hiba")).toBe("unknown");
  });

  it("maps service statuses", () => {
    expect(classifyServiceStatus(413)).toBe("too_large");
    expect(classifyServiceStatus(503)).toBe("busy");
    expect(classifyServiceStatus(500, "Conversion timed out (5 min limit)")).toBe("timeout");
    expect(classifyServiceStatus(500, "boom")).toBe("unsupported_content");
    expect(classifyServiceStatus(418)).toBe("unknown");
  });

  it("has a notification text and hu/en translations for every code", () => {
    for (const code of CONVERSION_ERROR_CODES) {
      expect(conversionFailureNotificationText(code)).toBeTruthy();
      expect((hu.bookDetail.conversionError as Record<string, string>)[code]).toBeTruthy();
      expect((en.bookDetail.conversionError as Record<string, string>)[code]).toBeTruthy();
    }
  });
});
