// The working copy of a project's files during a run (ARCHITECTURE.md §3: working files
// live in memory). Every mutation is recorded so the run can report what changed.
export type FileSet = Record<string, string>;

export interface FileChange {
  seq: number;
  op: "write" | "delete";
  path: string;
  /** For writes: whether the file did not exist before. */
  created?: boolean;
  bytes?: number;
}

export class ProjectFiles {
  private readonly files = new Map<string, string>();
  private readonly log: FileChange[] = [];

  constructor(initial: FileSet = {}) {
    for (const [path, contents] of Object.entries(initial)) this.files.set(path, contents);
  }

  /** Sorted paths. */
  list(): string[] {
    return [...this.files.keys()].sort();
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  read(path: string): string | undefined {
    return this.files.get(path);
  }

  write(path: string, contents: string): void {
    const created = !this.files.has(path);
    this.files.set(path, contents);
    this.log.push({
      seq: this.log.length + 1,
      op: "write",
      path,
      created,
      bytes: Buffer.byteLength(contents),
    });
  }

  /** Returns false (and records nothing) when the file does not exist. */
  delete(path: string): boolean {
    if (!this.files.delete(path)) return false;
    this.log.push({ seq: this.log.length + 1, op: "delete", path });
    return true;
  }

  /** Every mutation, in order. */
  get changes(): readonly FileChange[] {
    return this.log;
  }

  /** Paths touched by the run, in first-touch order. */
  changedPaths(): string[] {
    return [...new Set(this.log.map((c) => c.path))];
  }

  toFileSet(): FileSet {
    return Object.fromEntries([...this.files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}
