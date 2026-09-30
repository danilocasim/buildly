import { entries, tags } from "./models";

export async function seed(): Promise<void> {
  const work = await tags.create({ name: "Work", isDemo: true });
  const life = await tags.create({ name: "Life", isDemo: true });
  const ideas = await tags.create({ name: "Ideas", isDemo: true });

  await entries.create({
    title: "First morning pages",
    body: "Wrote three pages before coffee. Felt clearer about the week.",
    mood: "great",
    tagIds: [life.id],
    isDemo: true,
  });
  await entries.create({
    title: "Sprint review",
    body: "Shipped the onboarding flow. Next: fix the flaky sync test.",
    mood: "good",
    tagIds: [work.id],
    isDemo: true,
  });
  await entries.create({
    title: "App idea: plant tracker",
    body: "Remind me when to water each plant, with a photo per plant.",
    mood: "okay",
    tagIds: [ideas.id, life.id],
    isDemo: true,
  });
  await entries.create({
    title: "Rainy Sunday",
    body: "Read a novel and made soup. No screens after lunch.",
    mood: "good",
    tagIds: [life.id],
    isDemo: true,
  });
}
