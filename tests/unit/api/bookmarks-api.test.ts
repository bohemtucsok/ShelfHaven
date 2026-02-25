import { describe, it, expect } from "vitest";
import { z } from "zod";

const createBookmarkSchema = z.object({
  cfi: z.string().min(1),
  label: z.string().optional(),
  note: z.string().optional(),
  percentage: z.number().min(0).max(100),
});

describe("Bookmark API validation", () => {
  it("should validate a valid bookmark", () => {
    const result = createBookmarkSchema.safeParse({
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      label: "Chapter 1",
      percentage: 25.5,
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty cfi", () => {
    const result = createBookmarkSchema.safeParse({
      cfi: "",
      percentage: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid percentage", () => {
    const result = createBookmarkSchema.safeParse({
      cfi: "epubcfi(/6/4)",
      percentage: 150,
    });
    expect(result.success).toBe(false);
  });

  it("should accept bookmark without optional fields", () => {
    const result = createBookmarkSchema.safeParse({
      cfi: "epubcfi(/6/4)",
      percentage: 0,
    });
    expect(result.success).toBe(true);
  });

  it("should accept bookmark with note", () => {
    const result = createBookmarkSchema.safeParse({
      cfi: "epubcfi(/6/4!/4)",
      label: "Kedvenc rész",
      note: "Ez egy fontos gondolat",
      percentage: 42.3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("Ez egy fontos gondolat");
    }
  });
});
