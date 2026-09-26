import type { WordProgress } from "@/types";

const STORAGE_KEY = "spelling-quest-progress-v1";

export function loadProgress(): Record<number, WordProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProgress(progress: Record<number, WordProgress>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function scheduleReview(correctFullSpells: number) {
  const days = correctFullSpells >= 4 ? 14 : correctFullSpells === 3 ? 7 : correctFullSpells === 2 ? 3 : 1;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}
