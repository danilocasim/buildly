export type StarterSlug = "journal" | "habit-tracker" | "inventory";

export interface Starter {
  slug: StarterSlug;
  name: string;
  description: string;
  screens: string[];
  models: string[];
}

export const starters: Starter[] = [
  {
    slug: "journal",
    name: "Journal",
    description: "A clean journaling app with tags and search.",
    screens: ["Entries", "Entry detail", "New entry", "Tags"],
    models: ["Entry", "Tag"],
  },
  {
    slug: "habit-tracker",
    name: "Habit Tracker",
    description: "Track habits, build streaks and stay consistent.",
    screens: ["Today", "Habits", "Habit detail", "History"],
    models: ["Habit", "CheckIn"],
  },
  {
    slug: "inventory",
    name: "Inventory",
    description: "Simple inventory tracking for small businesses.",
    screens: ["Items", "Item detail", "Adjust stock", "Search"],
    models: ["Item", "Adjustment"],
  },
];

export type ProjectIcon = "book" | "file" | "box";

export interface Project {
  id: string;
  name: string;
  icon: ProjectIcon;
  updatedAgo: string;
  starter?: StarterSlug;
}

export const projects: Project[] = [
  { id: "reading-tracker", name: "Reading Tracker", icon: "book", updatedAgo: "2 hours ago" },
  { id: "personal-journal", name: "Personal Journal", icon: "file", updatedAgo: "1 day ago", starter: "journal" },
  { id: "home-inventory", name: "Home Inventory", icon: "box", updatedAgo: "3 days ago", starter: "inventory" },
];

export const user = {
  name: "Danilo Casim",
  initials: "DC",
  email: "danilo@example.com",
  plan: "Free" as const,
  buildsUsed: 7,
  buildsCap: 15,
  resetsOn: "Oct 1",
};

export interface Screen {
  name: string;
  file: string;
}

export const workspaceScreens: Screen[] = [
  { name: "Library", file: "src/screens/LibraryScreen.tsx" },
  { name: "Book details", file: "src/screens/BookDetailScreen.tsx" },
  { name: "Reading session", file: "src/screens/ReadingSessionScreen.tsx" },
  { name: "Goals", file: "src/screens/GoalsScreen.tsx" },
];

export interface Snapshot {
  id: string;
  label: string;
  ago: string;
  current?: boolean;
}

export const snapshots: Snapshot[] = [
  { id: "s3", label: "Add monthly goal card to Library", ago: "2 hours ago", current: true },
  { id: "s2", label: "Reading session timer and pages read", ago: "3 hours ago" },
  { id: "s1", label: "Initial build: Library, Book details, Reading session, Goals", ago: "Yesterday" },
];

export const projectFiles = [
  "src/screens/LibraryScreen.tsx",
  "src/screens/BookDetailScreen.tsx",
  "src/screens/ReadingSessionScreen.tsx",
  "src/screens/GoalsScreen.tsx",
  "src/data/models.ts",
  "src/data/seed.ts",
  "src/navigation.tsx",
  "app.json",
];

export const foundationFiles = [
  "App.tsx",
  "src/theme/tokens.ts",
  "src/components/index.ts",
  "src/data/store.ts",
  "foundation.json",
  "package.json",
];

export const sampleSource = `import { useEffect, useState } from "react";
import { FlatList } from "react-native";
import { Screen, Card, ListRow, FAB, EmptyState } from "@/components";
import { books, goals } from "@/data/models";
import type { Book, Goal } from "@/data/models";

export function LibraryScreen({ navigation }) {
  const [items, setItems] = useState<Book[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);

  useEffect(() => {
    books.list().then(setItems);
    goals.get("monthly").then(setGoal);
  }, []);

  return (
    <Screen title="My Library" subtitle="Keep your reading moving">
      {goal && (
        <Card
          title="Monthly goal"
          subtitle={\`\${goal.completed} of \${goal.target} books\`}
          progress={goal.completed / goal.target}
          onPress={() => navigation.navigate("Goals")}
        />
      )}
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<EmptyState title="No books yet" />}
        renderItem={({ item }) => (
          <ListRow
            title={item.title}
            subtitle={item.author}
            progress={item.pagesRead / item.pages}
            onPress={() => navigation.navigate("BookDetail", { id: item.id })}
          />
        )}
      />
      <FAB onPress={() => navigation.navigate("BookDetail", { id: "new" })} />
    </Screen>
  );
}
`;

export const books = [
  { title: "Atomic Habits", author: "James Clear", progress: 0.45, cover: "from-orange-400 via-rose-400 to-amber-300" },
  { title: "The Daily Stoic", author: "Ryan Holiday", progress: 0.2, cover: "from-slate-700 via-teal-600 to-emerald-400" },
  { title: "Deep Work", author: "Cal Newport", progress: 0.72, cover: "from-indigo-500 via-sky-500 to-cyan-300" },
];
