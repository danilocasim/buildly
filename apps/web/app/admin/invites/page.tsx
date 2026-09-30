// Admin-only invite list (TODO 3.2.4). Everyone else gets a plain 404.
import { notFound } from "next/navigation";
import { auth } from "@buildly/db";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await currentUser();
  if (!user?.isAdmin) notFound();
  const invites = await auth.invitesQueries.list(getDeps().db);
  return (
    <main style={{ padding: 48, maxWidth: 720 }}>
      <h1>Invites</h1>
      <InviteForm />
      <table style={{ marginTop: 24, width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Email</th>
            <th align="left">Invited</th>
            <th align="left">Accepted</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.email} data-testid="invite-row">
              <td>{invite.email}</td>
              <td>{invite.createdAt.toISOString().slice(0, 10)}</td>
              <td>{invite.acceptedAt ? invite.acceptedAt.toISOString().slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
