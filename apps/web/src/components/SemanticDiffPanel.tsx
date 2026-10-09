import { useMemo, useState } from "react";
import { semanticCsv, semanticJson } from "@mct/diff";
import type { SemanticChange, SemanticStatus } from "@mct/shared-types";
import { download } from "../engine";

const STATUS_STYLE: Record<SemanticStatus, string> = {
  equivalent: "bg-green-100 text-green-800",
  modified: "bg-amber-100 text-amber-800",
  added: "bg-blue-100 text-blue-800",
  removed: "bg-red-100 text-red-800",
  unclassified: "bg-purple-100 text-purple-800",
};

export default function SemanticDiffPanel(props: {
  changes: SemanticChange[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onJumpToLine: (side: "a" | "b", line1: number) => void;
  exportBase: string;
}) {
  const [statuses, setStatuses] = useState<Set<SemanticStatus>>(
    new Set(["modified", "added", "removed", "unclassified"]),
  );
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set(props.changes.map((c) => c.category));
    return [...set].sort();
  }, [props.changes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.changes.filter(
      (c) =>
        statuses.has(c.status) &&
        (category === "all" || c.category === category) &&
        (q === "" ||
          c.label.toLowerCase().includes(q) ||
          c.section.toLowerCase().includes(q) ||
          c.key.toLowerCase().includes(q)),
    );
  }, [props.changes, statuses, category, query]);

  const selected = props.changes.find(
    (c) => `${c.section}｜${c.key}` === props.selectedKey,
  );

  const toggle = (s: SemanticStatus): void => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by label, section, key…"
            className="w-56 rounded border border-slate-300 px-2 py-1"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {(["modified", "added", "removed", "unclassified"] as SemanticStatus[]).map(
            (s) => (
              <label key={s} className="flex items-center gap-1 text-slate-600">
                <input
                  type="checkbox"
                  checked={statuses.has(s)}
                  onChange={() => toggle(s)}
                />
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s]}`}>
                  {s}
                </span>
              </label>
            ),
          )}
          <span className="text-slate-400">
            {filtered.length.toLocaleString()} / {props.changes.length.toLocaleString()}
          </span>
          <span className="text-slate-300">|</span>
          <button
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
            title="Download the currently filtered changes as CSV (one row per field)"
            onClick={() =>
              download(
                `${props.exportBase}.semantic.csv`,
                semanticCsv(filtered),
                "text/csv",
              )
            }
          >
            Export CSV ({filtered.length.toLocaleString()})
          </button>
          <button
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
            title="Download the currently filtered changes as JSON"
            onClick={() =>
              download(
                `${props.exportBase}.semantic.json`,
                semanticJson(filtered),
                "application/json",
              )
            }
          >
            Export JSON
          </button>
        </div>
        <div className="diff-scroll max-h-[62vh] overflow-auto rounded-lg border border-slate-300 bg-white">
          {filtered.slice(0, 2000).map((c) => {
            const key = `${c.section}｜${c.key}`;
            const active = key === props.selectedKey;
            return (
              <button
                key={key}
                onClick={() => props.onSelect(active ? null : key)}
                className={`block w-full border-b border-slate-100 px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${
                  active ? "bg-blue-50" : ""
                }`}
              >
                <span
                  className={`mr-2 inline-block w-20 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${STATUS_STYLE[c.status]}`}
                >
                  {c.status}
                </span>
                <span className="font-mono font-semibold text-slate-800">{c.label}</span>
                <span className="ml-2 text-slate-400">
                  {c.category} · *{c.section}
                  {c.fields ? ` · ${c.fields.length} field(s)` : ""}
                </span>
              </button>
            );
          })}
          {filtered.length > 2000 && (
            <div className="px-3 py-2 text-xs text-slate-500">
              … {(filtered.length - 2000).toLocaleString()} further changes hidden;
              narrow the filters.
            </div>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No changes match the current filters.
            </div>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-slate-300 bg-white p-3">
        {!selected ? (
          <div className="py-8 text-center text-sm text-slate-400">
            Select a change to inspect field-level differences.
          </div>
        ) : (
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[selected.status]}`}
              >
                {selected.status}
              </span>
              <span className="font-mono text-sm font-semibold text-slate-800">
                {selected.label}
              </span>
            </div>
            <div className="mt-1 text-slate-500">
              {selected.category} · *{selected.section} · key{" "}
              <span className="font-mono">{selected.key}</span>
            </div>
            {selected.note && (
              <div className="mt-2 rounded bg-purple-50 px-2 py-1.5 text-purple-900">
                {selected.note}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {selected.aLines?.[0] !== undefined && (
                <button
                  className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                  onClick={() => props.onJumpToLine("a", selected.aLines![0])}
                >
                  Show in text diff (A:{selected.aLines[0]})
                </button>
              )}
              {selected.bLines?.[0] !== undefined && (
                <button
                  className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                  onClick={() => props.onJumpToLine("b", selected.bLines![0])}
                >
                  Show in text diff (B:{selected.bLines[0]})
                </button>
              )}
            </div>
            {selected.fields && selected.fields.length > 0 ? (
              <table className="mt-2 w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">field</th>
                    <th className="py-1 pr-2">A</th>
                    <th className="py-1">B</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.fields.slice(0, 120).map((f, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="py-0.5 pr-2 text-slate-600">{f.field}</td>
                      <td className="max-w-[140px] break-all bg-red-50 py-0.5 pr-2">
                        {f.before === "" ? <span className="text-slate-400">∅</span> : f.before}
                      </td>
                      <td className="max-w-[140px] break-all bg-green-50 py-0.5">
                        {f.after === "" ? <span className="text-slate-400">∅</span> : f.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-slate-500">
                No field-level differences (presence-only change).
              </div>
            )}
            {selected.fields && selected.fields.length > 120 && (
              <div className="mt-1 text-slate-400">
                … {selected.fields.length - 120} further fields.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

