import { describe, it, expect } from "vitest";
import {
  matchCategoriesAndTopics,
  type MatchableCategory,
  type MatchableTopic,
} from "@/lib/ebook/category-matcher";

const CATEGORIES: MatchableCategory[] = [
  { id: "cat-szepirodalom", name: "Szépirodalom" },
  { id: "cat-ismeretterjeszto", name: "Ismeretterjesztő" },
  { id: "cat-tortenelem", name: "Történelem" },
  { id: "cat-informatika", name: "Informatika" },
  { id: "cat-nyelvkonyv", name: "Nyelvkönyv" },
  { id: "cat-gyermekirodalom", name: "Gyermekirodalom" },
  { id: "cat-eletrajz", name: "Életrajz" },
  { id: "cat-filozofia", name: "Filozófia" },
];

const TOPICS: MatchableTopic[] = [
  { id: "top-horror", name: "Horror" },
  { id: "top-scifi", name: "Sci-fi" },
  { id: "top-fantasy", name: "Fantasy" },
  { id: "top-krimi", name: "Krimi" },
  { id: "top-thriller", name: "Thriller" },
  { id: "top-romantikus", name: "Romantikus" },
  { id: "top-klasszikus", name: "Klasszikus" },
  { id: "top-modern", name: "Modern" },
  { id: "top-aiml", name: "AI/ML" },
  { id: "top-javascript", name: "JavaScript" },
  { id: "top-python", name: "Python" },
  { id: "top-react", name: "React" },
];

/** Thin wrapper so each test only spells out the fields it cares about. */
function match(options: {
  apiCategories?: string[];
  title?: string;
  author?: string | null;
  description?: string | null;
  categories?: MatchableCategory[];
  topics?: MatchableTopic[];
}) {
  return matchCategoriesAndTopics(
    options.apiCategories ?? [],
    options.title ?? "",
    options.author ?? null,
    options.description ?? null,
    options.categories ?? CATEGORIES,
    options.topics ?? TOPICS
  );
}

describe("matchCategoriesAndTopics - API categories", () => {
  it("maps an English keyword to the Hungarian category", () => {
    const result = match({ apiCategories: ["Fiction"] });
    expect(result.categoryNames).toEqual(["Szépirodalom"]);
    expect(result.categoryIds).toEqual(["cat-szepirodalom"]);
  });

  it("maps an English keyword to the Hungarian topic", () => {
    const result = match({ apiCategories: ["Fantasy"] });
    expect(result.topicNames).toEqual(["Fantasy"]);
    expect(result.topicIds).toEqual(["top-fantasy"]);
  });

  it("is case insensitive on the API value", () => {
    expect(match({ apiCategories: ["FICTION"] }).categoryNames).toEqual(["Szépirodalom"]);
    expect(match({ apiCategories: ["fIcTiOn"] }).categoryNames).toEqual(["Szépirodalom"]);
  });

  it("finds the keyword inside a longer BISAC-style string", () => {
    const result = match({ apiCategories: ["Computers / Programming / JavaScript"] });
    expect(result.categoryNames).toEqual(["Informatika"]);
    expect(result.topicNames).toEqual(["JavaScript"]);
  });

  it("returns nothing for an unmapped category", () => {
    const result = match({ apiCategories: ["Cooking"] });
    expect(result.categoryNames).toEqual([]);
    expect(result.topicNames).toEqual([]);
  });

  it("returns nothing for blank or whitespace-only API values", () => {
    expect(match({ apiCategories: [""] }).categoryNames).toEqual([]);
    expect(match({ apiCategories: ["   "] }).categoryNames).toEqual([]);
  });

  it("does not duplicate a category matched by several API values", () => {
    const result = match({ apiCategories: ["Fiction", "fiction", "Literary Fiction"] });
    expect(result.categoryNames).toEqual(["Szépirodalom"]);
    expect(result.categoryIds).toEqual(["cat-szepirodalom"]);
  });

  it("collects several categories in the order the API values arrive", () => {
    const result = match({ apiCategories: ["Fiction", "History"] });
    expect(result.categoryNames).toEqual(["Szépirodalom", "Történelem"]);
    expect(result.categoryIds).toEqual(["cat-szepirodalom", "cat-tortenelem"]);
  });

  it("skips a mapped name that the catalog does not contain", () => {
    const result = match({
      apiCategories: ["Fiction"],
      categories: [{ id: "cat-informatika", name: "Informatika" }],
    });
    expect(result.categoryNames).toEqual([]);
    expect(result.categoryIds).toEqual([]);
  });
});

describe("matchCategoriesAndTopics - direct name match", () => {
  it("matches a Hungarian category name coming straight from the API", () => {
    const result = match({ apiCategories: ["Történelem"] });
    expect(result.categoryNames).toEqual(["Történelem"]);
  });

  it("matches a Hungarian name case insensitively", () => {
    expect(match({ apiCategories: ["szépirodalom"] }).categoryNames).toEqual(["Szépirodalom"]);
    expect(match({ apiCategories: ["SZÉPIRODALOM"] }).categoryNames).toEqual(["Szépirodalom"]);
  });

  it("matches a topic name directly", () => {
    const result = match({ apiCategories: ["React"] });
    expect(result.topicNames).toEqual(["React"]);
    expect(result.topicIds).toEqual(["top-react"]);
  });

  it("requires the whole value to equal the name, not just contain it", () => {
    const result = match({ apiCategories: ["Szépirodalom és társai"] });
    expect(result.categoryNames).toEqual([]);
  });
});

