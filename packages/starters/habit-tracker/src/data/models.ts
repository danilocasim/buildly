import { createRepository, defineCollection, type BaseRecord } from "./store";

// Bump when a model's shape changes; the app then reseeds demo data.
export const schemaVersion = 1;

export interface Habit extends BaseRecord {
  name: string;
  description: string;
}

export interface CheckIn extends BaseRecord {
  habitId: string;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
}

export const habits = createRepository(
  defineCollection<Habit>("habits", { searchFields: ["name", "description"] }),
);
export const checkIns = createRepository(
  defineCollection<CheckIn>("checkIns", { searchFields: ["date"] }),
);

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's (or `date`'s) local calendar day as "YYYY-MM-DD". */
export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Calendar arithmetic on day keys, in UTC so daylight-saving changes cannot skip a day. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Consecutive checked-in days ending today, or ending yesterday when today has no
 * check-in yet (the streak is still alive until the day is over). A missed day resets it.
 */
export function streak(dates: string[], today: string = dateKey()): number {
  const days = new Set(dates);
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

/** Records a check-in for `date` unless one exists. */
export async function checkIn(habitId: string, date: string = dateKey()): Promise<void> {
  const existing = (await checkIns.list()).some((c) => c.habitId === habitId && c.date === date);
  if (!existing) await checkIns.create({ habitId, date });
}

/** Deletes a habit and its check-ins. */
export async function removeHabit(habitId: string): Promise<void> {
  for (const c of await checkIns.list()) if (c.habitId === habitId) await checkIns.remove(c.id);
  await habits.remove(habitId);
}
