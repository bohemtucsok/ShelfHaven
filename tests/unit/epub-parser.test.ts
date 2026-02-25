import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseEpub } from "@/lib/ebook/epub-parser";

async function createMockEpub(options: {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  includeCover?: boolean;
}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip");

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  let manifestExtra = "";
  let coverMeta = "";

  if (options.includeCover) {
    // Create a tiny 1x1 pixel PNG
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // RGB, no interlace
    ]);
    zip.file("OEBPS/cover.png", pngHeader);
    manifestExtra = `<item id="cover-image" href="cover.png" media-type="image/png"/>`;
    coverMeta = `<meta name="cover" content="cover-image"/>`;
  }

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${options.title ? `<dc:title>${options.title}</dc:title>` : ""}
    ${options.author ? `<dc:creator>${options.author}</dc:creator>` : ""}
    ${options.description ? `<dc:description>${options.description}</dc:description>` : ""}
    ${options.language ? `<dc:language>${options.language}</dc:language>` : ""}
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    ${manifestExtra}
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`
  );

  const content = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(content);
}

describe("parseEpub", () => {
  it("should extract title and author", async () => {
    const buffer = await createMockEpub({
      title: "Teszt Könyv",
      author: "Magyar Szerző",
    });
    const result = await parseEpub(buffer);
    expect(result.title).toBe("Teszt Könyv");
    expect(result.author).toBe("Magyar Szerző");
  });

  it("should extract all metadata fields", async () => {
    const buffer = await createMockEpub({
      title: "Full Book",
      author: "Author Name",
      description: "A great book about testing",
      language: "hu",
    });
    const result = await parseEpub(buffer);
    expect(result.title).toBe("Full Book");
    expect(result.author).toBe("Author Name");
    expect(result.description).toBe("A great book about testing");
    expect(result.language).toBe("hu");
  });

  it("should handle missing metadata gracefully", async () => {
    const buffer = await createMockEpub({});
    const result = await parseEpub(buffer);
    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.coverImage).toBeUndefined();
  });

  it("should extract cover image", async () => {
    const buffer = await createMockEpub({
      title: "Book With Cover",
      includeCover: true,
    });
    const result = await parseEpub(buffer);
    expect(result.coverImage).toBeDefined();
    expect(result.coverImage!.contentType).toBe("image/png");
    expect(result.coverImage!.filename).toBe("cover.png");
    expect(result.coverImage!.data).toBeInstanceOf(Buffer);
    expect(result.coverImage!.data.length).toBeGreaterThan(0);
  });

  it("should handle HTML entities in metadata", async () => {
    const buffer = await createMockEpub({
      title: "Tom &amp; Jerry",
      author: "Smith &amp; Jones",
    });
    const result = await parseEpub(buffer);
    expect(result.title).toBe("Tom & Jerry");
    expect(result.author).toBe("Smith & Jones");
  });

  it("should return empty result for invalid buffer", async () => {
    const result = await parseEpub(Buffer.from("not a zip file"));
    // Should not throw, just return empty
    expect(result).toBeDefined();
  });
});
