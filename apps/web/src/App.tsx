import { useEffect, useMemo, useState } from "react";
import { toUnifiedDiff } from "@mct/diff";
import {
  download,
  engineApi,
  useEngine,
  type Inventory,
  type RuleInfo,
  type SemanticDiffData,
} from "./engine";
import ConversionPanel from "./components/ConversionPanel";
import DiffWorkspace, { type DiffNav } from "./components/DiffWorkspace";
import type { PickedFile } from "./components/FileDropZone";
import SemanticDiffPanel from "./components/SemanticDiffPanel";
import ValidationReport from "./components/ValidationReport";
import WorkspaceTab, { type VersionChoice } from "./components/WorkspaceTab";
import type { TextDiffResult } from "@mct/shared-types";

type Tab = "workspace" | "compare" | "convert" | "reports";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "workspace", label: "1 · Workspace" },
  { id: "compare", label: "2 · Compare" },
  { id: "convert", label: "3 · Convert" },
  { id: "reports", label: "4 · Validate" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("workspace");
  const [fileA, setFileA] = useState<PickedFile | null>(null);
  const [fileB, setFileB] = useState<PickedFile | null>(null);
  const [versionA, setVersionA] = useState<VersionChoice>("auto");
  const [versionB, setVersionB] = useState<VersionChoice>("auto");

  const invA = useEngine<Inventory>(
    fileA ? `A:${fileA.name}:${fileA.text.length}` : null,
    () => engineApi.inventory(fileA!.name, fileA!.text),
  );
  const invB = useEngine<Inventory>(
    fileB ? `B:${fileB.name}:${fileB.text.length}` : null,
    () => engineApi.inventory(fileB!.name, fileB!.text),
  );
  const [rules, setRules] = useState<RuleInfo[]>([]);
  useEffect(() => {
    engineApi.rules().then(setRules, () => setRules([]));
  }, []);

  const detectedA = invA.data?.detected ?? "…";
  const detectedB = invB.data?.detected ?? "…";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              MCT Diff Studio
            </h1>
            <p className="text-xs text-slate-500">
              MIDAS CIVIL 2022 ↔ 2025 · text diff · semantic diff · audited conversion
            </p>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                disabled={t.id !== "workspace" && (!fileA || !fileB)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  tab === t.id
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === "workspace" && (
          <WorkspaceTab
            fileA={fileA}
            fileB={fileB}
            versionA={versionA}
            versionB={versionB}
            onPickA={setFileA}
            onPickB={setFileB}
            onClearA={() => setFileA(null)}
            onClearB={() => setFileB(null)}
            onVersionA={setVersionA}
            onVersionB={setVersionB}
            onCompare={() => setTab("compare")}
          />
        )}

        {tab === "compare" && fileA && fileB && (
          <CompareTab
            fileA={fileA}
            fileB={fileB}
            versionA={versionA === "auto" ? detectedA : versionA}
            versionB={versionB === "auto" ? detectedB : versionB}
          />
        )}

        {tab === "convert" && (
          <ConversionPanel
            fileA={fileA}
            fileB={fileB}
            detectedA={detectedA}
            detectedB={detectedB}
            rules={rules}
            onAdoptOutput={(name, text) => {
              setFileB({ name, text });
              setVersionB("auto");
              setTab("compare");
            }}
          />
        )}

        {tab === "reports" && <ValidationReport fileA={fileA} fileB={fileB} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-[11px] text-slate-400">
        All processing happens locally in your browser (engine runs in a Web
        Worker). Converted models must be re-validated inside MIDAS CIVIL and
        reviewed by a qualified engineer before professional use.
      </footer>
    </div>
  );
}

