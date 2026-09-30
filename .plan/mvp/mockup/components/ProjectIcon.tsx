import { BookOpen, FileText, Package } from "lucide-react";
import type { ProjectIcon as Kind } from "@/lib/mock";

const icons = { book: BookOpen, file: FileText, box: Package };

export function ProjectIcon({ kind, size = "md" }: { kind: Kind; size?: "sm" | "md" }) {
  const Icon = icons[kind];
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center bg-accent-subtle text-accent`}>
      <Icon size={size === "sm" ? 16 : 20} strokeWidth={1.75} />
    </span>
  );
}
