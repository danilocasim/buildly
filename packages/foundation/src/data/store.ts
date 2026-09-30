// Typed document store on AsyncStorage: one key per collection, an in-memory cache,
// and a schemaVersion that reseeds demo data on mismatch (no migrations in the MVP).
// Read-only for generated code: screens use repositories and the hooks below, never
// AsyncStorage directly.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import appConfig from "../../app.json";

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Seeded demo record. The UI shows a "Demo data" pill while any exist. */
  isDemo?: boolean;
}

/** What `create` accepts: the record without the fields the store sets. */
export type NewRecord<T extends BaseRecord> = Omit<T, "id" | "createdAt" | "updatedAt">;

export interface Collection<T extends BaseRecord> {
  readonly name: string;
  readonly searchFields: readonly (keyof T & string)[];
}

export interface Repository<T extends BaseRecord> {
  readonly collection: Collection<T>;
  /** All records, oldest first. */
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(input: NewRecord<T>): Promise<T>;
  update(id: string, patch: Partial<NewRecord<T>>): Promise<T>;
  remove(id: string): Promise<void>;
  /** Case-insensitive substring match over the collection's `searchFields`. */
  search(query: string): Promise<T[]>;
  /** Called after every change to this collection. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

// Expo Go shares one AsyncStorage between every Snack a phone opens, so every key is
// scoped by the app's slug; without it, one project's data and schemaVersion leak into
// another's preview.
const NAMESPACE = `buildly:${appConfig.expo.slug}:`;
const KEY_PREFIX = `${NAMESPACE}collection:`;
const VERSION_KEY = `${NAMESPACE}schemaVersion`;

interface InternalRepository {
  clearCache(): void;
  hasDemo(): Promise<boolean>;
  notify(): void;
}

const repositories = new Map<string, InternalRepository>();
const globalListeners = new Set<() => void>();
let activeSeed: (() => Promise<void>) | undefined;

function notifyAll() {
  for (const listener of globalListeners) listener();
}

export function defineCollection<T extends BaseRecord>(
  name: string,
  options: { searchFields: readonly (keyof T & string)[] },
): Collection<T> {
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(name)) throw new Error(`Invalid collection name: ${name}`);
  return { name, searchFields: options.searchFields };
}

let sequence = 0;
function newId(): string {
  sequence += 1;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRepository<T extends BaseRecord>(collection: Collection<T>): Repository<T> {
  // Re-creating a repository (Fast Refresh re-runs models.ts) replaces the old entry.
  const key = KEY_PREFIX + collection.name;
  const listeners = new Set<() => void>();
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
    notify();
  }

  function notify() {
    for (const listener of listeners) listener();
    notifyAll();
  }

  const repository: Repository<T> = {
    collection,
    async list() {
      return [...(await load())];
    },
    async get(id) {
      return (await load()).find((record) => record.id === id);
    },
    async create(input) {
      const now = new Date().toISOString();
      const record = { ...input, id: newId(), createdAt: now, updatedAt: now } as T;
      await save([...(await load()), record]);
      return record;
    },
    async update(id, patch) {
      const records = await load();
      const existing = records.find((record) => record.id === id);
      if (!existing) throw new Error(`${collection.name}: no record with id ${id}`);
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as T;
      await save(records.map((record) => (record.id === id ? updated : record)));
      return updated;
    },
    async remove(id) {
      await save((await load()).filter((record) => record.id !== id));
    },
    async search(query) {
      const needle = query.trim().toLowerCase();
      const records = await load();
      if (!needle) return [...records];
      return records.filter((record) =>
        collection.searchFields.some((field) =>
          String(record[field] ?? "")
            .toLowerCase()
            .includes(needle),
        ),
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  repositories.set(collection.name, {
    clearCache: () => {
      cache = undefined;
    },
    hasDemo: async () => (await load()).some((record) => record.isDemo === true),
    notify,
  });
  return repository;
}

async function clearAllCollections(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  for (const repository of repositories.values()) repository.clearCache();
}

export interface OpenStoreOptions {
  /** From src/data/models.ts. Bump it whenever a model's shape changes. */
  schemaVersion: number;
  /** From src/data/seed.ts. Creates demo records with `isDemo: true`. */
  seed: () => Promise<void>;
}

export interface OpenStoreResult {
  /** True once, on the first open after a schemaVersion change wiped and reseeded data. */
  didReseed: boolean;
}

/**
 * Called once by App.tsx on startup. First run seeds demo data. A stored schemaVersion
 * that differs from `schemaVersion` wipes every collection and reseeds.
 */
export async function openStore({
  schemaVersion,
  seed,
}: OpenStoreOptions): Promise<OpenStoreResult> {
  activeSeed = seed;
  const stored = await AsyncStorage.getItem(VERSION_KEY);
  let didReseed = false;
  if (stored === null) {
    await seed();
  } else if (Number(stored) !== schemaVersion) {
    await clearAllCollections();
    await seed();
    didReseed = true;
  }
  await AsyncStorage.setItem(VERSION_KEY, String(schemaVersion));
  for (const repository of repositories.values()) repository.notify();
  return { didReseed };
}

/** Wipes every collection and runs the seed again (the preview's "Reset demo data"). */
export async function reset(): Promise<void> {
  await clearAllCollections();
  await activeSeed?.();
  for (const repository of repositories.values()) repository.notify();
}

export async function hasDemoData(): Promise<boolean> {
  for (const repository of repositories.values()) {
    if (await repository.hasDemo()) return true;
  }
  return false;
}

/** Records of a repository, re-read after every change; `query` filters with `search`. */
export function useRecords<T extends BaseRecord>(repository: Repository<T>, query = "") {
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void repository.search(query).then((next) => {
        if (active) {
          setRecords(next);
          setLoading(false);
        }
      });
    };
    refresh();
    const unsubscribe = repository.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, query]);
  return { records, loading };
}

/** One record by id, re-read after every change; undefined while loading or missing. */
export function useRecord<T extends BaseRecord>(repository: Repository<T>, id: string) {
  const [record, setRecord] = useState<T | undefined>();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void repository.get(id).then((next) => active && setRecord(next));
    };
    refresh();
    const unsubscribe = repository.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, id]);
  return record;
}

/** True while any collection holds a demo record. */
export function useHasDemoData(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void hasDemoData().then((next) => active && setValue(next));
    };
    refresh();
    globalListeners.add(refresh);
    return () => {
      active = false;
      globalListeners.delete(refresh);
    };
  }, []);
  return value;
}
