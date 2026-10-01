// Home (TODO 6.1): greeting, the composer, and the recent apps / starters strip below.
import starters from "@buildly/starters/dist/starters-files.json";
import { projects } from "@buildly/db";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { Composer } from "@/src/ui/home/Composer";
import { HomeBrowse } from "@/src/ui/home/HomeBrowse";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = (await currentUser())!;
  const rows = await projects.listForUser(getDeps().db, user.id);
  const firstName = (user.displayName?.trim() || user.email.split("@")[0]!).split(/\s+/)[0]!;
  const starterList = starters.starters.map(({ slug, name, description, screens }) => ({
    slug,
    name,
    description,
    screens,
  }));
  return (
    <div className="flex flex-col">
      <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-6 py-12 lg:px-10">
        <header className="text-center">
          <p className="text-[22px] text-muted">
            Hi {firstName}
            <span className="text-accent">.</span>
          </p>
          <h1 className="mt-1 text-[40px] leading-[1.1] font-semibold tracking-tight lg:text-[52px]">
            What mobile app will you build?
          </h1>
        </header>
        <div className="mt-12 w-full max-w-[1000px]">
          <Composer starters={starterList} />
        </div>
      </section>
      <HomeBrowse
        projects={rows.map((p) => ({
          id: p.id,
          name: p.name,
          starterSlug: p.starterSlug,
          updatedAt: p.updatedAt.toISOString(),
        }))}
        starters={starterList}
      />
    </div>
  );
}
