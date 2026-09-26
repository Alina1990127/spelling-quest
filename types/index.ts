export type WordStatus = "new" | "learning" | "tricky" | "bee-ready" | "mastered";

export type SpellingWord = {
  id: number;
  word: string;
  pronunciation: string;
  meaning: string;
  sentence: string;
  difficulty: "easy" | "tricky" | "monster";
};

export type WordProgress = {
  status: WordStatus;
  attempts: number;
  correctFullSpells: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
};
