import { BookOpen, ClipboardCheck, Package, Smartphone } from "lucide-react";

const icons = {
  journal: BookOpen,
  "habit-tracker": ClipboardCheck,
  inventory: Package,
} as const;

/** The project's icon: by starter, else a generic phone. */
export function ProjectIcon({
  starterSlug,
  size = "md",
}: {
  starterSlug: string | null;
  size?: "sm" | "md";
}) {
  const Icon =
    (starterSlug && (icons as Record<string, typeof BookOpen>)[starterSlug]) || Smartphone;
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl";
  return (
    <span
      aria-hidden="true"
      className={`flex ${box} shrink-0 items-center justify-center bg-accent-subtle text-accent-text`}
    >
      <Icon size={size === "sm" ? 16 : 20} strokeWidth={1.75} />
    </span>
  );
}
