import { useEffect, useMemo, useRef, useState } from "react";
import type { TextHunk } from "@mct/shared-types";

export interface DiffNav {
  /** 1-based line to reveal + highlight, with a monotonically increasing nonce. */
  line: number;
  side: "a" | "b";
  nonce: number;
}

interface Row {
  kind: "context" | "change" | "gap";
  aNo: number | null; // 1-based
  bNo: number | null;
  aText: string | null;
  bText: string | null;
  hunk?: TextHunk;
  gapCount?: number;
  gapStartA?: number; // 0-based first hidden line in A
  key: string;
}

const CONTEXT = 3;

export default function DiffWorkspace(props: {
  linesA: string[];
  linesB: string[];
  hunks: TextHunk[];
  ignoreWhitespace: boolean;
  onToggleWhitespace: () => void;
  nav: DiffNav | null;
  onLineClick: (side: "a" | "b", line1: number) => void;
  onExportUnified: () => void;
  onCopyChanges: () => void;
  copied: boolean;
}) {
  const { linesA, linesB, hunks } = props;
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  const [hunkCursor, setHunkCursor] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const sections = useMemo(() => {
    const names = new Set<string>();
    for (const h of hunks) {
      if (h.aSection) names.add(h.aSection);
      if (h.bSection) names.add(h.bSection);
    }
    return [...names].sort();
  }, [hunks]);

  const visibleHunks = useMemo(
    () =>
      sectionFilter === "all"
        ? hunks
        : hunks.filter(
            (h) => h.aSection === sectionFilter || h.bSection === sectionFilter,
          ),
    [hunks, sectionFilter],
  );

  const rows = useMemo(
    () => buildRows(linesA, linesB, visibleHunks, expandedGaps),
    [linesA, linesB, visibleHunks, expandedGaps],
  );

  // External navigation (from the semantic panel).
  useEffect(() => {
    if (!props.nav) return;
    const { line, side } = props.nav;
    // Expand any gap hiding the target.
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (r.kind !== "gap" || r.gapStartA === undefined) continue;
        const target0 = line - 1;
        const hiddenA = r.gapCount ?? 0;
        // Gap rows hide a contiguous equal run; expand if the target falls inside.
        if (
          (side === "a" &&
            target0 >= r.gapStartA &&
            target0 < r.gapStartA + hiddenA) ||
          (side === "b" && r.bNo === null)
        ) {
          next.add(r.key);
        }
      }
      return next;
    });
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(`${side}:${line}`);
      el?.scrollIntoView({ block: "center" });
      el?.classList.add("ring-2", "ring-blue-500");
      setTimeout(() => el?.classList.remove("ring-2", "ring-blue-500"), 1600);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nav?.nonce]);

  const jumpToHunk = (idx: number): void => {
    const h = visibleHunks[(idx + visibleHunks.length) % visibleHunks.length];
    if (!h) return;
    setHunkCursor((idx + visibleHunks.length) % visibleHunks.length);
    const anchor =
      h.aEnd > h.aStart ? `a:${h.aStart + 1}` : `b:${h.bStart + 1}`;
    // Ensure the hunk is visible (expand its gap if collapsed).
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (r.kind === "gap" && r.hunk === h) next.add(r.key);
      }
      return next;
    });
    requestAnimationFrame(() => {
      rowRefs.current.get(anchor)?.scrollIntoView({ block: "center" });
    });
  };

  const q = query.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in diff…"
          className="w-48 rounded border border-slate-300 px-2 py-1"
        />
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
          title="Filter hunks by section"
        >
          <option value="all">All sections ({hunks.length} hunks)</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              *{s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-slate-600">
          <input
            type="checkbox"
            checked={props.ignoreWhitespace}
            onChange={props.onToggleWhitespace}
          />
          Ignore whitespace
        </label>
        <span className="text-slate-400">|</span>
        <button
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          onClick={() => jumpToHunk(hunkCursor - 1)}
        >
          ▲ Prev
        </button>
        <button
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          onClick={() => jumpToHunk(hunkCursor + 1)}
        >
          ▼ Next
        </button>
        <span className="text-slate-400">|</span>
        <button
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          onClick={props.onExportUnified}
        >
          Export unified diff
        </button>
        <button
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          onClick={props.onCopyChanges}
        >
          {props.copied ? "Copied ✓" : "Copy changes"}
        </button>
      </div>

      <div
        ref={scroller}
        className="diff-scroll max-h-[62vh] overflow-auto rounded-lg border border-slate-300 bg-white"
      >
        <div className="code-font min-w-[900px]">
          <div className="sticky top-0 grid grid-cols-2 bg-slate-100 text-[11px] font-semibold text-slate-600">
            <div className="border-r border-slate-300 px-2 py-1">A · reference</div>
            <div className="px-2 py-1">B · modified</div>
          </div>
          {rows.map((r) =>
            r.kind === "gap" ? (
              <GapRow
                key={r.key}
                row={r}
                onExpand={() =>
                  setExpandedGaps((prev) => new Set(prev).add(r.key))
                }
              />
            ) : (
              <div key={r.key} className="grid grid-cols-2 border-b border-slate-100">
                <CodeCell
                  side="a"
                  lineNo={r.aNo}
                  text={r.aText}
                  query={q}
                  changed={r.kind === "change"}
                  rowKey={r.aNo !== null ? `a:${r.aNo}` : r.key}
                  register={rowRefs.current}
                  onClick={props.onLineClick}
                  hunkSection={r.hunk?.aSection}
                />
                <CodeCell
                  side="b"
                  lineNo={r.bNo}
                  text={r.bText}
                  query={q}
                  changed={r.kind === "change"}
                  rowKey={r.bNo !== null ? `b:${r.bNo}` : r.key}
                  register={rowRefs.current}
                  onClick={props.onLineClick}
                  hunkSection={r.hunk?.bSection}
                />
              </div>
            ),
          )}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No differences{sectionFilter !== "all" ? ` in *${sectionFilter}` : ""}.
            </div>
          )}
        </div>
      </div>
      <div className="text-[11px] text-slate-400">
        Click a line to locate its semantic record. Equal regions are collapsed;
        expanders reveal full context.
      </div>
    </div>
  );
}

