export interface BackupManifest {
  version: number;
  createdAt: string;
  platform: string;
  minioEndpoint: string;
  counts: {
    users: number;
    accounts: number;
    sessions: number;
    books: number;
    categories: number;
    topics: number;
    bookCategories: number;
    bookTopics: number;
    readingProgress: number;
    bookmarks: number;
    highlights: number;
    reviews: number;
    likes: number;
    shelves: number;
    shelfBooks: number;
    sharedLinks: number;
    readingGoals: number;
    settings: number;
    verificationTokens: number;
    notifications: number;
    follows: number;
    activities: number;
    comments: number;
    ebookFiles: number;
    coverFiles: number;
  };
  databaseChecksum: string;
}

export interface DatabaseExport {
  users: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  books: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  topics: Record<string, unknown>[];
  bookCategories: Record<string, unknown>[];
  bookTopics: Record<string, unknown>[];
  readingProgress: Record<string, unknown>[];
  bookmarks: Record<string, unknown>[];
  highlights: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  likes: Record<string, unknown>[];
  shelves: Record<string, unknown>[];
  shelfBooks: Record<string, unknown>[];
  sharedLinks: Record<string, unknown>[];
  readingGoals: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  verificationTokens: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  follows: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  comments: Record<string, unknown>[];
}

export type RestoreMode = "wipe" | "merge";

export interface ProgressState {
  operationId: string;
  type: "backup" | "restore";
  status: "running" | "completed" | "failed";
  step: string;
  percentage: number;
  message: string;
  current?: number;
  total?: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface BackupInfo {
  lastBackup: {
    date: string;
    size: string;
    counts: Record<string, number>;
  } | null;
}

export interface RestoreResult {
  success: boolean;
  operationId: string;
  stats: {
    tablesRestored: number;
    recordsRestored: number;
    filesRestored: number;
    duration: number;
  };
}
