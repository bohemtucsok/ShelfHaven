import { describe, it, expect, beforeEach } from "vitest";

interface ReaderSettings {
  fontSize: number;
  isDarkTheme: boolean;
  fontFamily: string;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 100,
  isDarkTheme: false,
  fontFamily: "Georgia, serif",
};

function loadSettings(): ReaderSettings {
  try {
    const saved = localStorage.getItem("reader-settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem("reader-settings", JSON.stringify(settings));
}

describe("Reader Settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should return defaults when nothing is saved", () => {
    const settings = loadSettings();
    expect(settings.fontSize).toBe(100);
    expect(settings.isDarkTheme).toBe(false);
    expect(settings.fontFamily).toBe("Georgia, serif");
  });

  it("should save and load settings", () => {
    const custom: ReaderSettings = {
      fontSize: 120,
      isDarkTheme: true,
      fontFamily: "Courier New, monospace",
    };
    saveSettings(custom);
    const loaded = loadSettings();
    expect(loaded).toEqual(custom);
  });

  it("should handle partial saved settings", () => {
    localStorage.setItem("reader-settings", JSON.stringify({ fontSize: 80 }));
    const loaded = loadSettings();
    expect(loaded.fontSize).toBe(80);
    expect(loaded.isDarkTheme).toBe(false);
    expect(loaded.fontFamily).toBe("Georgia, serif");
  });

  it("should handle invalid JSON gracefully", () => {
    localStorage.setItem("reader-settings", "not json");
    const loaded = loadSettings();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it("should persist dark theme preference", () => {
    saveSettings({ ...DEFAULT_SETTINGS, isDarkTheme: true });
    const loaded = loadSettings();
    expect(loaded.isDarkTheme).toBe(true);
  });
});
