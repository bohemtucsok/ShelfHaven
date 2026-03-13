"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";

// epub.js doesn't have @types, use dynamic import
type EpubBook = any;
type EpubRendition = any;

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface EpubReaderProps {
  bookId: string;
  url: string;
  initialCfi?: string | null;
  onProgressChange?: (percentage: number, cfi: string) => void;
  onDarkModeChange?: (isDark: boolean) => void;
}

/**
 * Patch the epub.js manager to use CSS transform for pagination instead of
 * scrollLeft. The default manager sets overflow:hidden on the epub-container
 * and scrolls it via scrollLeft, but in many modern Chromium builds (and
 * especially inside flex containers) the visual repaint never happens even
 * though the scrollLeft value updates.  By switching to translateX on the
 * inner view wrapper we get a reliable, GPU-accelerated visual page change.
 */
function patchManagerScrolling(rendition: any) {
  const manager = rendition?.manager;
  if (!manager || !manager.container) return;

  const container = manager.container as HTMLElement;

  // The epub-view div (first child of epub-container) wraps the iframe.
  // We will translate it instead of scrolling the container.
  const getViewElement = (): HTMLElement | null => {
    return container.querySelector(".epub-view") as HTMLElement | null;
  };

  // Capture the current scrollLeft from the initial display() call that
  // happened BEFORE this patch was applied, then switch to transforms.
  let currentX = container.scrollLeft || 0;

  // Apply the transform immediately for the initial position
  const initialViewEl = getViewElement();
  if (initialViewEl && currentX > 0) {
    initialViewEl.style.transform = `translateX(${-currentX}px)`;
  }

  // Reset the real scrollLeft now that we've captured it
  container.scrollLeft = 0;

  // Ensure the container clips overflow and never scrolls natively.
  // Using "clip" instead of "hidden" guarantees that programmatic scrollLeft
  // is always 0 and we are in full control via transforms.
  container.style.overflow = "clip";

  // Override scrollTo -- epub.js calls this with (x, y, silent)
  manager.scrollTo = function (x: number, y: number, silent?: boolean) {
    if (silent) {
      this.ignore = true;
    }
    currentX = x;
    const viewEl = getViewElement();
    if (viewEl) {
      viewEl.style.transform = `translateX(${-x}px)`;
    }
    // Keep container.scrollLeft at 0; some internal calculations read it.
    this.container.scrollLeft = 0;
    this.container.scrollTop = y;
    this.scrolled = true;

    // If ignore was set, clear it on next microtask (mirrors original behavior)
    if (this.ignore) {
      Promise.resolve().then(() => { this.ignore = false; });
    }
  };

  // Override scrollBy -- epub.js calls this with (dx, dy, silent)
  manager.scrollBy = function (x: number, y: number, silent?: boolean) {
    const dir = this.settings.direction === "rtl" ? -1 : 1;
    if (silent) {
      this.ignore = true;
    }
    if (x) {
      currentX += x * dir;
    }
    const viewEl = getViewElement();
    if (viewEl) {
      viewEl.style.transform = `translateX(${-currentX}px)`;
    }
    this.container.scrollLeft = 0;
    if (y) this.container.scrollTop += y;
    this.scrolled = true;

    if (this.ignore) {
      Promise.resolve().then(() => { this.ignore = false; });
    }
  };

  // Store the tracked offset on the manager for external access if needed
  Object.defineProperty(manager, '_currentScrollX', {
    get() { return currentX; },
    set(v: number) { currentX = v; },
    configurable: true
  });

  // Patch next() to use our tracked offset instead of container.scrollLeft
  manager.next = function () {
    if (!this.views.length) return;

    if (this.isPaginated && this.settings.axis === "horizontal" &&
        (!this.settings.direction || this.settings.direction === "ltr")) {

      this.scrollLeft = currentX;
      const epubViewEl = getViewElement();
      const contentWidth = epubViewEl ? epubViewEl.scrollWidth : 0;
      const left = currentX + this.container.offsetWidth + this.layout.delta;

      if (left <= contentWidth) {
        this.scrollBy(this.layout.delta, 0, true);
      } else {
        const next = this.views.last().section.next();
        if (next) {
          return this._handleSectionChange(next, "next");
        }
      }
    } else if (this.isPaginated && this.settings.axis === "vertical") {
      // Vertical pagination: use scrollTop (not affected by our patch)
      this.scrollTop = this.container.scrollTop;
      const top = this.container.scrollTop + this.container.offsetHeight;
      if (top < this.container.scrollHeight) {
        this.scrollBy(0, this.layout.height, true);
      } else {
        const next = this.views.last().section.next();
        if (next) return this._handleSectionChange(next, "next");
      }
    } else {
      // Non-paginated: move to next section
      const next = this.views.last().section.next();
      if (next) return this._handleSectionChange(next, "next");
    }
  };

  manager.prev = function () {
    if (!this.views.length) return;

    if (this.isPaginated && this.settings.axis === "horizontal" &&
        (!this.settings.direction || this.settings.direction === "ltr")) {

      this.scrollLeft = currentX;

      if (currentX > 0) {
        this.scrollBy(-this.layout.delta, 0, true);
      } else {
        const prev = this.views.first().section.prev();
        if (prev) {
          return this._handleSectionChange(prev, "prev");
        }
      }
    } else if (this.isPaginated && this.settings.axis === "vertical") {
      this.scrollTop = this.container.scrollTop;
      const top = this.container.scrollTop;
      if (top > 0) {
        this.scrollBy(0, -(this.layout.height), true);
      } else {
        const prev = this.views.first().section.prev();
        if (prev) return this._handleSectionChange(prev, "prev");
      }
    } else {
      const prev = this.views.first().section.prev();
      if (prev) return this._handleSectionChange(prev, "prev");
    }
  };

  // Helper for section changes (shared by next/prev overrides)
  manager._handleSectionChange = function (section: any, direction: string) {
    this.clear();
    this.updateLayout();

    let forceRight = false;
    if (this.layout.name === "pre-paginated" && this.layout.divisor === 2) {
      if (direction === "next" && section.properties.includes("page-spread-right")) {
        forceRight = true;
      }
      if (direction === "prev" && typeof section.prev() !== "object") {
        forceRight = true;
      }
    }

    const addFn = direction === "next" ? this.append : this.prepend;

    return addFn.call(this, section, forceRight)
      .then(() => {
        return this.handleNextPrePaginated(forceRight, section, addFn);
      }, (err: any) => err)
      .then(() => {
        if (direction === "prev" && this.isPaginated && this.settings.axis === "horizontal") {
          // Scroll to last page of the new section
          const viewEl = getViewElement();
          if (viewEl) {
            const totalWidth = viewEl.scrollWidth;
            this.scrollTo(totalWidth - this.layout.delta, 0, true);
          }
        }
        this.views.show();
      });
  };

  // Also patch the clear method to reset our tracked offset
  manager.clear = function () {
    if (this.views) {
      this.views.hide();
      this.scrollTo(0, 0, true);
      this.views.clear();
    }
  };

  // Patch paginatedLocation to use currentX instead of container properties
  manager.paginatedLocation = function () {
    // The original reads from this.container.getBoundingClientRect() and
    // calculates page offsets. Since we use transform, the container rect
    // is always at the same position. We need to account for currentX.
    const visible = this.visible();
    const container = this.container.getBoundingClientRect();

    let left = 0;
    let used = 0;

    if (this.settings.fullsize) {
      left = window.scrollX;
    }

    const sections = visible.map((view: any) => {
      const { index, href } = view.section;
      let offset: number;
      const position = view.position();
      const width = view.width();

      let start: number;
      let end: number;
      let pageWidth: number;

      if (this.settings.direction === "rtl") {
        offset = container.right - left;
        pageWidth = Math.min(Math.abs(offset - position.left), this.layout.width) - used;
        end = position.width - (position.right - offset) - used;
        start = end - pageWidth;
      } else {
        // Account for our CSS transform offset
        offset = container.left + left + currentX;
        pageWidth = Math.min(position.right - offset, this.layout.width) - used;
        start = offset - position.left + used;
        end = start + pageWidth;
      }

      used += pageWidth;

      const mapping = this.mapping.page(view.contents, view.section.cfiBase, start, end);

      const totalPages = this.layout.count(width).pages;
      let startPage = Math.floor(start / this.layout.pageWidth);
      const pages: number[] = [];
      let endPage = Math.floor(end / this.layout.pageWidth);

      if (startPage < 0) {
        startPage = 0;
        endPage = endPage + 1;
      }

      if (this.settings.direction === "rtl") {
        const tempStartPage = startPage;
        startPage = totalPages - endPage;
        endPage = totalPages - tempStartPage;
      }

      for (let i = startPage + 1; i <= endPage; i++) {
        pages.push(i);
      }

      return { index, href, pages, totalPages, mapping };
    });

    return sections;
  };

  // Patch isVisible to account for transform-based positioning
  manager.isVisible = function (view: any, offsetPrev: number, offsetNext: number, _container?: any) {
    const position = view.position();
    const containerBounds = _container || this.bounds();

    if (this.settings.axis === "horizontal" &&
        position.right > containerBounds.left - offsetPrev &&
        position.left < containerBounds.right + offsetNext) {
      return true;
    } else if (this.settings.axis === "vertical" &&
        position.bottom > containerBounds.top - offsetPrev &&
        position.top < containerBounds.bottom + offsetNext) {
      return true;
    }
    return false;
  };

  // Patch moveTo to use our transform-based scrolling
  manager.moveTo = function (offset: any, width?: number) {
    let distX = 0;
    let distY = 0;

    if (!this.isPaginated) {
      distY = offset.top;
    } else {
      distX = Math.floor(offset.left / this.layout.delta) * this.layout.delta;
      const viewEl = getViewElement();
      const contentWidth = viewEl ? viewEl.scrollWidth : 0;

      if (distX + this.layout.delta > contentWidth) {
        distX = contentWidth - this.layout.delta;
      }

      distY = Math.floor(offset.top / this.layout.delta) * this.layout.delta;
      if (distY + this.layout.delta > this.container.scrollHeight) {
        distY = this.container.scrollHeight - this.layout.delta;
      }
    }
    if (this.settings.direction === "rtl") {
      distX = distX + this.layout.delta;
      distX = distX - (width || 0);
    }
    this.scrollTo(distX, distY, true);
  };
}