function buildRows(
  linesA: string[],
  linesB: string[],
  hunks: TextHunk[],
  expanded: Set<string>,
): Row[] {
  const rows: Row[] = [];
  // Walk hunks in order, emitting context rows around each and gap rows
  // between hunk windows.
  let cursorA = 0;
  let cursorB = 0;
  hunks.forEach((h, hi) => {
    const ctxA0 = Math.max(cursorA, h.aStart - CONTEXT);
    const ctxB0 = Math.max(cursorB, h.bStart - CONTEXT);
    if (ctxA0 > cursorA) {
      const key = `gap-${hi}`;
      if (expanded.has(key)) {
        for (let a = cursorA, b = ctxB0 - (ctxA0 - a); a < ctxA0; a++, b++) {
          rows.push({
            kind: "context",
            aNo: a + 1,
            bNo: b + 1,
            aText: linesA[a],
            bText: linesB[b],
            key: `ctx-${a}-${b}`,
          });
        }
      } else {
        rows.push({
          kind: "gap",
          aNo: null,
          bNo: null,
          aText: null,
          bText: null,
          gapCount: ctxA0 - cursorA,
          gapStartA: cursorA,
          hunk: h,
          key,
        });
      }
    }
    for (let a = ctxA0; a < h.aStart; a++) {
      const b = ctxB0 + (a - ctxA0);
      rows.push({
        kind: "context",
        aNo: a + 1,
        bNo: b + 1,
        aText: linesA[a],
        bText: linesB[b],
        key: `ctx-${a}-${b}`,
      });
    }
    const pairs = Math.max(h.aEnd - h.aStart, h.bEnd - h.bStart);
    for (let k = 0; k < pairs; k++) {
      const a = h.aStart + k;
      const b = h.bStart + k;
      rows.push({
        kind: "change",
        aNo: a < h.aEnd ? a + 1 : null,
        bNo: b < h.bEnd ? b + 1 : null,
        aText: a < h.aEnd ? linesA[a] : null,
        bText: b < h.bEnd ? linesB[b] : null,
        hunk: h,
        key: `chg-${hi}-${k}`,
      });
    }
    const ctxA1 = Math.min(
      linesA.length,
      hi + 1 < hunks.length ? Math.min(h.aEnd + CONTEXT, hunks[hi + 1].aStart - 0) : h.aEnd + CONTEXT,
    );
    // Trailing context, clipped at the next hunk's leading context.
    const nextLead =
      hi + 1 < hunks.length ? hunks[hi + 1].aStart - CONTEXT : linesA.length;
    const endA = Math.min(ctxA1, Math.max(h.aEnd, nextLead));
    for (let a = h.aEnd; a < endA; a++) {
      const b = h.bEnd + (a - h.aEnd);
      rows.push({
        kind: "context",
        aNo: a + 1,
        bNo: b + 1,
        aText: linesA[a],
        bText: linesB[b],
        key: `ctx-${a}-${b}`,
      });
    }
    cursorA = endA;
    cursorB = h.bEnd + (endA - h.aEnd);
  });
  if (cursorA < linesA.length) {
    const key = `gap-end`;
    if (expanded.has(key)) {
      for (let a = cursorA; a < linesA.length; a++) {
        const b = cursorB + (a - cursorA);
        rows.push({
          kind: "context",
          aNo: a + 1,
          bNo: b !== null && b < linesB.length ? b + 1 : null,
          aText: linesA[a],
          bText: b < linesB.length ? linesB[b] : null,
          key: `ctx-${a}-${b}`,
        });
      }
    } else {
      rows.push({
        kind: "gap",
        aNo: null,
        bNo: null,
        aText: null,
        bText: null,
        gapCount: linesA.length - cursorA,
        gapStartA: cursorA,
        key,
      });
    }
  }
  return rows;
}

