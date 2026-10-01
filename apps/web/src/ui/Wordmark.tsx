import Link from "next/link";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 select-none" aria-label="Buildly home">
      <span className="relative block h-6 w-6 overflow-hidden rounded-full bg-accent">
        <span className="absolute inset-x-0 bottom-0 h-[38%] bg-ink/85" />
      </span>
      {!compact && <span className="text-[17px] font-semibold tracking-tight">Buildly</span>}
    </Link>
  );
}
