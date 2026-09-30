import { addDays, checkIns, dateKey, habits } from "./models";

export async function seed(): Promise<void> {
  const today = dateKey();
  const plan: { name: string; description: string; daysAgo: number[] }[] = [
    { name: "Read 10 pages", description: "Any book, before bed.", daysAgo: [1, 2] },
    { name: "Drink water", description: "Eight glasses a day.", daysAgo: [0, 1, 2, 3] },
    { name: "Stretch", description: "Ten minutes after waking up.", daysAgo: [3] },
  ];
  for (const item of plan) {
    const habit = await habits.create({
      name: item.name,
      description: item.description,
      isDemo: true,
    });
    for (const ago of item.daysAgo) {
      await checkIns.create({ habitId: habit.id, date: addDays(today, -ago), isDemo: true });
    }
  }
}
