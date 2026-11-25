import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";
import { parseEpub, EPUB_ZIP_LIMITS } from "@/lib/ebook/epub-parser";

const MB = 1024 * 1024;

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function opf(title: string, padding = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>Teszt Szerző</dc:creator>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.png" media-type="image/png"/>
  </manifest>${padding}
</package>`;
}

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

async function buildEpub(options: {
  opf?: string | Buffer;
  cover?: Buffer;
  coverCompression?: "STORE" | "DEFLATE";
  extra?: Record<string, string | Buffer>;
} = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER_XML);
  zip.file("OEBPS/content.opf", options.opf ?? opf("Kis Könyv"));
  zip.file("OEBPS/cover.png", options.cover ?? TINY_PNG, {
    compression: options.coverCompression ?? "DEFLATE",
  });
  for (const [name, data] of Object.entries(options.extra ?? {})) {
    zip.file(name, data);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Overwrite the uncompressed size declared for `name` in both the central
 * directory and the local file header (simulates a forged archive).
 */
function forgeDeclaredSize(buf: Buffer, name: string, size: number): void {
  let patched = 0;
  for (let i = 0; i <= buf.length - 30; i++) {
    const sig = buf.readUInt32LE(i);
    if (sig === 0x02014b50 && i <= buf.length - 46) {
      const len = buf.readUInt16LE(i + 28);
      if (buf.toString("utf8", i + 46, i + 46 + len) === name) {
        buf.writeUInt32LE(size, i + 24);
        patched++;
      }
    } else if (sig === 0x04034b50) {
      const len = buf.readUInt16LE(i + 26);
      if (buf.toString("utf8", i + 30, i + 30 + len) === name) {
        buf.writeUInt32LE(size, i + 22);
        patched++;
      }
    }
  }
  if (patched !== 2) throw new Error(`forgeDeclaredSize: patched ${patched} headers for ${name}`);
}

describe("parseEpub zip bomb protection", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the limits as named constants in one place", () => {
    expect(EPUB_ZIP_LIMITS).toEqual({
      maxFileCount: 5000,
      maxTotalUncompressedBytes: 500 * MB,
      maxCompressionRatio: 100,
      ratioCheckMinUncompressedBytes: 10 * MB,
      maxXmlEntryBytes: 5 * MB,
      maxCoverImageBytes: 20 * MB,
    });
  });

  // (a)
  it("parses a valid small EPUB exactly as before (metadata + cover)", async () => {
    const result = await parseEpub(await buildEpub());

    expect(result).toEqual({
      title: "Kis Könyv",
      author: "Teszt Szerző",
      description: undefined,
      language: undefined,
      coverImage: { data: TINY_PNG, contentType: "image/png", filename: "cover.png" },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts highly compressible content below the ratio-check threshold", async () => {
    const chapter = "Lorem ipsum dolor sit amet. ".repeat(200_000); // ~5.6 MB, compresses ~1000:1
    const result = await parseEpub(await buildEpub({ extra: { "OEBPS/ch1.xhtml": chapter } }));

    expect(result.title).toBe("Kis Könyv");
    expect(result.coverImage).toBeDefined();
  });

  // (b)
  it("rejects an archive whose declared uncompressed total exceeds the limit", async () => {
    const buf = await buildEpub({ extra: { "OEBPS/ch1.xhtml": "x" } });
    forgeDeclaredSize(buf, "OEBPS/ch1.xhtml", 600 * MB);

    await expect(parseEpub(buf)).resolves.toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("declared uncompressed size"));
  });

  it("rejects an archive with a compression ratio above the limit", async () => {
    const buf = await buildEpub({ extra: { "OEBPS/ch1.xhtml": Buffer.alloc(60 * MB) } });
    expect(buf.length).toBeLessThan(MB); // 60 MB of zeros -> well over 100:1

    await expect(parseEpub(buf)).resolves.toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("compression ratio"));
  });

  // (c)
  it("skips an oversized OPF (no metadata, no exception)", async () => {
    const padding = `\n<!-- ${"p".repeat(6 * MB)} -->`; // honest size, 6 MB > 5 MB
    const result = await parseEpub(await buildEpub({ opf: opf("Nagy OPF", padding) }));

    expect(result).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"OEBPS/content.opf" exceeds'));
  });

  it("skips an oversized cover image but keeps the metadata", async () => {
    const cover = Buffer.alloc(21 * MB, 0x41);
    // STORE: ratio ~1:1, so only the per-entry cover limit can stop it
    const result = await parseEpub(await buildEpub({ cover, coverCompression: "STORE" }));

    expect(result.title).toBe("Kis Könyv");
    expect(result.author).toBe("Teszt Szerző");
    expect(result.coverImage).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"OEBPS/cover.png" exceeds'));
  });

  // (d)
  it("rejects an archive with too many files before parsing it", async () => {
    const extra: Record<string, string> = {};
    for (let i = 0; i <= EPUB_ZIP_LIMITS.maxFileCount; i++) extra[`f/${i}.txt`] = "x";
    const buf = await buildEpub({ extra });
    const loadSpy = vi.spyOn(JSZip, "loadAsync");

    await expect(parseEpub(buf)).resolves.toEqual({});
    expect(loadSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Suspicious file count"));
  });

  // (e)
  it("stops decompressing an OPF that declares a small size but inflates far beyond the limit", async () => {
    const buf = await buildEpub({ opf: Buffer.alloc(64 * MB) });
    forgeDeclaredSize(buf, "OEBPS/content.opf", 1000);

    const started = Date.now();
    await expect(parseEpub(buf)).resolves.toEqual({});
    const elapsed = Date.now() - started;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"OEBPS/content.opf" exceeds'));
    // Full decompression of 64 MB takes several hundred ms; the limited read stops after ~5 MB.
    expect(elapsed).toBeLessThan(2000);
  });

  it("stops decompressing a cover that lies about its size, keeping the metadata", async () => {
    const buf = await buildEpub({ cover: Buffer.alloc(64 * MB) });
    forgeDeclaredSize(buf, "OEBPS/cover.png", 1000);

    const result = await parseEpub(buf);

    expect(result.title).toBe("Kis Könyv");
    expect(result.coverImage).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"OEBPS/cover.png" exceeds'));
  });
});
