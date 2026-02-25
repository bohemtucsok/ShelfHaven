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

// Keywords to detect genres/topics from description text
const DESCRIPTION_CATEGORY_KEYWORDS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(regény|novel|irodal|szépiroda)/i, name: "Szépirodalom" },
  { pattern: /\b(ismeretterjeszt|tudomány|scientific|nonfiction)/i, name: "Ismeretterjesztő" },
  { pattern: /\b(történel|history|historical|háború|war|csata|battle)/i, name: "Történelem" },
  { pattern: /\b(programoz|coding|software|algorithm|fejleszt)/i, name: "Informatika" },
  { pattern: /\b(nyelvtan|grammar|szótár|dictionary|nyelvkönyv|language learning)/i, name: "Nyelvkönyv" },
  { pattern: /\b(gyerek|children|ifjúsági|young adult|mesekönyv)/i, name: "Gyermekirodalom" },
  { pattern: /\b(életrajz|biography|autobiography|memoir|önéletrajz)/i, name: "Életrajz" },
  { pattern: /\b(filozófi|philosophy|philosophical|bölcselet)/i, name: "Filozófia" },
];

const DESCRIPTION_TOPIC_KEYWORDS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(horror|rémtörténet|rémes|szörny|monster|undead|zombie|vámpír|vampire)/i, name: "Horror" },
  { pattern: /\b(sci[\s-]?fi|science[\s-]?fiction|űr|space|galax|jövő|future|android|robot|cyberpunk|disztóp|dystop|apokalip|apocalyp|nukleáris|nuclear|radioaktív|radioactive|atombomb|mutáns|mutant|klón|clone)/i, name: "Sci-fi" },
  { pattern: /\b(fantasy|varázsló|wizard|mági[ac]|magic|sárkány|dragon|tündér|elf|elves|tolkien)/i, name: "Fantasy" },
  { pattern: /\b(krimi|detective|nyomoz|murder|gyilkos|rejtély|mystery|whodunit|bűnügy)/i, name: "Krimi" },
  { pattern: /\b(thriller|feszült|suspense|összeesküvés|conspiracy|kémregény|spy)/i, name: "Thriller" },
  { pattern: /\b(romantikus|romantic|romance|szerelem|love story|szerelmes)/i, name: "Romantikus" },
  { pattern: /\b(klasszikus|classic|19th century|18th century|viktoriánus|victorian)/i, name: "Klasszikus" },
  { pattern: /\b(kortárs|contemporary|modern|21st century|mai)/i, name: "Modern" },
  { pattern: /\b(artificial intelligence|machine learning|mesterséges intelligencia|gépi tanulás|neural network|deep learning)\b/i, name: "AI/ML" },
  { pattern: /\b(javascript|typescript|node\.?js|frontend|react|angular|vue)/i, name: "JavaScript" },
  { pattern: /\b(python|django|flask|pandas|numpy)/i, name: "Python" },
];

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

    for (const [pattern, hunName] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(pattern)) {
        const match = categories.find((c) => c.name === hunName);
        if (match && !matchedCategoryIds.includes(match.id)) {
          matchedCategoryIds.push(match.id);
          matchedCategoryNames.push(match.name);
        }
      }
    }

    for (const [pattern, hunName] of Object.entries(TOPIC_MAP)) {
      if (lower.includes(pattern)) {
        const match = topics.find((tp) => tp.name === hunName);
        if (match && !matchedTopicIds.includes(match.id)) {
          matchedTopicIds.push(match.id);
          matchedTopicNames.push(match.name);
        }
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
