import { Composer } from "@/components/Composer";
import { HomeBrowse } from "@/components/HomeBrowse";
import { user } from "@/lib/mock";

export default function HomePage() {
  const firstName = user.name.split(" ")[0];
  return (
    <div className="flex flex-col">
      {/* First viewport: hero centered, bottom strip flush with the viewport edge. Content scrolls in below. */}
      <section className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-10">
        <header className="text-center">
          <h1 className="text-[52px] leading-[1.1] font-semibold tracking-tight">
            Hi {firstName}<span className="text-accent">.</span>
            <br />
            What mobile app will you build?
          </h1>
        </header>
        <div className="mt-12 w-full max-w-[1000px]">
          <Composer />
        </div>
      </section>

      <HomeBrowse />
    </div>
  );
}
