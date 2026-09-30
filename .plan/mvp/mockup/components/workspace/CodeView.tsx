"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Lock } from "lucide-react";
import { foundationFiles, projectFiles, sampleSource } from "@/lib/mock";

const keyword = /\b(import|export|from|function|return|const|let|type|useState|useEffect|null)\b/g;

function highlight(src: string) {
  return src.split("\n").map((line, i) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = new RegExp(`${keyword.source}|("[^"]*"|\`[^\`]*\`)|(<\\/?[A-Z][A-Za-z]*)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      parts.push(line.slice(last, m.index));
      const cls = m[1] ? "text-[#b3421d]" : m[2] ? "text-[#1a7f5a]" : "text-[#3b5bdb]";
      parts.push(
        <span key={m.index} className={cls}>
          {m[0]}
        </span>,
      );
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last));
    return (
      <div key={i} className="flex">
        <span className="w-10 shrink-0 select-none pr-3 text-right text-faint">{i + 1}</span>
        <span className="whitespace-pre">{parts}</span>
      </div>
    );
  });
}

export function CodeView() {
  const [selected, setSelected] = useState(projectFiles[0]);
  const [foundationOpen, setFoundationOpen] = useState(false);

  return (
    <div className="flex h-full overflow-hidden rounded-card border border-line bg-surface">
      <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-line py-2 text-[13px]">
        <p className="px-4 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Project</p>
        {projectFiles.map((f) => (
          <button
            key={f}
            onClick={() => setSelected(f)}
            className={`flex w-full items-center gap-2 px-4 py-1.5 text-left ${
              selected === f ? "bg-accent-subtle font-medium" : "hover:bg-bg"
            }`}
          >
            <FileCode2 size={14} className={selected === f ? "text-accent" : "text-muted"} />
            <span className="truncate">{f.replace("src/", "")}</span>
          </button>
        ))}
        <button
          onClick={() => setFoundationOpen((v) => !v)}
          className="mt-3 flex w-full items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase hover:text-ink"
        >
          {foundationOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Foundation <Lock size={11} /> read-only
        </button>
        {foundationOpen &&
          foundationFiles.map((f) => (
            <div key={f} className="flex items-center gap-2 px-6 py-1.5 text-muted">
              <FileCode2 size={14} className="text-faint" />
              <span className="truncate">{f}</span>
            </div>
          ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-2 text-[12px] text-muted">
          <span className="font-mono">{selected}</span>
          <span>Read-only · from snapshot s3</span>
        </div>
        <pre className="scroll-thin p-4 font-mono text-[12.5px] leading-[1.6] text-ink">{highlight(sampleSource)}</pre>
      </div>
    </div>
  );
}
