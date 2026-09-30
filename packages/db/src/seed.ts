// Local development data: one admin, three invites, one project per starter with an
// initial snapshot. Safe to run repeatedly: existing rows are left alone.
import { and, eq } from "drizzle-orm";
import type { SnapshotFiles } from "@buildly/storage";
import type { Db } from "./client";
import { invites, projects, users } from "./schema";
import { createSnapshot, type SnapshotStore } from "./snapshot-service";

export interface SeedStarter {
  slug: string;
  name: string;
  files: SnapshotFiles;
}

export const SEED_ADMIN_EMAIL = "admin@buildly.test";
export const SEED_INVITES = ["alice@example.com", "bob@example.com", "carol@example.com"];

export async function seedDev(
  db: Db,
  store: SnapshotStore,
  starters: SeedStarter[],
  adminEmail = SEED_ADMIN_EMAIL,
) {
  await db
    .insert(users)
    .values({ email: adminEmail, displayName: "Admin", isAdmin: true })
    .onConflictDoNothing();
  const [admin] = await db.select().from(users).where(eq(users.email, adminEmail));
  if (!admin) throw new Error("admin user missing after insert");

  await db
    .insert(invites)
    .values(SEED_INVITES.map((email) => ({ email, invitedBy: admin.id })))
    .onConflictDoNothing();

  for (const starter of starters) {
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, admin.id), eq(projects.starterSlug, starter.slug)));
    if (existing) continue;
    const [project] = await db
      .insert(projects)
      .values({ userId: admin.id, name: starter.name, starterSlug: starter.slug })
      .returning();
    const snapshot = await createSnapshot(db, store, {
      projectId: project!.id,
      files: starter.files,
      parentId: null,
    });
    await db
      .update(projects)
      .set({ currentSnapshotId: snapshot.id })
      .where(eq(projects.id, project!.id));
  }
  return { adminId: admin.id };
}