function CompareTab(props: {
  fileA: PickedFile;
  fileB: PickedFile;
  versionA: string;
  versionB: string;
}) {
  const [view, setView] = useState<"text" | "semantic">("text");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [nav, setNav] = useState<DiffNav | null>(null);
  const [navNonce, setNavNonce] = useState(0);
  const [copied, setCopied] = useState(false);

  const linesA = useMemo(() => props.fileA.text.split("\n"), [props.fileA]);
  const linesB = useMemo(() => props.fileB.text.split("\n"), [props.fileB]);

  const textKey = `text:${props.fileA.name}:${props.fileA.text.length}:${props.fileB.name}:${props.fileB.text.length}:ws=${ignoreWhitespace}`;
  const textDiff = useEngine<TextDiffResult>(textKey, () =>
    engineApi.textDiff(props.fileA.text, props.fileB.text, ignoreWhitespace),
  );

  const semKey = `sem:${props.fileA.name}:${props.fileA.text.length}:${props.fileB.name}:${props.fileB.text.length}`;
  const semantic = useEngine<SemanticDiffData>(semKey, () =>
    engineApi.semanticDiff(props.fileA.text, props.fileB.text),
  );

  const unified = useMemo(() => {
    if (!textDiff.data) return "";
    return toUnifiedDiff(
      props.fileA.name,
      props.fileB.name,
      linesA,
      linesB,
      textDiff.data.hunks,
    );
  }, [textDiff.data, linesA, linesB, props.fileA.name, props.fileB.name]);

  const jumpToLine = (side: "a" | "b", line1: number): void => {
    setView("text");
    setNavNonce((n) => n + 1);
    setNav({ side, line: line1, nonce: navNonce + 1 });
  };

  const loading = textDiff.loading || semantic.loading;
  const error = textDiff.error ?? semantic.error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-mono text-xs">
          <span className="font-semibold text-blue-700">A:{props.fileA.name}</span>
          <span className="text-slate-400"> ({props.versionA})</span>
          {" ↔ "}
          <span className="font-semibold text-amber-700">B:{props.fileB.name}</span>
          <span className="text-slate-400"> ({props.versionB})</span>
        </span>
        <span className="text-slate-300">|</span>
        <button
          onClick={() => setView("text")}
          className={`rounded px-3 py-1 text-sm font-medium ${view === "text" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Text diff
          {textDiff.data ? ` (${textDiff.data.hunks.length})` : ""}
        </button>
        <button
          onClick={() => setView("semantic")}
          className={`rounded px-3 py-1 text-sm font-medium ${view === "semantic" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Semantic diff
          {semantic.data ? ` (${semantic.data.changes.length.toLocaleString()})` : ""}
        </button>
        {loading && <span className="text-xs text-slate-500">Computing…</span>}
      </div>

      {semantic.data && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <SummaryChip label="equivalent" value={semantic.data.summary.equivalent} tone="green" />
          <SummaryChip label="modified" value={semantic.data.summary.modified} tone="amber" />
          <SummaryChip label="added" value={semantic.data.summary.added} tone="blue" />
          <SummaryChip label="removed" value={semantic.data.summary.removed} tone="red" />
          <SummaryChip label="unclassified" value={semantic.data.summary.unclassified} tone="purple" />
          <span className="rounded bg-slate-200 px-2 py-1 font-semibold text-slate-700">
            {textDiff.data
              ? `+${(textDiff.data.added + textDiff.data.modifiedAfter).toLocaleString()} / −${(textDiff.data.deleted + textDiff.data.modifiedBefore).toLocaleString()} lines`
              : "…"}
          </span>
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      {view === "text" && textDiff.data && (
        <DiffWorkspace
          linesA={linesA}
          linesB={linesB}
          hunks={textDiff.data.hunks}
          ignoreWhitespace={ignoreWhitespace}
          onToggleWhitespace={() => setIgnoreWhitespace((v) => !v)}
          nav={nav}
          onLineClick={(side, line1) => {
            // Find the semantic change covering this line and select it.
            const hit = semantic.data?.changes.find((c) =>
              side === "a"
                ? (c.aLines ?? []).includes(line1)
                : (c.bLines ?? []).includes(line1),
            );
            if (hit) {
              setSelectedKey(`${hit.section}｜${hit.key}`);
              setView("semantic");
            }
          }}
          onExportUnified={() =>
            download(
              `${props.fileA.name}__vs__${props.fileB.name}.diff`,
              unified,
            )
          }
          onCopyChanges={() => {
            navigator.clipboard?.writeText(unified).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setCopied(false),
            );
          }}
          copied={copied}
        />
      )}

      {view === "semantic" && semantic.data && (
        <SemanticDiffPanel
          changes={semantic.data.changes}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onJumpToLine={jumpToLine}
        />
      )}
    </div>
  );
}

function SummaryChip(props: {
  label: string;
  value: number;
  tone: "green" | "amber" | "blue" | "red" | "purple";
}) {
  const tones = {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
    purple: "bg-purple-100 text-purple-800",
  } as const;
  return (
    <span className={`rounded px-2 py-1 font-semibold ${tones[props.tone]}`}>
      {props.value.toLocaleString()} {props.label}
    </span>
  );
}
