// Sign in by magic link (TODO 5.1.2). Signed-in visitors go to Home; an invalid or used
// link lands here with ?error=invalid_link.
import { redirect } from "next/navigation";
import { currentUser } from "@/src/server/current-user";
import { SignInForm } from "@/src/ui/SignInForm";
import { Wordmark } from "@/src/ui/Wordmark";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <SignInForm initialError={error === "invalid_link" ? "invalid_link" : undefined} />
      </div>
    </main>
  );
}