function GapRow(props: { row: Row; onExpand: () => void }) {
  return (
    <button
      onClick={props.onExpand}
      className="grid w-full grid-cols-2 border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500 hover:bg-slate-100"
    >
      <span className="px-2 py-0.5">
        ⋯ {props.row.gapCount} unchanged lines (expand)
      </span>
      <span className="px-2 py-0.5">⋯</span>
    </button>
  );
}

function CodeCell(props: {
  side: "a" | "b";
  lineNo: number | null;
  text: string | null;
  query: string;
  changed: boolean;
  rowKey: string;
  register: Map<string, HTMLDivElement>;
  onClick: (side: "a" | "b", line1: number) => void;
  hunkSection?: string;
}) {
  const { lineNo, text } = props;
  const empty = text === null;
  const bg = empty
    ? "bg-slate-100"
    : props.changed
      ? props.side === "a"
        ? "bg-red-50"
        : "bg-green-50"
      : "bg-white";
  return (
    <div
      ref={(el) => {
        if (el) props.register.set(props.rowKey, el);
      }}
      onClick={() => {
        if (lineNo !== null) props.onClick(props.side, lineNo);
      }}
      title={props.hunkSection ? `*${props.hunkSection}` : undefined}
      className={`code-row flex ${bg} ${lineNo !== null ? "cursor-pointer hover:brightness-95" : ""} ${
        props.side === "a" ? "border-r border-slate-300" : ""
      }`}
    >
      <span className="w-12 shrink-0 select-none px-1 text-right text-slate-400">
        {lineNo ?? ""}
      </span>
      <span className="flex-1 overflow-x-visible px-1">
        {text === null ? "" : highlight(text, props.query)}
      </span>
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const hit = lower.indexOf(query, i);
    if (hit < 0) {
      out.push(text.slice(i));
      break;
    }
    out.push(text.slice(i, hit));
    out.push(
      <mark key={k++} className="rounded-sm bg-yellow-300">
        {text.slice(hit, hit + query.length)}
      </mark>,
    );
    i = hit + query.length;
  }
  return out;
}
