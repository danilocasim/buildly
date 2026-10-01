// Screen names for the workspace's screen list (TODO 5.6.1). The model's `finish` tool
// names the screens it built; when that is missing, the routes registered in
// src/navigation.tsx stand in: every `<X.Screen name component>` whose component is a
// project screen (imported from ./screens/…), skipping nested navigators and foundation
// components such as About.

/** "EntryDetail" → "Entry detail", "NewEntry" → "New entry", "Entries" → "Entries". */
export function humanizeScreenName(name: string): string {
  const words = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((word, i) => (i === 0 ? word[0]!.toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join(" ");
}

/** Project screens registered in a navigation file, in registration order, humanized. */
export function screensFromNavigation(navigation: string | undefined): string[] {
  if (!navigation) return [];
  const screenComponents = new Set<string>();
  for (const match of navigation.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']\.\/screens\/[^"']+["']/g,
  )) {
    for (const name of match[1]!.split(",")) {
      const bare = name
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (bare) screenComponents.add(bare);
    }
  }
  const screens: string[] = [];
  for (const match of navigation.matchAll(/<\w+\.Screen\b([^>]*?)\/?>/g)) {
    const attrs = match[1]!;
    const name = /\bname=["']([^"']+)["']/.exec(attrs)?.[1];
    const component = /\bcomponent=\{\s*(\w+)\s*\}/.exec(attrs)?.[1];
    if (!name || !component || !screenComponents.has(component)) continue;
    const label = humanizeScreenName(name);
    if (!screens.includes(label)) screens.push(label);
  }
  return screens;
}
