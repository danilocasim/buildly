"use client";

// Read-only code tab (TODO 5.5.1): the snapshot's project files, the foundation files
// collapsed under a read-only group, and a highlighted viewer. No inputs anywhere.
import { ChevronDown, ChevronRight, FileCode2, Lock } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { useEffect, useState } from "react";

interface Files {
  snapshotId: string | null;
  project: Record<string, string>;
  foundation: Record<string, string>;
}

const languageFor = (path: string) =>
  path.endsWith(".json") ? "json" : path.endsWith(".tsx") ? "tsx" : "typescript";

export function CodeView({
  projectId,
  snapshotId,
}: {
  projectId: string;
  snapshotId: string | null;
}) {
  const [files, setFiles] = useState<Files>();
  const [selected, setSelected] = useState<string>();
  const [foundationOpen, setFoundationOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/files`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Files>) : undefined))
      .then((next) => {
        if (cancelled || !next) return;
        setFiles(next);
        setSelected((current) =>
          current && (current in next.project || current in next.foundation)
            ? current
            : Object.keys(next.project).sort()[0],
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, snapshotId]);

  const projectPaths = Object.keys(files?.project ?? {}).sort();
  const foundationPaths = Object.keys(files?.foundation ?? {}).sort();
  const source = selected ? (files?.project[selected] ?? files?.foundation[selected]) : undefined;
  const readOnlyFoundation = selected !== undefined && !(selected in (files?.project ?? {}));

  return (
    <div
      data-testid="code-view"
      className="flex h-full overflow-hidden rounded-card border border-line bg-surface"
    >
      <nav
        aria-label="Files"
        className="scroll-thin w-[240px] shrink-0 overflow-y-auto border-r border-line py-2 text-[13px]"
      >
        <p className="px-4 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
          Project
        </p>
        {files && projectPaths.length === 0 && (
          <p className="px-4 py-1.5 text-muted">No files yet.</p>
        )}
        {projectPaths.map((path) => (
          <FileButton
            key={path}
            path={path}
            label={path.replace(/^src\//, "")}
            selected={selected === path}
            onSelect={setSelected}
            group="project"
          />
        ))}
        <button
          type="button"
          onClick={() => setFoundationOpen((v) => !v)}
          aria-expanded={foundationOpen}
          className="mt-3 flex w-full items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase hover:text-ink"
        >
          {foundationOpen ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
          Foundation (read-only) <Lock size={11} aria-hidden="true" />
        </button>
        {foundationOpen &&
          foundationPaths.map((path) => (
            <FileButton
              key={path}
              path={path}
              label={path}
              selected={selected === path}
              onSelect={setSelected}
              group="foundation"
            />
          ))}
      </nav>
      <div className="scroll-thin min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-2 text-[12px] text-muted">
          <span className="font-mono" data-testid="code-path">
            {selected ?? ""}
          </span>
          <span>
            Read-only{readOnlyFoundation ? " · foundation" : ""}
            {files?.snapshotId ? ` · snapshot ${files.snapshotId.slice(0, 8)}` : ""}
          </span>
        </div>
        {source !== undefined ? (
          <Highlight code={source} language={languageFor(selected!)} theme={themes.github}>
            {({ tokens, getLineProps, getTokenProps }) => (
              <pre
                data-testid="code-source"
                className="p-4 font-mono text-[12.5px] leading-[1.6] text-ink"
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })} className="flex">
                    <span className="w-10 shrink-0 pr-3 text-right text-faint select-none">
                      {i + 1}
                    </span>
                    <span className="whitespace-pre">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        ) : (
          <p className="p-4 text-[13px] text-muted">
            {files ? "Select a file." : "Loading files…"}
          </p>
        )}
      </div>
    </div>
  );
}

function FileButton({
  path,
  label,
  selected,
  onSelect,
  group,
}: {
  path: string;
  label: string;
  selected: boolean;
  onSelect: (path: string) => void;
  group: "project" | "foundation";
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(path)}
      aria-current={selected ? "true" : undefined}
      data-testid={`file-${group}`}
      data-path={path}
      className={`flex w-full items-center gap-2 py-1.5 text-left ${group === "foundation" ? "px-6 text-muted" : "px-4"} ${
        selected ? "bg-accent-subtle font-medium text-ink" : "hover:bg-bg"
      }`}
    >
      <FileCode2
        size={14}
        aria-hidden="true"
        className={selected ? "text-accent-text" : "text-faint"}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
