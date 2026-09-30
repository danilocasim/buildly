import { createRepository, defineCollection, type BaseRecord } from "./store";

export const schemaVersion = 1;

export interface Entry extends BaseRecord {
  title: string;
  body: string;
  mood: "great" | "good" | "okay" | "bad";
  tagIds: string[];
}

export interface Tag extends BaseRecord {
  name: string;
  color: string;
}

export const entries = createRepository(defineCollection<Entry>("entries", ["title", "body"]));
export const tags = createRepository(defineCollection<Tag>("tags", ["name"]));
