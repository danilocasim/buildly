"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@buildly/db";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";

export interface InviteState {
  message: string;
  error?: boolean;
}

export async function addInvite(_previous: InviteState, form: FormData): Promise<InviteState> {
  const admin = await currentUser();
  if (!admin?.isAdmin) notFound();
  const raw = form.get("email");
  const parsed = z.email().safeParse(typeof raw === "string" ? raw.trim() : "");
  if (!parsed.success) return { message: "Enter a valid email address.", error: true };
  const email = auth.normalizeEmail(parsed.data);
  const added = await auth.invitesQueries.add(getDeps().db, email, admin.id);
  revalidatePath("/admin/invites");
  return { message: added ? `Invited ${email}.` : `${email} is already invited.` };
}
