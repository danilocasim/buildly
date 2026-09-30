import { createRepository, defineCollection, type BaseRecord } from "./store";

// Bump when a model's shape changes; the app then reseeds demo data.
export const schemaVersion = 1;

export type Mood = "great" | "good" | "okay" | "bad";
export const moods: Mood[] = ["great", "good", "okay", "bad"];

export interface Entry extends BaseRecord {
  title: string;
  body: string;
  mood: Mood;
  tagIds: string[];
}

export interface Tag extends BaseRecord {
  name: string;
}

export const entries = createRepository(
  defineCollection<Entry>("entries", { searchFields: ["title", "body"] }),
);
export const tags = createRepository(defineCollection<Tag>("tags", { searchFields: ["name"] }));

/** Newest first. */
export function sortEntries(list: Entry[]): Entry[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
