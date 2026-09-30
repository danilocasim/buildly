import { Text } from "react-native";
import type { BaseRecord } from "../src/data/store";

type StoreModule = typeof import("../src/data/store");
type Rntl = typeof import("@testing-library/react-native/pure");
interface MockStorage {
  __INTERNAL_MOCK_STORAGE__: Record<string, string>;
  getItem(key: string): Promise<string | null>;
}

interface Note extends BaseRecord {
  title: string;
  body: string;
  pinned: boolean;
}

// Each test gets a fresh module registry: a new store (no cached repositories), an empty
// AsyncStorage mock, and a testing library bound to the same React instance.
// `restart()` simulates an app restart: storage contents survive, memory does not.
function load() {
  const storageModule = require("@react-native-async-storage/async-storage");
  const storage = (storageModule.default ?? storageModule) as MockStorage;
  const store = require("../src/data/store") as StoreModule;
  const notes = store.createRepository(
    store.defineCollection<Note>("notes", { searchFields: ["title", "body"] }),
  );
  // The pure entry registers no hooks, so it can be required inside a test.
  const rntl = () => require("@testing-library/react-native/pure") as Rntl;
  return { storage, store, notes, rntl };
}

function freshStore() {
  jest.resetModules();
  let current = load();
  const restart = () => {
    const kept = { ...current.storage.__INTERNAL_MOCK_STORAGE__ };
    jest.resetModules();
    current = load();
    Object.assign(current.storage.__INTERNAL_MOCK_STORAGE__, kept);
    return current;
  };
  return { ...current, restart };
}

const afterTest: (() => void)[] = [];
afterEach(() => afterTest.splice(0).forEach((fn) => fn()));

const note = (title: string, extra: Partial<Note> = {}) => ({
  title,
  body: "",
  pinned: false,
  ...extra,
});

