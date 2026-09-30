// Resolves a starter as if it were assembled onto the foundation:
// 1. A starter file importing a foundation file ("../components") falls back to
//    packages/foundation at the same relative path.
// 2. A foundation file importing a project-owned file ("./src/navigation" from App.tsx)
//    gets the starter's version when the starter has one.
const { existsSync } = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");

const foundationDir = resolve(__dirname, "../../foundation");
const projectOwned = /^src\/(navigation|screens\/|data\/models|data\/seed)/;

const posix = (path) => path.split(sep).join("/");
const inside = (dir, path) => !relative(dir, path).startsWith("..");

module.exports = (request, options) => {
  const starterDir = options.rootDir;
  const resolveFrom = (basedir) => options.defaultResolver(request, { ...options, basedir });

  if (request.startsWith(".") && inside(starterDir, options.basedir)) {
    try {
      return resolveFrom(options.basedir);
    } catch {
      return resolveFrom(join(foundationDir, relative(starterDir, options.basedir)));
    }
  }

  const resolved = resolveFrom(options.basedir);
  if (inside(foundationDir, resolved) && !resolved.includes(`${sep}node_modules${sep}`)) {
    const rel = posix(relative(foundationDir, resolved));
    if (projectOwned.test(rel)) {
      const candidate = join(starterDir, rel);
      if (existsSync(candidate)) return candidate;
      // The starter may use .ts where the template uses .tsx (or the reverse).
      const base = candidate.replace(/\.tsx?$/, "");
      for (const ext of [".tsx", ".ts"]) if (existsSync(base + ext)) return base + ext;
    }
  }
  return resolved;
};