export default function EpubReader({ bookId, url, initialCfi, onProgressChange, onDarkModeChange }: EpubReaderProps) {
  const t = useTranslations("reader");
  const tc = useTranslations("common");
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook>(null);
  const renditionRef = useRef<EpubRendition>(null);
  const locationsReadyRef = useRef(false);
  const initIdRef = useRef(0); // Guard against stale async initReader calls
  const fontFamilyRef = useRef("Georgia, serif"); // Latest font family for content hooks
  const isDarkThemeRef = useRef(false); // Latest dark theme state for content hooks
  const [isLoading, setIsLoading] = useState(true);
  const [percentage, setPercentage] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; cfi: string; label: string | null; percentage: number; createdAt: string }>>([]);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [fontFamily, setFontFamily] = useState("Georgia, serif");
  const [sidebarTab, setSidebarTab] = useState<"toc" | "bookmarks" | "highlights">("toc");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [highlights, setHighlights] = useState<Array<{ id: string; cfiRange: string; text: string; color: string; note: string | null; createdAt: string }>>([]);
  const [showHighlightPopup, setShowHighlightPopup] = useState(false);
  const [selectedCfiRange, setSelectedCfiRange] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ cfi: string; excerpt: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingStartRef = useRef<number>(Date.now());

  // Keep refs in sync with state
  useEffect(() => {
    fontFamilyRef.current = fontFamily;
  }, [fontFamily]);
  useEffect(() => {
    isDarkThemeRef.current = isDarkTheme;
  }, [isDarkTheme]);

  /**
   * Inject or update a <style> tag inside an epub.js iframe document to force
   * font-family.  Uses a high-specificity selector with !important to override
   * the EPUB's own stylesheet rules.
   */
  const injectFontFamilyStyle = useCallback((doc: Document, family: string) => {
    const STYLE_ID = "shelfhaven-font-override";
    let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = STYLE_ID;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent =
      `html body, html body *, html body p, html body span, html body div, html body h1, html body h2, html body h3, html body h4, html body h5, html body h6, html body a, html body li, html body td, html body blockquote { font-family: ${family} !important; }`;
  }, []);

  /**
   * Inject or update a <style> tag inside an epub.js iframe document to force
   * dark/light theme colors on ALL elements, overriding the EPUB's own styles.
   */
  const injectThemeStyle = useCallback((doc: Document, isDark: boolean) => {
    const STYLE_ID = "shelfhaven-theme-override";
    let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = STYLE_ID;
      doc.head.appendChild(styleEl);
    }
    if (isDark) {
      styleEl.textContent = `
        html body, html body *, html body p, html body span, html body div,
        html body h1, html body h2, html body h3, html body h4, html body h5, html body h6,
        html body a, html body li, html body td, html body th, html body blockquote,
        html body section, html body article, html body header, html body footer,
        html body figcaption, html body cite, html body em, html body strong {
          color: #e0d5c1 !important;
          background-color: transparent !important;
        }
        html body { background-color: #1a1410 !important; }
        html body a { color: #d4a574 !important; }
        html body img { opacity: 0.9; }
      `;
    } else {
      styleEl.textContent = `
        html body, html body *, html body p, html body span, html body div,
        html body h1, html body h2, html body h3, html body h4, html body h5, html body h6,
        html body a, html body li, html body td, html body th, html body blockquote,
        html body section, html body article, html body header, html body footer,
        html body figcaption, html body cite, html body em, html body strong {
          color: #2d1b0e !important;
          background-color: transparent !important;
        }
        html body { background-color: #fefbf6 !important; }
        html body a { color: #92400e !important; }
      `;
    }
  }, []);

  /**
   * Apply current theme to all currently rendered epub.js iframes.
   */
  const applyThemeToAllIframes = useCallback((isDark: boolean) => {
    if (!viewerRef.current) return;
    const iframes = viewerRef.current.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          injectThemeStyle(doc, isDark);
        }
      } catch {
        // cross-origin iframe - skip
      }
    });
  }, [injectThemeStyle]);

  /**
   * Apply current font family to all currently rendered epub.js iframes.
   */
  const applyFontFamilyToAllIframes = useCallback((family: string) => {
    if (!viewerRef.current) return;
    const iframes = viewerRef.current.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          injectFontFamilyStyle(doc, family);
        }
      } catch {
        // cross-origin iframe - skip
      }
    });
  }, [injectFontFamilyStyle]);

  /**
   * Inject highlight annotation styles into an epub.js iframe document.
   */
  const injectHighlightStyles = useCallback((doc: Document) => {
    const STYLE_ID = "shelfhaven-highlight-styles";
    let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = STYLE_ID;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .hl-yellow { background-color: rgba(250, 204, 21, 0.3) !important; }
      .hl-green { background-color: rgba(34, 197, 94, 0.3) !important; }
      .hl-blue { background-color: rgba(59, 130, 246, 0.3) !important; }
      .hl-pink { background-color: rgba(236, 72, 153, 0.3) !important; }
    `;
  }, []);

  const saveProgress = useCallback(
    async (pct: number, cfi: string, readingMinutes?: number) => {
      onProgressChange?.(pct, cfi);
      try {
        await fetch(`/api/reading-progress/${bookId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ percentage: pct, cfi, readingMinutes }),
        });
      } catch {
        // Silently fail
      }
    },
    [bookId, onProgressChange]
  );

  // Load reader settings: API first, localStorage fallback
  useEffect(() => {
    async function loadSettings() {
      // Try loading from server first
      try {
        const res = await fetch("/api/user/reader-settings");
        if (res.ok) {
          const settings = await res.json();
          if (settings.fontSize) setFontSize(settings.fontSize);
          if (settings.isDarkTheme !== undefined) setIsDarkTheme(settings.isDarkTheme);
          if (settings.fontFamily) setFontFamily(settings.fontFamily);
          try { localStorage.setItem("reader-settings", JSON.stringify(settings)); } catch {}
          setSettingsLoaded(true);
          return;
        }
      } catch {}

      // Fallback to localStorage
      try {
        const saved = localStorage.getItem("reader-settings");
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.fontSize) setFontSize(settings.fontSize);
          if (settings.isDarkTheme !== undefined) setIsDarkTheme(settings.isDarkTheme);
          if (settings.fontFamily) setFontFamily(settings.fontFamily);
        }
      } catch {}
      setSettingsLoaded(true);
    }
    loadSettings();
  }, []);

  // Save settings to localStorage + debounced API save
  useEffect(() => {
    if (!settingsLoaded) return;
    const data = { fontSize, isDarkTheme, fontFamily };
    try { localStorage.setItem("reader-settings", JSON.stringify(data)); } catch {}

    // Debounced server save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/user/reader-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    }, 1000);
  }, [fontSize, isDarkTheme, fontFamily, settingsLoaded]);

  // Notify parent about dark mode changes
  useEffect(() => {
    onDarkModeChange?.(isDarkTheme);
  }, [isDarkTheme, onDarkModeChange]);

  useEffect(() => {
    // Increment init ID so any in-flight async initReader from a previous
    // mount (React StrictMode) will bail out.
    const thisInitId = ++initIdRef.current;
    let saveInterval: ReturnType<typeof setInterval>;

    async function initReader() {
      if (!viewerRef.current) return;

      // Wait for the container to have dimensions (absolute positioned)
      const container = viewerRef.current;
      let attempts = 0;
      while (container.clientWidth === 0 || container.clientHeight === 0) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
        if (attempts > 40 || thisInitId !== initIdRef.current) return;
      }

      // Bail out if a newer initReader was started (StrictMode re-mount)
      if (thisInitId !== initIdRef.current) return;

      // Clean up any leftover DOM from React StrictMode double-mount
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      const width = container.clientWidth;
      const height = container.clientHeight;

      const ePub = (await import("epubjs")).default;

      // Check again after async import
      if (thisInitId !== initIdRef.current) return;

      // For API proxy URLs (not ending in .epub), fetch as ArrayBuffer
      // and use book.open(data, "binary") per epub.js official API.
      // This prevents epub.js from treating it as an unpacked directory.
      let book: EpubBook;
      if (url.startsWith("blob:") || url.endsWith(".epub")) {
        book = ePub(url);
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch book");
        const arrayBuffer = await res.arrayBuffer();
        if (thisInitId !== initIdRef.current) return;
        book = ePub();
        await book.open(arrayBuffer, "binary");
      }
      bookRef.current = book;

      const rendition = book.renderTo(container, {
        width,
        height,
        spread: "none",
        flow: "paginated",
        allowScriptedContent: true,
      });

      renditionRef.current = rendition;

      // Load TOC
      const navigation = await book.loaded.navigation;
      if (thisInitId !== initIdRef.current) return;
      setToc(navigation.toc || []);

      // Apply initial theme (font-family is handled via iframe style injection below)
      rendition.themes.default({
        body: { "font-family": `${fontFamilyRef.current} !important` },
      });

      // Hook into rendition content rendering to inject font-family style
      // into each newly rendered iframe. This is more reliable than
      // themes.override() for font-family because EPUB stylesheets often
      // set font-family on individual elements, not just body.
      rendition.hooks.content.register((contents: any) => {
        try {
          const doc = contents.document;
          if (doc) {
            injectFontFamilyStyle(doc, fontFamilyRef.current);
            injectThemeStyle(doc, isDarkThemeRef.current);
            injectHighlightStyles(doc);
          }
        } catch {
          // ignore
        }
      });

      // Track page changes (guard against locations not ready)
      rendition.on("relocated", (location: any) => {
        if (thisInitId !== initIdRef.current || !locationsReadyRef.current) return;
        try {
          const pct = book.locations.percentageFromCfi(location.start.cfi) * 100;
          setPercentage(pct);
        } catch {
          // locations not ready yet
        }
      });

      // Display from saved position or start
      if (initialCfi) {
        await rendition.display(initialCfi);
      } else {
        await rendition.display();
      }

      if (thisInitId !== initIdRef.current) return;

      // CRITICAL FIX: Patch the epub.js manager to use CSS transforms for
      // pagination instead of scrollLeft.  In modern Chromium, scrollLeft on
      // an overflow:hidden flex container with display:flex does not produce
      // a visual repaint even though the property value changes.  Using
      // translateX on the epub-view is GPU-accelerated and reliable.
      patchManagerScrolling(rendition);

      // Listen for text selection to offer highlight creation
      rendition.on("selected", (cfiRange: string, contents: any) => {
        if (thisInitId !== initIdRef.current) return;
        try {
          const selection = contents.window.getSelection();
          const text = selection?.toString().trim();
          if (text && text.length > 0) {
            setSelectedCfiRange(cfiRange);
            setSelectedText(text.substring(0, 500));
            setShowHighlightPopup(true);
          }
        } catch {
          // ignore selection errors
        }
      });

      // Content is visible - allow interaction immediately
      setIsLoading(false);

      // Generate locations for progress tracking in background (slow)
      await book.locations.generate(1024);
      if (thisInitId !== initIdRef.current) return;

      locationsReadyRef.current = true;
      if (rendition.location?.start?.cfi) {
        try {
          const pct = book.locations.percentageFromCfi(rendition.location.start.cfi) * 100;
          setPercentage(pct);
        } catch {}
      }

      // Auto-save progress every 30 seconds (with reading time tracking)
      saveInterval = setInterval(() => {
        if (renditionRef.current?.location?.start?.cfi && locationsReadyRef.current) {
          const cfi = renditionRef.current.location.start.cfi;
          try {
            const pct = bookRef.current.locations.percentageFromCfi(cfi) * 100;
            const now = Date.now();
            const elapsedMinutes = Math.floor((now - readingStartRef.current) / 60000);
            readingStartRef.current = now;
            saveProgress(pct, cfi, elapsedMinutes > 0 ? elapsedMinutes : undefined);
          } catch {}
        }
      }, 30000);
    }

    initReader();

    return () => {
      // Save progress + reading time BEFORE destroying the book (refs get nulled below)
      if (renditionRef.current?.location?.start?.cfi && bookRef.current && locationsReadyRef.current) {
        const cfi = renditionRef.current.location.start.cfi;
        try {
          const pct = bookRef.current.locations.percentageFromCfi(cfi) * 100;
          const elapsedMinutes = Math.floor((Date.now() - readingStartRef.current) / 60000);
          // Use keepalive to ensure the request completes even during unmount
          fetch(`/api/reading-progress/${bookId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              percentage: pct,
              cfi,
              readingMinutes: elapsedMinutes > 0 ? elapsedMinutes : undefined,
            }),
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }

      // Incrementing initIdRef causes any in-flight async initReader to bail
      initIdRef.current++;
      locationsReadyRef.current = false;
      clearInterval(saveInterval);
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
      renditionRef.current = null;
      // Clean up any DOM elements left by epub.js (critical for React StrictMode)
      if (viewerRef.current) {
        while (viewerRef.current.firstChild) {
          viewerRef.current.removeChild(viewerRef.current.firstChild);
        }
      }
    };
  }, [url, initialCfi, saveProgress, injectFontFamilyStyle, injectThemeStyle, injectHighlightStyles]);

  // Resize handler
  useEffect(() => {
    function handleResize() {
      if (!viewerRef.current || !renditionRef.current) return;
      const { clientWidth, clientHeight } = viewerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        renditionRef.current.resize(clientWidth, clientHeight);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        renditionRef.current?.prev();
      } else if (e.key === "ArrowRight") {
        renditionRef.current?.next();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Font size effect
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  // Dark theme effect - inject CSS into all iframes for full override
  useEffect(() => {
    if (renditionRef.current) {
      if (isDarkTheme) {
        renditionRef.current.themes.override("color", "#e0d5c1");
        renditionRef.current.themes.override("background", "#1a1410");
      } else {
        renditionRef.current.themes.override("color", "#2d1b0e");
        renditionRef.current.themes.override("background", "#fefbf6");
      }
      applyThemeToAllIframes(isDarkTheme);
    }
  }, [isDarkTheme, applyThemeToAllIframes]);

  // Font family effect - inject style directly into epub.js iframes
  useEffect(() => {
    if (renditionRef.current) {
      applyFontFamilyToAllIframes(fontFamily);
    }
  }, [fontFamily, applyFontFamilyToAllIframes]);

  // Fetch bookmarks
  useEffect(() => {
    async function fetchBookmarks() {
      try {
        const res = await fetch(`/api/bookmarks/${bookId}`);
        if (res.ok) {
          const data = await res.json();
          setBookmarks(data);
        }
      } catch {}
    }
    fetchBookmarks();
  }, [bookId]);

  // Fetch highlights
  useEffect(() => {
    async function fetchHighlights() {
      try {
        const res = await fetch(`/api/highlights/${bookId}`);
        if (res.ok) {
          const data = await res.json();
          setHighlights(data);
        }
      } catch {}
    }
    fetchHighlights();
  }, [bookId]);

  // Render highlights as annotations when rendition + highlights are ready
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || highlights.length === 0) return;

    // Clear existing annotations first, then re-add all
    try {
      highlights.forEach((hl) => {
        try {
          rendition.annotations.remove(hl.cfiRange, "highlight");
        } catch {
          // annotation may not exist yet
        }
      });
    } catch {}

    highlights.forEach((hl) => {
      try {
        rendition.annotations.add(
          "highlight",
          hl.cfiRange,
          {},
          undefined,
          `hl-${hl.color}`,
          { fill: hl.color, "fill-opacity": "0.3" }
        );
      } catch {
        // cfiRange may not be in current section
      }
    });
  }, [highlights]);

  // Save highlight
  async function handleSaveHighlight(color: string) {
    if (!selectedCfiRange || !selectedText) return;
    try {
      const res = await fetch(`/api/highlights/${bookId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfiRange: selectedCfiRange, text: selectedText, color }),
      });
      if (res.ok) {
        const highlight = await res.json();
        setHighlights((prev) => [highlight, ...prev]);
        // Add annotation to rendition
        try {
          renditionRef.current?.annotations.add(
            "highlight",
            selectedCfiRange,
            {},
            undefined,
            `hl-${color}`,
            { fill: color, "fill-opacity": "0.3" }
          );
        } catch {}
      }
    } catch {}
    setShowHighlightPopup(false);
    setSelectedCfiRange("");
    setSelectedText("");
    // Clear text selection in the iframe
    try {
      const iframes = viewerRef.current?.querySelectorAll("iframe");
      iframes?.forEach((iframe) => {
        try { iframe.contentWindow?.getSelection()?.removeAllRanges(); } catch {}
      });
    } catch {}
  }

  // Delete highlight
  async function handleDeleteHighlight(id: string) {
    const hl = highlights.find((h) => h.id === id);
    try {
      const res = await fetch(`/api/highlights/${bookId}?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setHighlights((prev) => prev.filter((h) => h.id !== id));
        if (hl) {
          try { renditionRef.current?.annotations.remove(hl.cfiRange, "highlight"); } catch {}
        }
      }
    } catch {}
  }

  // Go to highlight
  function goToHighlight(cfiRange: string) {
    renditionRef.current?.display(cfiRange);
    setShowToc(false);
  }

  // Save bookmark
  async function handleSaveBookmark() {
    if (!renditionRef.current?.location?.start?.cfi) return;
    const cfi = renditionRef.current.location.start.cfi;
    const label = `${Math.round(percentage)}%`;
    try {
      const res = await fetch(`/api/bookmarks/${bookId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfi, label, percentage }),
      });
      if (res.ok) {
        const bookmark = await res.json();
        setBookmarks((prev) => [bookmark, ...prev]);
        setBookmarkSaved(true);
        setTimeout(() => setBookmarkSaved(false), 2000);
      }
    } catch {}
  }

  // Delete bookmark
  async function handleDeleteBookmark(id: string) {
    try {
      const res = await fetch(`/api/bookmarks/${bookId}?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
      }
    } catch {}
  }

  // Go to bookmark
  function goToBookmark(cfi: string) {
    renditionRef.current?.display(cfi);
    setShowToc(false);
  }

  function goToChapter(href: string) {
    renditionRef.current?.display(href);
    setShowToc(false);
  }

  // Jump to percentage via slider
  function handleSliderJump(pct: number) {
    const book = bookRef.current;
    if (!book || !locationsReadyRef.current) return;
    const cfi = book.locations.cfiFromPercentage(pct / 100);
    if (cfi) {
      renditionRef.current?.display(cfi);
    }
  }

  // Search within the book
  async function handleSearch(query: string) {
    const book = bookRef.current;
    if (!book || !query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results: Array<{ cfi: string; excerpt: string }> = [];
      const spine = book.spine;
      // epub.js: iterate spine items and search each section
      for (let i = 0; i < spine.length; i++) {
        const item = spine.get(i);
        if (!item) continue;
        await item.load(book.load.bind(book));
        const found = await item.find(query.trim());
        if (found && found.length > 0) {
          for (const match of found) {
            results.push({ cfi: match.cfi, excerpt: match.excerpt });
          }
        }
        item.unload();
        if (results.length >= 100) break; // limit results
      }
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }

  function goToSearchResult(cfi: string) {
    renditionRef.current?.display(cfi);
  }

  function handlePrev() {
    renditionRef.current?.prev();
  }

  function handleNext() {
    renditionRef.current?.next();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }


  return (
    <div className={`absolute inset-0 flex flex-col ${isDarkTheme ? "bg-[#1a1410]" : "bg-[#fefbf6]"}`}>
      {/* Top toolbar */}
      <div
        className={`flex shrink-0 items-center justify-between border-b px-4 py-2 ${
          isDarkTheme
            ? "border-amber-900/30 bg-[#211a12]"
            : "border-amber-200 bg-amber-50/90"
        }`}
      >
        {/* Left controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowToc(!showToc)}
            className={`rounded-lg p-2 text-sm transition-colors ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
            title={t("tableOfContents")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => { setShowSearch(!showSearch); setShowToc(false); }}
            className={`rounded-lg p-2 text-sm transition-colors ${
              showSearch
                ? isDarkTheme ? "bg-amber-800 text-amber-100" : "bg-amber-200 text-amber-900"
                : isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
            title={t("search")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Center - font controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontSize((s) => Math.max(70, s - 10))}
            className={`rounded px-2 py-1 text-sm font-bold ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
          >
            A-
          </button>
          <span className={`text-xs ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
            {fontSize}%
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(150, s + 10))}
            className={`rounded px-2 py-1 text-sm font-bold ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
          >
            A+
          </button>
          {/* Font family */}
          <div className="ml-3 flex items-center gap-0.5 border-l pl-3" style={{ borderColor: isDarkTheme ? "rgba(217,119,6,0.2)" : "rgba(217,119,6,0.3)" }}>
            {([
              { label: "Serif", value: "Georgia, serif" },
              { label: "Sans", value: "Inter, system-ui, sans-serif" },
              { label: "Mono", value: "Courier New, monospace" },
            ] as const).map((f) => (
              <button
                key={f.label}
                onClick={() => setFontFamily(f.value)}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  fontFamily === f.value
                    ? isDarkTheme ? "bg-amber-800 text-amber-100" : "bg-amber-200 text-amber-900"
                    : isDarkTheme ? "text-amber-300 hover:bg-amber-900/30" : "text-amber-700 hover:bg-amber-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Bookmark button */}
          <button
            onClick={handleSaveBookmark}
            className={`relative rounded-lg p-2 text-sm transition-colors ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
            title={t("saveBookmark")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
            {bookmarkSaved && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-white">✓</span>
            )}
          </button>
          <button
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            className={`rounded-lg p-2 text-sm transition-colors ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
            title={isDarkTheme ? t("lightMode") : t("darkMode")}
          >
            {isDarkTheme ? "☀️" : "🌙"}
          </button>
          <button
            onClick={toggleFullscreen}
            className={`rounded-lg p-2 text-sm transition-colors ${
              isDarkTheme ? "text-amber-200 hover:bg-amber-900/30" : "text-amber-800 hover:bg-amber-100"
            }`}
            title={t("fullscreen")}
          >
            {isFullscreen ? "⊡" : "⊞"}
          </button>
        </div>
      </div>

      {/* Main content area - viewer fills remaining space */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Tabbed sidebar (ToC + Bookmarks) */}
        {showToc && (
          <div className={`absolute inset-y-0 left-0 z-20 w-72 overflow-y-auto border-r shadow-lg ${
            isDarkTheme ? "border-amber-900/30 bg-[#211a12]" : "border-amber-200 bg-amber-50"
          }`}>
            {/* Tabs */}
            <div className={`flex border-b ${isDarkTheme ? "border-amber-900/30" : "border-amber-200"}`}>
              <button
                onClick={() => setSidebarTab("toc")}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  sidebarTab === "toc"
                    ? isDarkTheme ? "border-b-2 border-amber-500 text-amber-200" : "border-b-2 border-amber-700 text-amber-900"
                    : isDarkTheme ? "text-amber-500 hover:text-amber-300" : "text-amber-600 hover:text-amber-800"
                }`}
              >
                {t("contents")}
              </button>
              <button
                onClick={() => setSidebarTab("bookmarks")}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  sidebarTab === "bookmarks"
                    ? isDarkTheme ? "border-b-2 border-amber-500 text-amber-200" : "border-b-2 border-amber-700 text-amber-900"
                    : isDarkTheme ? "text-amber-500 hover:text-amber-300" : "text-amber-600 hover:text-amber-800"
                }`}
              >
                {t("bookmarksWithCount", { count: bookmarks.length })}
              </button>
              <button
                onClick={() => setSidebarTab("highlights")}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  sidebarTab === "highlights"
                    ? isDarkTheme ? "border-b-2 border-amber-500 text-amber-200" : "border-b-2 border-amber-700 text-amber-900"
                    : isDarkTheme ? "text-amber-500 hover:text-amber-300" : "text-amber-600 hover:text-amber-800"
                }`}
              >
                {t("highlightsWithCount", { count: highlights.length })}
              </button>
            </div>

            <div className="p-4">
              {sidebarTab === "toc" && (
                <>
                  <h3 className={`mb-3 text-sm font-bold ${isDarkTheme ? "text-amber-200" : "text-amber-900"}`}>
                    {t("tableOfContents")}
                  </h3>
                  <ul className="space-y-1">
                    {toc.map((item) => (
                      <li key={item.id || item.href}>
                        <button
                          onClick={() => goToChapter(item.href)}
                          className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                            isDarkTheme ? "text-amber-300 hover:bg-amber-900/40" : "text-amber-800 hover:bg-amber-100"
                          }`}
                        >
                          {item.label}
                        </button>
                        {(item.subitems?.length ?? 0) > 0 && (
                          <ul className="ml-3 space-y-0.5">
                            {item.subitems!.map((sub) => (
                              <li key={sub.id || sub.href}>
                                <button
                                  onClick={() => goToChapter(sub.href)}
                                  className={`w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                                    isDarkTheme ? "text-amber-400 hover:bg-amber-900/40" : "text-amber-700 hover:bg-amber-100"
                                  }`}
                                >
                                  {sub.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {sidebarTab === "bookmarks" && (
                <>
                  {bookmarks.length === 0 ? (
                    <p className={`text-center text-sm italic ${isDarkTheme ? "text-amber-500/60" : "text-amber-700/50"}`}>
                      {t("noSavedBookmarks")}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {bookmarks.map((bm) => (
                        <li
                          key={bm.id}
                          className={`group flex items-start gap-2 rounded-lg p-2 transition-colors ${
                            isDarkTheme ? "hover:bg-amber-900/30" : "hover:bg-amber-100"
                          }`}
                        >
                          <button
                            onClick={() => goToBookmark(bm.cfi)}
                            className="flex-1 text-left"
                          >
                            <p className={`text-sm font-medium ${isDarkTheme ? "text-amber-200" : "text-amber-900"}`}>
                              {bm.label || `${Math.round(bm.percentage)}%`}
                            </p>
                            <p className={`text-xs ${isDarkTheme ? "text-amber-500" : "text-amber-600/60"}`}>
                              {new Date(bm.createdAt).toLocaleDateString()}
                            </p>
                          </button>
                          <button
                            onClick={() => handleDeleteBookmark(bm.id)}
                            className={`shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                              isDarkTheme ? "text-red-400 hover:bg-red-900/30" : "text-red-500 hover:bg-red-50"
                            }`}
                            title={tc("delete")}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {sidebarTab === "highlights" && (
                <>
                  {highlights.length === 0 ? (
                    <p className={`text-center text-sm italic ${isDarkTheme ? "text-amber-500/60" : "text-amber-700/50"}`}>
                      {t("noHighlights")}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {highlights.map((hl) => (
                        <li
                          key={hl.id}
                          className={`group flex items-start gap-2 rounded-lg p-2 transition-colors ${
                            isDarkTheme ? "hover:bg-amber-900/30" : "hover:bg-amber-100"
                          }`}
                        >
                          <div
                            className={`mt-1 h-3 w-3 shrink-0 rounded-full hl-${hl.color}`}
                            style={{
                              backgroundColor: hl.color === "yellow" ? "rgba(250, 204, 21, 0.8)"
                                : hl.color === "green" ? "rgba(34, 197, 94, 0.8)"
                                : hl.color === "blue" ? "rgba(59, 130, 246, 0.8)"
                                : "rgba(236, 72, 153, 0.8)"
                            }}
                          />
                          <button
                            onClick={() => goToHighlight(hl.cfiRange)}
                            className="flex-1 text-left"
                          >
                            <p className={`line-clamp-2 text-sm ${isDarkTheme ? "text-amber-200" : "text-amber-900"}`}>
                              &ldquo;{hl.text}&rdquo;
                            </p>
                            {hl.note && (
                              <p className={`mt-0.5 line-clamp-1 text-xs italic ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
                                {hl.note}
                              </p>
                            )}
                            <p className={`text-xs ${isDarkTheme ? "text-amber-500" : "text-amber-600/60"}`}>
                              {new Date(hl.createdAt).toLocaleDateString()}
                            </p>
                          </button>
                          <button
                            onClick={() => handleDeleteHighlight(hl.id)}
                            className={`shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                              isDarkTheme ? "text-red-400 hover:bg-red-900/30" : "text-red-500 hover:bg-red-50"
                            }`}
                            title={t("deleteHighlight")}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Search panel */}
        {showSearch && (
          <div className={`absolute inset-y-0 left-0 z-20 flex w-80 flex-col border-r shadow-lg ${
            isDarkTheme ? "border-amber-900/30 bg-[#211a12]" : "border-amber-200 bg-amber-50"
          }`}>
            <div className="flex items-center gap-2 border-b p-3" style={{ borderColor: isDarkTheme ? "rgba(217,119,6,0.2)" : "rgba(217,119,6,0.3)" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Debounced search
                  if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                  searchTimerRef.current = setTimeout(() => {
                    handleSearch(e.target.value);
                  }, 500);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                    handleSearch(searchQuery);
                  }
                  if (e.key === "Escape") {
                    setShowSearch(false);
                  }
                }}
                placeholder={t("searchPlaceholder")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none ${
                  isDarkTheme
                    ? "bg-amber-900/30 text-amber-100 placeholder-amber-600"
                    : "bg-white text-amber-900 placeholder-amber-400 border border-amber-200"
                }`}
                autoFocus
              />
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}
                className={`rounded-lg p-2 text-sm transition-colors ${
                  isDarkTheme ? "text-amber-400 hover:bg-amber-900/30" : "text-amber-600 hover:bg-amber-100"
                }`}
                title={t("closeSearch")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {isSearching && (
                <p className={`text-center text-sm ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
                  {t("searching")}
                </p>
              )}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <p className={`text-center text-sm italic ${isDarkTheme ? "text-amber-500/60" : "text-amber-700/50"}`}>
                  {t("noSearchResults")}
                </p>
              )}
              {!isSearching && searchResults.length > 0 && (
                <>
                  <p className={`mb-2 text-xs font-semibold ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
                    {t("searchResults", { count: searchResults.length })}
                  </p>
                  <ul className="space-y-1">
                    {searchResults.map((result, idx) => (
                      <li key={`${result.cfi}-${idx}`}>
                        <button
                          onClick={() => goToSearchResult(result.cfi)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isDarkTheme ? "text-amber-300 hover:bg-amber-900/40" : "text-amber-800 hover:bg-amber-100"
                          }`}
                        >
                          <span dangerouslySetInnerHTML={{
                            __html: result.excerpt.replace(
                              new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                              `<mark class="${isDarkTheme ? 'bg-amber-700/50 text-amber-100' : 'bg-amber-200 text-amber-900'} rounded px-0.5">$1</mark>`
                            )
                          }} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {/* Prev button */}
        <button
          onClick={handlePrev}
          className={`absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg p-3 opacity-30 transition-opacity hover:opacity-80 ${
            isDarkTheme ? "bg-amber-900/50 text-amber-200" : "bg-amber-100 text-amber-800"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* EPUB viewer - absolute positioned to get explicit pixel dimensions */}
        <div ref={viewerRef} className="absolute inset-0" />

        {/* Next button */}
        <button
          onClick={handleNext}
          className={`absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-lg p-3 opacity-30 transition-opacity hover:opacity-80 ${
            isDarkTheme ? "bg-amber-900/50 text-amber-200" : "bg-amber-100 text-amber-800"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-amber-50/80">
            <div className="text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
              <p className="text-sm text-amber-700">{t("loadingBook")}</p>
            </div>
          </div>
        )}

        {/* Highlight color chooser popup */}
        {showHighlightPopup && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => {
                setShowHighlightPopup(false);
                setSelectedCfiRange("");
                setSelectedText("");
              }}
            />
            {/* Popup */}
            <div className={`relative z-10 mx-4 max-w-sm rounded-xl p-4 shadow-xl ${
              isDarkTheme ? "bg-[#2a2018] border border-amber-900/40" : "bg-white border border-amber-200"
            }`}>
              <p className={`mb-3 text-sm font-medium ${isDarkTheme ? "text-amber-200" : "text-amber-900"}`}>
                {t("addHighlight")}
              </p>
              <p className={`mb-3 line-clamp-3 text-xs italic ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
                &ldquo;{selectedText}&rdquo;
              </p>
              <div className="flex items-center justify-center gap-3">
                {(["yellow", "green", "blue", "pink"] as const).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleSaveHighlight(color)}
                    className="group flex flex-col items-center gap-1"
                    title={t(`color${color.charAt(0).toUpperCase() + color.slice(1)}` as any)}
                  >
                    <div
                      className="h-8 w-8 rounded-full border-2 transition-transform group-hover:scale-110"
                      style={{
                        backgroundColor: color === "yellow" ? "rgba(250, 204, 21, 0.6)"
                          : color === "green" ? "rgba(34, 197, 94, 0.6)"
                          : color === "blue" ? "rgba(59, 130, 246, 0.6)"
                          : "rgba(236, 72, 153, 0.6)",
                        borderColor: color === "yellow" ? "rgb(250, 204, 21)"
                          : color === "green" ? "rgb(34, 197, 94)"
                          : color === "blue" ? "rgb(59, 130, 246)"
                          : "rgb(236, 72, 153)",
                      }}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setShowHighlightPopup(false);
                  setSelectedCfiRange("");
                  setSelectedText("");
                }}
                className={`mt-3 w-full rounded-lg py-1.5 text-xs transition-colors ${
                  isDarkTheme ? "text-amber-400 hover:bg-amber-900/30" : "text-amber-600 hover:bg-amber-50"
                }`}
              >
                {tc("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom progress slider */}
      <div
        className={`flex shrink-0 items-center gap-3 border-t px-4 py-2 ${
          isDarkTheme
            ? "border-amber-900/30 bg-[#211a12]"
            : "border-amber-200 bg-amber-50/90"
        }`}
      >
        <span className={`text-xs tabular-nums ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
          {Math.round(percentage)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={percentage}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setPercentage(val);
          }}
          onMouseUp={(e) => handleSliderJump(parseFloat((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => handleSliderJump(parseFloat((e.target as HTMLInputElement).value))}
          className="slider-progress flex-1"
          title={t("goToPage")}
          style={{
            accentColor: isDarkTheme ? "#d97706" : "#92400e",
          }}
        />
        <span className={`text-xs ${isDarkTheme ? "text-amber-400" : "text-amber-600"}`}>
          100%
        </span>
      </div>
    </div>
  );
}
