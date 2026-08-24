/**
 * Shared category/topic auto-matching logic for metadata search results.
 * Used by both UploadForm and BookDetail components.
 */

export interface MatchableCategory {
  id: string;
  name: string;
}

export interface MatchableTopic {
  id: string;
  name: string;
}

export interface MatchResult {
  categoryIds: string[];
  topicIds: string[];
  categoryNames: string[];
  topicNames: string[];
}

// Mapping from common English category/genre keywords to our Hungarian category/topic names
const CATEGORY_MAP: Record<string, string> = {
  "fiction": "Szépirodalom",
  "literary fiction": "Szépirodalom",
  "literature": "Szépirodalom",
  "nonfiction": "Ismeretterjesztő",
  "non-fiction": "Ismeretterjesztő",
  "self-help": "Ismeretterjesztő",
  "science": "Ismeretterjesztő",
  "education": "Ismeretterjesztő",
  "history": "Történelem",
  "historical": "Történelem",
  "computers": "Informatika",
  "computer science": "Informatika",
  "technology": "Informatika",
  "programming": "Informatika",
  "software": "Informatika",
  "foreign language": "Nyelvkönyv",
  "language arts": "Nyelvkönyv",
  "juvenile": "Gyermekirodalom",
  "children": "Gyermekirodalom",
  "young adult": "Gyermekirodalom",
  "biography": "Életrajz",
  "autobiography": "Életrajz",
  "memoir": "Életrajz",
  "philosophy": "Filozófia",
};

const TOPIC_MAP: Record<string, string> = {
  "horror": "Horror",
  "science fiction": "Sci-fi",
  "sci-fi": "Sci-fi",
  "fantasy": "Fantasy",
  "mystery": "Krimi",
  "crime": "Krimi",
  "detective": "Krimi",
  "thriller": "Thriller",
  "suspense": "Thriller",
  "romance": "Romantikus",
  "romantic": "Romantikus",
  "love": "Romantikus",
  "classic": "Klasszikus",
  "classics": "Klasszikus",
  "modern": "Modern",
  "contemporary": "Modern",
  "artificial intelligence": "AI/ML",
  "machine learning": "AI/ML",
  "javascript": "JavaScript",
  "python": "Python",
  "react": "React",
};

// Keywords to detect genres/topics from description text.
// The patterns use a unicode-aware word start instead of \b: \b never matches in
// front of an accented letter, so keywords like "életrajz" or "űr" could never fire.
const DESCRIPTION_CATEGORY_KEYWORDS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(?<![\p{L}\p{N}_])(regény|novel|irodal|szépiroda)/iu, name: "Szépirodalom" },
  { pattern: /(?<![\p{L}\p{N}_])(ismeretterjeszt|tudomány|scientific|nonfiction)/iu, name: "Ismeretterjesztő" },
  { pattern: /(?<![\p{L}\p{N}_])(történel|history|historical|háború|war|csata|battle)/iu, name: "Történelem" },
  { pattern: /(?<![\p{L}\p{N}_])(programoz|coding|software|algorithm|fejleszt)/iu, name: "Informatika" },
  { pattern: /(?<![\p{L}\p{N}_])(nyelvtan|grammar|szótár|dictionary|nyelvkönyv|language learning)/iu, name: "Nyelvkönyv" },
  { pattern: /(?<![\p{L}\p{N}_])(gyerek|children|ifjúsági|young adult|mesekönyv)/iu, name: "Gyermekirodalom" },
  { pattern: /(?<![\p{L}\p{N}_])(életrajz|biography|autobiography|memoir|önéletrajz)/iu, name: "Életrajz" },
  { pattern: /(?<![\p{L}\p{N}_])(filozófi|philosophy|philosophical|bölcselet)/iu, name: "Filozófia" },
];

const DESCRIPTION_TOPIC_KEYWORDS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(?<![\p{L}\p{N}_])(horror|rémtörténet|rémes|szörny|monster|undead|zombie|vámpír|vampire)/iu, name: "Horror" },
  { pattern: /(?<![\p{L}\p{N}_])(sci[\s-]?fi|science[\s-]?fiction|űr|space|galax|jövő|future|android|robot|cyberpunk|disztóp|dystop|apokalip|apocalyp|nukleáris|nuclear|radioaktív|radioactive|atombomb|mutáns|mutant|klón|clone)/iu, name: "Sci-fi" },
  { pattern: /(?<![\p{L}\p{N}_])(fantasy|varázsló|wizard|mági[ac]|magic|sárkány|dragon|tündér|elf|elves|tolkien)/iu, name: "Fantasy" },
  { pattern: /(?<![\p{L}\p{N}_])(krimi|detective|nyomoz|murder|gyilkos|rejtély|mystery|whodunit|bűnügy)/iu, name: "Krimi" },
  { pattern: /(?<![\p{L}\p{N}_])(thriller|feszült|suspense|összeesküvés|conspiracy|kémregény|spy)/iu, name: "Thriller" },
  { pattern: /(?<![\p{L}\p{N}_])(romantikus|romantic|romance|szerelem|love story|szerelmes)/iu, name: "Romantikus" },
  { pattern: /(?<![\p{L}\p{N}_])(klasszikus|classic|19th century|18th century|viktoriánus|victorian)/iu, name: "Klasszikus" },
  { pattern: /(?<![\p{L}\p{N}_])(kortárs|contemporary|modern|21st century|mai)/iu, name: "Modern" },
  { pattern: /(?<![\p{L}\p{N}_])(artificial intelligence|machine learning|mesterséges intelligencia|gépi tanulás|neural network|deep learning)(?![\p{L}\p{N}_])/iu, name: "AI/ML" },
  { pattern: /(?<![\p{L}\p{N}_])(javascript|typescript|node\.?js|frontend|react|angular|vue)/iu, name: "JavaScript" },
  { pattern: /(?<![\p{L}\p{N}_])(python|django|flask|pandas|numpy)/iu, name: "Python" },
];

