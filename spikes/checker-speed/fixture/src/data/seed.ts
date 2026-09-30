import { entries, tags, type Entry } from "./models";

export async function seed(): Promise<void> {
  const work = await tags.create({ name: "Work", color: "#4f46e5", isDemo: true });
  const life = await tags.create({ name: "Life", color: "#16a34a", isDemo: true });
  const demo: Omit<Entry, "id" | "createdAt" | "updatedAt">[] = [
    { title: "First day", body: "Started the new journal.", mood: "great", tagIds: [life.id], isDemo: true },
    { title: "Sprint review", body: "Shipped the onboarding flow.", mood: "good", tagIds: [work.id], isDemo: true },
    { title: "Rainy Sunday", body: "Read a book and made soup.", mood: "okay", tagIds: [life.id], isDemo: true },
  ];
  for (const entry of demo) await entries.create(entry);
}