describe("matchCategoriesAndTopics - title/author/description analysis", () => {
  it("detects a Hungarian genre keyword in the title", () => {
    const result = match({ title: "Horror történetek gyűjteménye" });
    expect(result.topicNames).toEqual(["Horror"]);
  });

  it("detects an English genre keyword in the description", () => {
    const result = match({
      title: "Deep Space Nine",
      description: "The hero travels to deep space and meets a robot",
    });
    expect(result.topicNames).toEqual(["Sci-fi"]);
  });

  it("takes the author field into account as well", () => {
    const result = match({ title: "Alapítvány", author: "Isaac Asimov robot" });
    expect(result.topicNames).toEqual(["Sci-fi"]);
  });

  it("detects a category keyword in the description", () => {
    const result = match({
      title: "Egy hosszabb cím",
      description: "This is a biography of a famous person",
    });
    expect(result.categoryNames).toEqual(["Életrajz"]);
  });

  it("can return several topics from one text", () => {
    const result = match({
      title: "Sárkányok és varázslók",
      description: "Egy fantasy világ, ahol a mágia uralkodik, és egy gyilkos rejtély is akad",
    });
    expect(result.topicNames).toEqual(["Fantasy", "Krimi"]);
  });

  it("skips text analysis when title+author+description is 10 characters or shorter", () => {
    // descText = "horror  " (8 chars) - under the threshold, so nothing is analysed
    expect(match({ title: "horror" }).topicNames).toEqual([]);
    // descText = "horror ok  " (11 chars) - over the threshold
    expect(match({ title: "horror ok" }).topicNames).toEqual(["Horror"]);
  });

  it("does not duplicate a category found by both the API value and the text", () => {
    const result = match({
      apiCategories: ["History"],
      title: "A második világháború története, csata csatát követett",
    });
    expect(result.categoryNames).toEqual(["Történelem"]);
    expect(result.categoryIds).toEqual(["cat-tortenelem"]);
  });

  it("skips a detected name that the catalog does not contain", () => {
    const result = match({
      title: "Horror történetek gyűjteménye",
      topics: [{ id: "top-modern", name: "Modern" }],
    });
    expect(result.topicNames).toEqual([]);
  });
});

describe("matchCategoriesAndTopics - edge cases", () => {
  it("returns four empty arrays for completely empty input", () => {
    expect(match({})).toEqual({
      categoryIds: [],
      topicIds: [],
      categoryNames: [],
      topicNames: [],
    });
  });

  it("tolerates null author and null description", () => {
    const result = match({ apiCategories: ["Philosophy"], title: "Rövid", author: null, description: null });
    expect(result.categoryNames).toEqual(["Filozófia"]);
  });

  it("returns nothing when the catalog is empty", () => {
    const result = match({
      apiCategories: ["Fiction"],
      title: "Egy hosszú horror cím",
      categories: [],
      topics: [],
    });
    expect(result.categoryNames).toEqual([]);
    expect(result.topicNames).toEqual([]);
  });

  it("keeps ids and names aligned index by index", () => {
    const result = match({ apiCategories: ["Fiction", "History", "Fantasy"] });
    expect(result.categoryIds).toHaveLength(result.categoryNames.length);
    expect(result.topicIds).toHaveLength(result.topicNames.length);
    result.categoryNames.forEach((name, i) => {
      expect(CATEGORIES.find((c) => c.id === result.categoryIds[i])?.name).toBe(name);
    });
    result.topicNames.forEach((name, i) => {
      expect(TOPICS.find((t) => t.id === result.topicIds[i])?.name).toBe(name);
    });
  });

  it("does not mutate the catalog arrays it receives", () => {
    const categories = [...CATEGORIES];
    const topics = [...TOPICS];
    match({ apiCategories: ["Fiction"], title: "Egy hosszú horror cím", categories, topics });
    expect(categories).toEqual(CATEGORIES);
    expect(topics).toEqual(TOPICS);
  });
});

// These cases pin down behaviour that is currently surprising. They are here so a
// deliberate fix shows up as a failing test instead of silently changing results.
describe("matchCategoriesAndTopics - documented current behaviour", () => {
  it('treats "non-fiction" as fiction too, because the keyword match is a substring match', () => {
    const result = match({ apiCategories: ["Non-Fiction"] });
    expect(result.categoryNames).toEqual(["Szépirodalom", "Ismeretterjesztő"]);
  });

  it('maps "Science Fiction" to Szépirodalom and Ismeretterjesztő as well', () => {
    const result = match({ apiCategories: ["Science Fiction"] });
    expect(result.categoryNames).toEqual(["Szépirodalom", "Ismeretterjesztő"]);
    expect(result.topicNames).toEqual(["Sci-fi"]);
  });

  it("does not detect text keywords that begin with an accented letter", () => {
    // "életrajz", "önéletrajz", "űr" and "összeesküvés" sit behind a \b in their
    // pattern, which never matches in front of an accented letter.
    expect(match({ title: "Egy hosszabb cím", description: "Ez egy izgalmas életrajz" }).categoryNames).toEqual([]);
    expect(match({ title: "Egy hosszabb cím", description: "A hős az űr mélyére utazik" }).topicNames).toEqual([]);
    expect(match({ title: "Egy hosszabb cím", description: "Egy nagy összeesküvés a háttérben" }).topicNames).toEqual([]);
    // the same meaning with a non-accented first letter is found
    expect(match({ title: "Egy hosszabb cím", description: "This is a biography" }).categoryNames).toEqual(["Életrajz"]);
  });
});
