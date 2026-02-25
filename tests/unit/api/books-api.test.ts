import { describe, it, expect } from "vitest";
import { z } from "zod";

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  publishedYear: z.number().optional(),
  categoryIds: z.array(z.string()).optional(),
  topicIds: z.array(z.string()).optional(),
});

describe("Book API validation", () => {
  it("should validate a full update", () => {
    const result = updateBookSchema.safeParse({
      title: "Új cím",
      author: "Új szerző",
      description: "Leírás",
      categoryIds: ["cat1", "cat2"],
      topicIds: ["top1"],
    });
    expect(result.success).toBe(true);
  });

  it("should validate partial update (title only)", () => {
    const result = updateBookSchema.safeParse({ title: "Csak cím" });
    expect(result.success).toBe(true);
  });

  it("should reject empty title", () => {
    const result = updateBookSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("should validate empty arrays for categories/topics", () => {
    const result = updateBookSchema.safeParse({
      categoryIds: [],
      topicIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("should validate update with publishedYear", () => {
    const result = updateBookSchema.safeParse({
      publishedYear: 2024,
      language: "hu",
    });
    expect(result.success).toBe(true);
  });

  it("should accept undefined for all fields", () => {
    const result = updateBookSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