describe("repository", () => {
  it("round-trips create, get, list, update, and remove", async () => {
    const { notes, storage } = freshStore();
    const created = await notes.create(note("Groceries", { body: "milk" }));
    expect(created).toMatchObject({ title: "Groceries", body: "milk" });
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toBe(created.updatedAt);

    expect(await notes.get(created.id)).toEqual(created);
    expect(await notes.list()).toEqual([created]);

    const updated = await notes.update(created.id, { pinned: true });
    expect(updated).toMatchObject({ id: created.id, pinned: true, title: "Groceries" });
    expect(await notes.get(created.id)).toEqual(updated);

    await notes.remove(created.id);
    expect(await notes.get(created.id)).toBeUndefined();
    expect(await notes.list()).toEqual([]);
    expect(JSON.parse((await storage.getItem("buildly:my-app:collection:notes"))!)).toEqual([]);
  });

  it("persists across a restart (one AsyncStorage key per collection)", async () => {
    const { notes, restart } = freshStore();
    const created = await notes.create(note("Persist me"));
    const after = restart();
    expect(await after.notes.get(created.id)).toEqual(created);
  });

  it("rejects updates to a missing record", async () => {
    const { notes } = freshStore();
    await expect(notes.update("nope", { title: "x" })).rejects.toThrow(
      "notes: no record with id nope",
    );
  });

  it("searches case-insensitively over the declared fields only", async () => {
    const { notes } = freshStore();
    await notes.create(note("Weekly GROCERIES", { body: "eggs" }));
    await notes.create(note("Workout", { body: "Leg day at the gym" }));
    await notes.create({ ...note("Other"), id: "x", pinned: true } as never);

    expect((await notes.search("groceries")).map((n) => n.title)).toEqual(["Weekly GROCERIES"]);
    expect((await notes.search("GYM")).map((n) => n.title)).toEqual(["Workout"]);
    expect((await notes.search("  ")).length).toBe(3);
    expect(await notes.search("true")).toEqual([]); // `pinned` is not a search field
  });

  it("assigns unique ids across 1,000 creates", async () => {
    const { notes } = freshStore();
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add((await notes.create(note(`n${i}`))).id);
    expect(ids.size).toBe(1000);
  });

  it("notifies subscribers after each change", async () => {
    const { notes } = freshStore();
    const listener = jest.fn();
    const unsubscribe = notes.subscribe(listener);
    const created = await notes.create(note("a"));
    await notes.update(created.id, { title: "b" });
    await notes.remove(created.id);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    await notes.create(note("c"));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe("openStore and schemaVersion", () => {
  const seedWith =
    (notes: { create: (n: ReturnType<typeof note> & { isDemo?: boolean }) => Promise<unknown> }) =>
    async () => {
      await notes.create({ ...note("Demo 1"), isDemo: true });
      await notes.create({ ...note("Demo 2"), isDemo: true });
    };

  it("seeds on first run without flagging a reseed", async () => {
    const { store, notes } = freshStore();
    expect(await store.openStore({ schemaVersion: 1, seed: seedWith(notes) })).toEqual({
      didReseed: false,
    });
    expect((await notes.list()).map((n) => n.title)).toEqual(["Demo 1", "Demo 2"]);
  });

  it("keeps data when the version is unchanged", async () => {
    const { store, notes, restart } = freshStore();
    await store.openStore({ schemaVersion: 1, seed: seedWith(notes) });
    await notes.create(note("Mine"));

    const after = restart();
    expect(await after.store.openStore({ schemaVersion: 1, seed: seedWith(after.notes) })).toEqual({
      didReseed: false,
    });
    expect((await after.notes.list()).map((n) => n.title)).toEqual(["Demo 1", "Demo 2", "Mine"]);
  });

  it("reseeds on a bumped version, flags it once, and not on the next open", async () => {
    const { store, notes, restart } = freshStore();
    await store.openStore({ schemaVersion: 1, seed: seedWith(notes) });
    await notes.create(note("Mine"));

    const bumped = restart();
    expect(
      await bumped.store.openStore({ schemaVersion: 2, seed: seedWith(bumped.notes) }),
    ).toEqual({ didReseed: true });
    expect((await bumped.notes.list()).map((n) => n.title)).toEqual(["Demo 1", "Demo 2"]);

    const again = restart();
    expect(await again.store.openStore({ schemaVersion: 2, seed: seedWith(again.notes) })).toEqual({
      didReseed: false,
    });
  });

  it("wipes collections the new schema no longer defines", async () => {
    const { store, storage, restart } = freshStore();
    const tags = store.createRepository(
      store.defineCollection<Note>("tags", { searchFields: ["title"] }),
    );
    await store.openStore({ schemaVersion: 1, seed: async () => {} });
    await tags.create(note("old"));
    expect(await storage.getItem("buildly:my-app:collection:tags")).not.toBeNull();

    const after = restart(); // the new build has no "tags" collection
    await after.store.openStore({ schemaVersion: 2, seed: async () => {} });
    expect(await after.storage.getItem("buildly:my-app:collection:tags")).toBeNull();
  });
});

describe("per-app storage namespace", () => {
  it("keeps two apps on one device apart (Expo Go shares AsyncStorage between Snacks)", async () => {
    const appA = freshStore();
    await appA.store.openStore({
      schemaVersion: 1,
      seed: async () => void (await appA.notes.create(note("A demo"))),
    });
    const shared = { ...appA.storage.__INTERNAL_MOCK_STORAGE__ };

    // A second app with another slug on the same device: same storage, fresh modules.
    jest.resetModules();
    jest.doMock("../app.json", () => ({ expo: { slug: "other-app" } }));
    const appB = load();
    Object.assign(appB.storage.__INTERNAL_MOCK_STORAGE__, shared);
    const seeded = await appB.store.openStore({
      schemaVersion: 1,
      seed: async () => void (await appB.notes.create(note("B demo"))),
    });
    jest.dontMock("../app.json");

    expect(seeded).toEqual({ didReseed: false });
    expect((await appB.notes.list()).map((n) => n.title)).toEqual(["B demo"]);
    expect(Object.keys(appB.storage.__INTERNAL_MOCK_STORAGE__).sort()).toEqual([
      "buildly:my-app:collection:notes",
      "buildly:my-app:schemaVersion",
      "buildly:other-app:collection:notes",
      "buildly:other-app:schemaVersion",
    ]);
  });
});

describe("reset and demo data", () => {
  it("reset() leaves only the seeded demo records", async () => {
    const { store, notes } = freshStore();
    const seed = async () => {
      await notes.create({ ...note("Demo"), isDemo: true });
    };
    await store.openStore({ schemaVersion: 1, seed });
    await notes.create(note("Mine 1"));
    await notes.create(note("Mine 2"));

    await store.reset();
    const all = await notes.list();
    expect(all.map((n) => n.title)).toEqual(["Demo"]);
    expect(all.every((n) => n.isDemo)).toBe(true);
  });

  it("hasDemoData tracks demo records", async () => {
    const { store, notes } = freshStore();
    expect(await store.hasDemoData()).toBe(false);
    const demo = await notes.create({ ...note("Demo"), isDemo: true });
    await notes.create(note("Mine"));
    expect(await store.hasDemoData()).toBe(true);
    await notes.remove(demo.id);
    expect(await store.hasDemoData()).toBe(false);
  });

  it("the Demo data pill shows while demo records exist and hides after they are removed", async () => {
    const { store, notes, rntl } = freshStore();
    const { render, act, cleanup } = rntl();
    afterTest.push(cleanup);
    const { DemoDataPill } = require("../src/components") as typeof import("../src/components");
    await store.openStore({
      schemaVersion: 1,
      seed: async () => {
        await notes.create({ ...note("Demo A"), isDemo: true });
        await notes.create({ ...note("Demo B"), isDemo: true });
      },
    });
    await notes.create(note("Mine"));

    const view = render(<DemoDataPill />);
    expect(await view.findByTestId("demo-data-pill")).toHaveTextContent("Demo data");

    for (const record of (await notes.list()).filter((n) => n.isDemo)) {
      await act(() => notes.remove(record.id));
    }
    expect(view.queryByTestId("demo-data-pill")).toBeNull();
  });
});

describe("hooks", () => {
  it("useRecords re-renders after changes and filters by query", async () => {
    const { store, notes, rntl } = freshStore();
    const { render, act, cleanup } = rntl();
    afterTest.push(cleanup);
    function List({ query }: { query: string }) {
      const { records, loading } = store.useRecords(notes, query);
      return (
        <Text testID="list">{loading ? "loading" : records.map((r) => r.title).join(",")}</Text>
      );
    }
    await notes.create(note("apple"));
    const view = render(<List query="" />);
    expect(await view.findByText("apple")).toBeTruthy();

    await act(() => notes.create(note("banana")));
    expect(view.getByTestId("list")).toHaveTextContent("apple,banana");

    view.rerender(<List query="BAN" />);
    expect(await view.findByText("banana")).toBeTruthy();
  });

  it("useRecord follows one record", async () => {
    const { store, notes, rntl } = freshStore();
    const { render, act, cleanup } = rntl();
    afterTest.push(cleanup);
    const created = await notes.create(note("first"));
    function One() {
      const record = store.useRecord(notes, created.id);
      return <Text testID="one">{record?.title ?? "none"}</Text>;
    }
    const view = render(<One />);
    expect(await view.findByText("first")).toBeTruthy();
    await act(() => notes.update(created.id, { title: "renamed" }));
    expect(view.getByTestId("one")).toHaveTextContent("renamed");
  });
});
