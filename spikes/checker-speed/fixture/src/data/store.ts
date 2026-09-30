import AsyncStorage from "@react-native-async-storage/async-storage";

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface Collection<T extends BaseRecord> {
  name: string;
  searchFields: (keyof T)[];
}

export function defineCollection<T extends BaseRecord>(name: string, searchFields: (keyof T)[]): Collection<T> {
  return { name, searchFields };
}

export type NewRecord<T extends BaseRecord> = Omit<T, "id" | "createdAt" | "updatedAt">;

export interface Repository<T extends BaseRecord> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(input: NewRecord<T>): Promise<T>;
  update(id: string, patch: Partial<NewRecord<T>>): Promise<T>;
  remove(id: string): Promise<void>;
  search(query: string): Promise<T[]>;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRepository<T extends BaseRecord>(collection: Collection<T>): Repository<T> {
  const key = `collection:${collection.name}`;
  let cache: T[] | undefined;

  async function load(): Promise<T[]> {
    if (!cache) {
      const raw = await AsyncStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T[]) : [];
    }
    return cache;
  }

  async function save(records: T[]): Promise<void> {
    cache = records;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  return {
    list: load,
    async get(id) {
      return (await load()).find((r) => r.id === id);
    },
    async create(input) {
      const now = new Date().toISOString();
      const record = { ...input, id: newId(), createdAt: now, updatedAt: now } as T;
      await save([...(await load()), record]);
      return record;
    },
    async update(id, patch) {
      const records = await load();
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) throw new Error(`${collection.name}: no record ${id}`);
      const updated = { ...records[index], ...patch, updatedAt: new Date().toISOString() } as T;
      await save(records.map((r, i) => (i === index ? updated : r)));
      return updated;
    },
    async remove(id) {
      await save((await load()).filter((r) => r.id !== id));
    },
    async search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return load();
      return (await load()).filter((r) =>
        collection.searchFields.some((field) => String(r[field] ?? "").toLowerCase().includes(q)),
      );
    },
  };
}