/**
 * Collect the mapped Hungarian names for one API category value.
 * A keyword only counts if no other matched keyword contains it, so the longer,
 * more specific match wins: "non-fiction" no longer counts as "fiction", and
 * "science fiction" no longer counts as "science" or "fiction" either.
 */
function resolveKeywordNames(lower: string): { categoryNames: string[]; topicNames: string[] } {
  const categoryKeywords = Object.keys(CATEGORY_MAP).filter((keyword) => lower.includes(keyword));
  const topicKeywords = Object.keys(TOPIC_MAP).filter((keyword) => lower.includes(keyword));
  const allKeywords = [...categoryKeywords, ...topicKeywords];
  const isCoveredByLonger = (keyword: string) =>
    allKeywords.some((other) => other !== keyword && other.includes(keyword));

  return {
    categoryNames: categoryKeywords.filter((k) => !isCoveredByLonger(k)).map((k) => CATEGORY_MAP[k]),
    topicNames: topicKeywords.filter((k) => !isCoveredByLonger(k)).map((k) => TOPIC_MAP[k]),
  };
}

/**
 * Match categories and topics from metadata search result.
 * Uses a two-stage approach:
 * 1. Match from API categories field (keyword mapping + direct name match)
 * 2. Analyze title + description text for genre keywords
 */
export function matchCategoriesAndTopics(
  apiCategories: string[],
  title: string,
  author: string | null,
  description: string | null,
  categories: MatchableCategory[],
  topics: MatchableTopic[]
): MatchResult {
  const matchedCategoryIds: string[] = [];
  const matchedTopicIds: string[] = [];
  const matchedCategoryNames: string[] = [];
  const matchedTopicNames: string[] = [];

  // 1. Match from API categories field
  for (const apiCat of apiCategories) {
    const lower = apiCat.toLowerCase();
    const keywordNames = resolveKeywordNames(lower);

    for (const hunName of keywordNames.categoryNames) {
      const match = categories.find((c) => c.name === hunName);
      if (match && !matchedCategoryIds.includes(match.id)) {
        matchedCategoryIds.push(match.id);
        matchedCategoryNames.push(match.name);
      }
    }

    for (const hunName of keywordNames.topicNames) {
      const match = topics.find((tp) => tp.name === hunName);
      if (match && !matchedTopicIds.includes(match.id)) {
        matchedTopicIds.push(match.id);
        matchedTopicNames.push(match.name);
      }
    }

    // Direct name match
    for (const cat of categories) {
      if (cat.name.toLowerCase() === lower && !matchedCategoryIds.includes(cat.id)) {
        matchedCategoryIds.push(cat.id);
        matchedCategoryNames.push(cat.name);
      }
    }
    for (const topic of topics) {
      if (topic.name.toLowerCase() === lower && !matchedTopicIds.includes(topic.id)) {
        matchedTopicIds.push(topic.id);
        matchedTopicNames.push(topic.name);
      }
    }
  }

  // 2. Analyze title + description text for genre keywords
  const descText = `${title || ""} ${author || ""} ${description || ""}`;
  if (descText.length > 10) {
    for (const { pattern, name } of DESCRIPTION_CATEGORY_KEYWORDS) {
      if (pattern.test(descText)) {
        const match = categories.find((c) => c.name === name);
        if (match && !matchedCategoryIds.includes(match.id)) {
          matchedCategoryIds.push(match.id);
          matchedCategoryNames.push(match.name);
        }
      }
    }
    for (const { pattern, name } of DESCRIPTION_TOPIC_KEYWORDS) {
      if (pattern.test(descText)) {
        const match = topics.find((tp) => tp.name === name);
        if (match && !matchedTopicIds.includes(match.id)) {
          matchedTopicIds.push(match.id);
          matchedTopicNames.push(match.name);
        }
      }
    }
  }

  return {
    categoryIds: matchedCategoryIds,
    topicIds: matchedTopicIds,
    categoryNames: matchedCategoryNames,
    topicNames: matchedTopicNames,
  };
}
